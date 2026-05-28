using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Jellyfin.Plugin.Letterboxd.Services;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Letterboxd.Controllers;

/// <summary>Corps de la requête de connexion Letterboxd.</summary>
public sealed class ConnectRequest
{
    /// <summary>ID utilisateur Jellyfin.</summary>
    public string? UserId { get; set; }
    /// <summary>Nom d'utilisateur Letterboxd.</summary>
    public string? Username { get; set; }
    /// <summary>Mot de passe Letterboxd.</summary>
    public string? Password { get; set; }
    /// <summary>Cookies navigateur (fallback Cloudflare).</summary>
    public string? CookieString { get; set; }
}

/// <summary>Corps de la requête de journalisation.</summary>
public sealed class LogRequest
{
    /// <summary>ID utilisateur Jellyfin.</summary>
    public string? UserId  { get; set; }
    /// <summary>ID TMDB du film.</summary>
    public string? TmdbId  { get; set; }
    /// <summary>ID IMDB du film.</summary>
    public string? ImdbId  { get; set; }
    /// <summary>Titre du film (fallback).</summary>
    public string? Title   { get; set; }
    /// <summary>Année de production (fallback).</summary>
    public int?    Year    { get; set; }
    /// <summary>Note de 0 (pas de note) à 5 étoiles (demi-étoiles acceptées : 0.5, 1, 1.5…).</summary>
    public double  Rating  { get; set; }
}

/// <summary>Endpoints du plugin Letterboxd.</summary>
[ApiController]
[Route("JfLetterboxd")]
public sealed class LetterboxdController : ControllerBase
{
    private readonly LetterboxdService _lb;
    private readonly PendingRatingStore _pending;

    /// <summary>Initializes a new instance of the <see cref="LetterboxdController"/> class.</summary>
    public LetterboxdController(LetterboxdService lb, PendingRatingStore pending)
    {
        _lb      = lb;
        _pending = pending;
    }

    /// <summary>Sert le script widget.js.</summary>
    [HttpGet("widget.js")]
    public IActionResult GetWidget()
    {
        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.Letterboxd.Web.widget.js");
        if (stream is null) return NotFound();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return Content(reader.ReadToEnd(), "application/javascript; charset=utf-8");
    }

    /// <summary>Retourne le statut de connexion.</summary>
    [HttpGet("status")]
    public IActionResult GetStatus([FromQuery] string userId)
    {
        if (string.IsNullOrEmpty(userId)) return BadRequest(new { error = "userId requis" });
        var session = _lb.GetSession(userId);
        return Ok(new
        {
            connected  = session is not null,
            username   = session?.LetterboxdUsername ?? string.Empty,
            avatarUrl  = session?.AvatarUrl ?? string.Empty,
            apiEnabled = session?.HasApiToken ?? false,
        });
    }

    /// <summary>Connecte un utilisateur à Letterboxd (API officielle ou cookies).</summary>
    [HttpPost("connect")]
    public async Task<IActionResult> Connect([FromBody] ConnectRequest req)
    {
        if (string.IsNullOrEmpty(req.UserId)) return BadRequest(new { error = "userId requis" });

        if (!string.IsNullOrEmpty(req.CookieString))
        {
            var (ok, err, username) = await _lb.ConnectWithCookiesAsync(req.UserId, req.CookieString).ConfigureAwait(false);
            if (!ok) return BadRequest(new { error = err });
            var ses = _lb.GetSession(req.UserId);
            return Ok(new { success = true, username, avatarUrl = ses?.AvatarUrl ?? string.Empty });
        }

        if (!string.IsNullOrEmpty(req.Username))
        {
            var (ok, err, username) = await _lb.LoginAsync(req.UserId, req.Username, req.Password ?? string.Empty).ConfigureAwait(false);
            if (!ok) return BadRequest(new { error = err });
            var ses = _lb.GetSession(req.UserId);
            return Ok(new { success = true, username, avatarUrl = ses?.AvatarUrl ?? string.Empty });
        }

        return BadRequest(new { error = "Identifiants requis" });
    }

    /// <summary>Déconnecte un utilisateur.</summary>
    [HttpDelete("disconnect")]
    public IActionResult Disconnect([FromQuery] string userId)
    {
        if (string.IsNullOrEmpty(userId)) return BadRequest(new { error = "userId requis" });
        _lb.DeleteSession(userId);
        return Ok(new { success = true });
    }

    /// <summary>Retourne le film en attente de notation.</summary>
    [HttpGet("pending")]
    public IActionResult GetPending([FromQuery] string userId)
    {
        if (string.IsNullOrEmpty(userId)) return BadRequest(new { error = "userId requis" });
        if (_lb.GetSession(userId) is null) return Ok(new { hasPending = false });
        var r = _pending.Get(userId);
        if (r is null) return Ok(new { hasPending = false });
        return Ok(new
        {
            hasPending = true,
            movie = new { r.ItemId, r.Title, r.Year, r.ImdbId, r.TmdbId },
        });
    }

    /// <summary>Efface la notation en attente.</summary>
    [HttpDelete("pending")]
    public IActionResult ClearPending([FromQuery] string userId)
    {
        if (!string.IsNullOrEmpty(userId)) _pending.Clear(userId);
        return Ok(new { success = true });
    }

    /// <summary>Enregistre un film dans le journal Letterboxd.</summary>
    [HttpPost("log")]
    public async Task<IActionResult> Log([FromBody] LogRequest req)
    {
        if (string.IsNullOrEmpty(req.UserId)) return BadRequest(new { error = "userId requis" });

        var session = _lb.GetSession(req.UserId);
        if (session is null) return Unauthorized(new { error = "Non connecté à Letterboxd" });

        // Résolution du film (IMDB > TMDB > titre)
        string? filmLid = null;

        if (!string.IsNullOrEmpty(req.ImdbId))
            filmLid = await _lb.FindFilmByImdbAsync(req.ImdbId, session).ConfigureAwait(false);

        if (filmLid is null && !string.IsNullOrEmpty(req.TmdbId))
            filmLid = await _lb.FindFilmByTmdbAsync(req.TmdbId, session).ConfigureAwait(false);

        if (filmLid is null && !string.IsNullOrEmpty(req.Title))
            filmLid = await _lb.FindFilmByTitleAsync(req.Title, req.Year, session).ConfigureAwait(false);

        if (filmLid is null)
            return NotFound(new { error = "Film introuvable sur Letterboxd" });

        // Session API : enregistrement direct côté serveur
        if (session.HasApiToken)
        {
            var (ok, err) = await _lb.LogFilmAsync(filmLid, req.Rating, session).ConfigureAwait(false);
            if (ok) return Ok(new { success = true });
            return BadRequest(new { error = err });
        }

        // Session cookie uniquement : le navigateur soumet le formulaire directement
        var csrf  = CsrfFromCookies(session.CookieString ?? string.Empty);
        var today = System.DateTime.Today.ToString("yyyy-MM-dd");
        var ratingInternal = (int)System.Math.Clamp(System.Math.Round(req.Rating * 2), 0, 10);
        var titleSlug = string.IsNullOrEmpty(req.Title) ? filmLid
            : System.Text.RegularExpressions.Regex.Replace(req.Title.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        var lbSlug = req.Year.HasValue ? $"{titleSlug}-{req.Year}" : titleSlug;
        return Ok(new { action = "client_submit", filmId = filmLid, csrf, date = today, rating = ratingInternal, lbSlug });
    }

    private static string CsrfFromCookies(string cookieStr)
    {
        foreach (var part in cookieStr.Split(';'))
        {
            var kv = part.Trim().Split('=', 2);
            if (kv.Length == 2 && kv[0].Trim().Equals("com.xk72.webparts.csrf", System.StringComparison.OrdinalIgnoreCase))
                return kv[1].Trim();
        }
        return string.Empty;
    }
}

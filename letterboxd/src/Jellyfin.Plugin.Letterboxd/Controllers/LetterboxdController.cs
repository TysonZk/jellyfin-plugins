using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Jellyfin.Plugin.Letterboxd.Services;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Letterboxd.Controllers;

// ── Request bodies ────────────────────────────────────────────────────────────

/// <summary>Corps de la requête de connexion Letterboxd par cookie navigateur.</summary>
public sealed class ConnectRequest
{
    /// <summary>ID utilisateur Jellyfin.</summary>
    public string? UserId       { get; set; }
    /// <summary>Chaîne de cookies copiée depuis le navigateur (header Cookie).</summary>
    public string? CookieString { get; set; }
}

/// <summary>Corps de la requête de journalisation d'un film.</summary>
public sealed class LogRequest
{
    /// <summary>ID utilisateur Jellyfin.</summary>
    public string? UserId  { get; set; }
    /// <summary>ID TMDB du film (optionnel).</summary>
    public string? TmdbId  { get; set; }
    /// <summary>ID IMDB du film (optionnel).</summary>
    public string? ImdbId  { get; set; }
    /// <summary>Titre du film (fallback recherche).</summary>
    public string? Title   { get; set; }
    /// <summary>Année de production (fallback recherche).</summary>
    public int?    Year    { get; set; }
    /// <summary>Note de 0 (pas de note) à 5 étoiles.</summary>
    public int     Rating  { get; set; }
}

// ── Controller ────────────────────────────────────────────────────────────────

/// <summary>Endpoints du plugin Letterboxd.</summary>
[ApiController]
[Route("JfLetterboxd")]
public sealed class LetterboxdController : ControllerBase
{
    private readonly LetterboxdService _lb;

    /// <summary>Initializes a new instance of the <see cref="LetterboxdController"/> class.</summary>
    public LetterboxdController(LetterboxdService lb) => _lb = lb;

    // ── widget.js ─────────────────────────────────────────────────────────────

    /// <summary>Sert le script widget.js.</summary>
    [HttpGet("widget.js")]
    public IActionResult GetWidget()
    {
        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.Letterboxd.Web.widget.js");
        if (stream is null) return NotFound();

        using var reader = new StreamReader(stream, Encoding.UTF8);
        var js = reader.ReadToEnd();

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return Content(js, "application/javascript; charset=utf-8");
    }

    // ── Statut de connexion ───────────────────────────────────────────────────

    /// <summary>Retourne si l'utilisateur est connecté à Letterboxd.</summary>
    [HttpGet("status")]
    public IActionResult GetStatus([FromQuery] string userId)
    {
        if (string.IsNullOrEmpty(userId))
            return BadRequest(new { error = "userId requis" });

        var session = _lb.GetSession(userId);
        return Ok(new
        {
            connected = session is not null,
            username  = session?.LetterboxdUsername ?? string.Empty,
        });
    }

    // ── Connexion ─────────────────────────────────────────────────────────────

    /// <summary>Connecte un utilisateur Jellyfin à Letterboxd via ses cookies navigateur.</summary>
    [HttpPost("connect")]
    public async Task<IActionResult> Connect([FromBody] ConnectRequest req)
    {
        if (string.IsNullOrEmpty(req.UserId) || string.IsNullOrEmpty(req.CookieString))
            return BadRequest(new { error = "userId et cookieString requis" });

        var (ok, err, username) = await _lb.ConnectWithCookiesAsync(req.UserId, req.CookieString)
            .ConfigureAwait(false);

        if (!ok) return BadRequest(new { error = err });

        return Ok(new { success = true, username = username ?? string.Empty });
    }

    // ── Déconnexion ───────────────────────────────────────────────────────────

    /// <summary>Déconnecte un utilisateur de Letterboxd.</summary>
    [HttpDelete("disconnect")]
    public IActionResult Disconnect([FromQuery] string userId)
    {
        if (string.IsNullOrEmpty(userId))
            return BadRequest(new { error = "userId requis" });

        _lb.DeleteSession(userId);
        return Ok(new { success = true });
    }

    // ── Journalisation ────────────────────────────────────────────────────────

    /// <summary>Enregistre un film dans le journal Letterboxd de l'utilisateur.</summary>
    [HttpPost("log")]
    public async Task<IActionResult> Log([FromBody] LogRequest req)
    {
        if (string.IsNullOrEmpty(req.UserId))
            return BadRequest(new { error = "userId requis" });

        var session = _lb.GetSession(req.UserId);
        if (session is null)
            return Unauthorized(new { error = "Non connecté à Letterboxd" });

        // Résolution du film (IMDB > TMDB > titre)
        string? filmId = null;

        if (!string.IsNullOrEmpty(req.ImdbId))
            filmId = await _lb.FindFilmByImdbAsync(req.ImdbId, session.CookieString)
                .ConfigureAwait(false);

        if (filmId is null && !string.IsNullOrEmpty(req.TmdbId))
            filmId = await _lb.FindFilmByTmdbAsync(req.TmdbId, session.CookieString)
                .ConfigureAwait(false);

        if (filmId is null && !string.IsNullOrEmpty(req.Title))
            filmId = await _lb.FindFilmByTitleAsync(req.Title, req.Year, session.CookieString)
                .ConfigureAwait(false);

        if (filmId is null)
            return NotFound(new { error = "Film introuvable sur Letterboxd" });

        var (ok, err) = await _lb.LogFilmAsync(filmId, req.Rating, session.CookieString)
            .ConfigureAwait(false);

        if (!ok) return BadRequest(new { error = err });

        return Ok(new { success = true });
    }
}

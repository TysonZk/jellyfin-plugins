using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Jellyfin.Plugin.Letterboxd.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Letterboxd.Services;

/// <summary>
/// Gère les sessions Letterboxd par cookie navigateur.
/// Letterboxd utilise Cloudflare Managed Challenge côté serveur —
/// la seule méthode fiable est de passer les cookies du navigateur utilisateur.
/// </summary>
public sealed class LetterboxdService
{
    private const string LbBase = "https://letterboxd.com";
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36";

    private static readonly JsonSerializerOptions _jsonOpts = new() { WriteIndented = true };

    private readonly ILogger<LetterboxdService> _logger;
    private readonly string _dataDir;

    /// <summary>Initializes a new instance of the <see cref="LetterboxdService"/> class.</summary>
    public LetterboxdService(ILogger<LetterboxdService> logger, IApplicationPaths paths)
    {
        _logger  = logger;
        _dataDir = Path.Combine(paths.DataPath, "letterboxd-sessions");
        Directory.CreateDirectory(_dataDir);
    }

    // ── Connexion par cookie navigateur ───────────────────────────────────────

    /// <summary>
    /// Valide une chaîne de cookies fournie par le navigateur et stocke la session.
    /// Le cookie doit contenir au minimum <c>com.xk72.webparts.csrf</c>.
    /// </summary>
    public async Task<(bool Success, string? Error, string? Username)> ConnectWithCookiesAsync(
        string jellyfinUserId, string cookieString)
    {
        cookieString = cookieString.Trim();
        if (string.IsNullOrEmpty(cookieString))
            return (false, "Cookie vide.", null);

        // Vérification minimale : le cookie de session Letterboxd doit être présent
        if (!cookieString.Contains("com.xk72.webparts.csrf", StringComparison.OrdinalIgnoreCase) &&
            !cookieString.Contains("letterboxd.signed.in", StringComparison.OrdinalIgnoreCase))
            return (false,
                "Cookie invalide — il doit contenir 'com.xk72.webparts.csrf'. " +
                "Assure-toi d'être connecté à letterboxd.com avant de copier.",
                null);

        // Vérifier que la session est bien active
        using var client = MakeClient(cookieString);
        string? username = null;
        try
        {
            var html = await client.GetStringAsync($"{LbBase}/me/").ConfigureAwait(false);

            // Vérifier si on est bien connecté (pas redirigé vers la page de connexion)
            if (html.Contains("sign-in", StringComparison.OrdinalIgnoreCase) &&
                html.Contains("action=\"/user/login.do\"", StringComparison.OrdinalIgnoreCase))
                return (false, "Session expirée ou invalide — reconnecte-toi sur letterboxd.com.", null);

            // Extraire le nom d'utilisateur depuis la page
            var m = Regex.Match(html,
                @"letterboxd\.com/([a-zA-Z0-9_-]+)/""[^>]*>\s*(?:Profile|Profil)",
                RegexOptions.IgnoreCase);
            if (!m.Success)
            {
                // Essai alternatif : chercher dans le titre ou les meta
                m = Regex.Match(html, @"<title>([^<]+)\s*•\s*Letterboxd</title>", RegexOptions.IgnoreCase);
                username = m.Success ? m.Groups[1].Value.Trim() : "utilisateur";
            }
            else
            {
                username = m.Groups[1].Value;
            }
        }
        catch (Exception ex)
        {
            return (false, $"Impossible de valider la session : {ex.Message}", null);
        }

        // Stocker la session
        SaveSession(new UserSession
        {
            JellyfinUserId     = jellyfinUserId,
            LetterboxdUsername = username ?? "utilisateur",
            CookieString       = cookieString,
            ConnectedAt        = DateTime.UtcNow,
        });

        _logger.LogInformation("[Letterboxd] User {Id} connected as {User}", jellyfinUserId, username);
        return (true, null, username);
    }

    // ── Gestion des sessions ──────────────────────────────────────────────────

    /// <summary>Retourne la session de l'utilisateur, ou null si non connecté.</summary>
    public UserSession? GetSession(string jellyfinUserId)
    {
        var path = SessionPath(jellyfinUserId);
        if (!File.Exists(path)) return null;
        try { return JsonSerializer.Deserialize<UserSession>(File.ReadAllText(path)); }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Cannot read session for {Id}", jellyfinUserId); return null; }
    }

    /// <summary>Supprime la session de l'utilisateur.</summary>
    public void DeleteSession(string jellyfinUserId)
    {
        var path = SessionPath(jellyfinUserId);
        if (File.Exists(path)) File.Delete(path);
    }

    // ── Recherche de film ─────────────────────────────────────────────────────

    /// <summary>Trouve l'ID Letterboxd d'un film via son ID IMDB.</summary>
    public async Task<string?> FindFilmByImdbAsync(string imdbId, string cookieStr)
    {
        using var client = MakeClient(cookieStr);
        try
        {
            var resp = await client.GetAsync($"{LbBase}/imdb/{imdbId}").ConfigureAwait(false);
            return ExtractFilmId(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] IMDB lookup failed for {Id}", imdbId); return null; }
    }

    /// <summary>Trouve l'ID Letterboxd d'un film via son ID TMDB.</summary>
    public async Task<string?> FindFilmByTmdbAsync(string tmdbId, string cookieStr)
    {
        using var client = MakeClient(cookieStr);
        try
        {
            var resp = await client.GetAsync($"{LbBase}/tmdb/{tmdbId}").ConfigureAwait(false);
            return ExtractFilmId(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] TMDB lookup failed for {Id}", tmdbId); return null; }
    }

    /// <summary>Trouve l'ID Letterboxd via recherche textuelle (titre + année).</summary>
    public async Task<string?> FindFilmByTitleAsync(string title, int? year, string cookieStr)
    {
        using var client = MakeClient(cookieStr);
        var query = Uri.EscapeDataString(year.HasValue ? $"{title} {year}" : title);
        try
        {
            var html = await client.GetStringAsync($"{LbBase}/search/films/{query}/").ConfigureAwait(false);
            var m    = Regex.Match(html, @"data-film-id=""(\d+)""");
            return m.Success ? m.Groups[1].Value : null;
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Text search failed for '{Title}'", title); return null; }
    }

    // ── Journalisation d'un film ──────────────────────────────────────────────

    /// <summary>
    /// Ajoute une entrée dans le journal Letterboxd.
    /// <paramref name="rating"/> : 0 = pas de note, 1–5 = étoiles.
    /// </summary>
    public async Task<(bool Success, string? Error)> LogFilmAsync(
        string filmId, int rating, string cookieStr)
    {
        using var client = MakeClient(cookieStr);

        var csrf = await GetFreshCsrfAsync(client).ConfigureAwait(false)
                   ?? CsrfFromCookieStr(cookieStr);
        if (string.IsNullOrEmpty(csrf))
            return (false, "Session expirée — reconnecte-toi depuis letterboxd.com.");

        var ratingInternal = Math.Clamp(rating * 2, 0, 10);
        var today          = DateTime.Today.ToString("yyyy-MM-dd");

        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["__csrf"]         = csrf,
            ["filmId"]         = filmId,
            ["specifiedDate"]  = "on",
            ["viewingDateStr"] = today,
            ["rating"]         = ratingInternal.ToString(),
        });

        try
        {
            var resp = await client.PostAsync($"{LbBase}/s/save-diary-entry", form).ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            _logger.LogDebug("[Letterboxd] LogFilm {Status}: {Body}", resp.StatusCode, body);

            if (resp.IsSuccessStatusCode) return (true, null);
            if (body.Contains("cf-", StringComparison.OrdinalIgnoreCase))
                return (false, "Session Cloudflare expirée — reconnecte-toi.");
            return (false, $"Letterboxd a répondu {(int)resp.StatusCode}");
        }
        catch (Exception ex) { return (false, ex.Message); }
    }

    // ── Helpers privés ────────────────────────────────────────────────────────

    private static HttpClient MakeClient(string cookieStr)
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("User-Agent", UserAgent);
        client.DefaultRequestHeaders.Add("Cookie",    cookieStr);
        client.DefaultRequestHeaders.Add("Origin",    LbBase);
        client.DefaultRequestHeaders.Add("Referer",   $"{LbBase}/");
        return client;
    }

    private static async Task<string?> GetFreshCsrfAsync(HttpClient client)
    {
        try
        {
            var html = await client.GetStringAsync($"{LbBase}/").ConfigureAwait(false);
            return ExtractCsrfFromHtml(html);
        }
        catch { return null; }
    }

    private static string? ExtractCsrfFromHtml(string html)
    {
        var m = Regex.Match(html, @"<input[^>]+name=""__csrf""[^>]+value=""([^""]+)""", RegexOptions.IgnoreCase);
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"data-csrf=""([^""]+)""");
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"""csrf""\s*:\s*""([^""]+)""");
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string? CsrfFromCookieStr(string cookieStr)
    {
        foreach (var part in cookieStr.Split(';'))
        {
            var kv = part.Trim().Split('=', 2);
            if (kv.Length == 2 && kv[0].Trim().Equals("com.xk72.webparts.csrf", StringComparison.OrdinalIgnoreCase))
                return kv[1].Trim();
        }
        return null;
    }

    private static string? ExtractFilmId(string html)
    {
        var m = Regex.Match(html, @"data-film-id=""(\d+)""");
        return m.Success ? m.Groups[1].Value : null;
    }

    private void SaveSession(UserSession session)
        => File.WriteAllText(SessionPath(session.JellyfinUserId),
            JsonSerializer.Serialize(session, _jsonOpts), Encoding.UTF8);

    private string SessionPath(string userId)
        => Path.Combine(_dataDir, $"{userId}.json");
}

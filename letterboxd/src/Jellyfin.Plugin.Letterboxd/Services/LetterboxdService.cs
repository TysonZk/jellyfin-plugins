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

/// <summary>Gère l'authentification et les appels vers Letterboxd (scraping session).</summary>
public sealed class LetterboxdService
{
    private const string LbBase    = "https://letterboxd.com";
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

    // ── Authentification ──────────────────────────────────────────────────────

    /// <summary>Connecte l'utilisateur à Letterboxd et stocke la session.</summary>
    public async Task<(bool Success, string? Error)> LoginAsync(
        string jellyfinUserId, string email, string password)
    {
        var cookieContainer = new CookieContainer();
        using var handler   = new HttpClientHandler
        {
            CookieContainer   = cookieContainer,
            AllowAutoRedirect = true,
            UseCookies        = true,
        };
        using var client = new HttpClient(handler);
        client.DefaultRequestHeaders.Add("User-Agent", UserAgent);

        // 1. Page sign-in → token CSRF
        string csrf;
        try
        {
            var html = await client.GetStringAsync($"{LbBase}/sign-in/").ConfigureAwait(false);
            csrf = ExtractCsrfFromHtml(html)
                ?? CookieCsrf(cookieContainer)
                ?? string.Empty;
        }
        catch (Exception ex)
        {
            return (false, $"Letterboxd inaccessible : {ex.Message}");
        }

        if (string.IsNullOrEmpty(csrf))
            return (false, "Impossible d'extraire le token CSRF — réessaie.");

        // 2. POST login
        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["__csrf"]   = csrf,
            ["username"] = email,
            ["password"] = password,
        });

        HttpResponseMessage resp;
        try
        {
            resp = await client.PostAsync($"{LbBase}/user/login.do", form).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return (false, $"Échec de la requête : {ex.Message}");
        }

        var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (!body.Contains("\"success\"", StringComparison.OrdinalIgnoreCase))
        {
            var m = Regex.Match(body, @"""messages?""\s*:\s*\[""([^""]+)""");
            return (false, m.Success ? m.Groups[1].Value : "Identifiants incorrects.");
        }

        // 3. Extraire les cookies et stocker la session
        var allCookies = cookieContainer.GetAllCookies();
        var cookieStr  = string.Join("; ",
            allCookies.Cast<Cookie>().Select(c => $"{c.Name}={c.Value}"));

        // Essayer de récupérer le vrai nom d'utilisateur
        var username = email;
        try
        {
            var profile = await client.GetStringAsync($"{LbBase}/me/").ConfigureAwait(false);
            var um = Regex.Match(profile, @"letterboxd\.com/([^/""]+)/""[^>]*>\s*Profile");
            if (um.Success) username = um.Groups[1].Value;
        }
        catch { /* on garde l'email */ }

        SaveSession(new UserSession
        {
            JellyfinUserId      = jellyfinUserId,
            LetterboxdUsername  = username,
            CookieString        = cookieStr,
            ConnectedAt         = DateTime.UtcNow,
        });

        _logger.LogInformation("[Letterboxd] User {Id} connected as {User}", jellyfinUserId, username);
        return (true, null);
    }

    // ── Gestion des sessions ──────────────────────────────────────────────────

    /// <summary>Retourne la session de l'utilisateur, ou null si non connecté.</summary>
    public UserSession? GetSession(string jellyfinUserId)
    {
        var path = SessionPath(jellyfinUserId);
        if (!File.Exists(path)) return null;
        try
        {
            return JsonSerializer.Deserialize<UserSession>(File.ReadAllText(path));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Letterboxd] Cannot read session for {Id}", jellyfinUserId);
            return null;
        }
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
            var html = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            return ExtractFilmId(html);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Letterboxd] IMDB lookup failed for {Id}", imdbId);
            return null;
        }
    }

    /// <summary>Trouve l'ID Letterboxd d'un film via son ID TMDB.</summary>
    public async Task<string?> FindFilmByTmdbAsync(string tmdbId, string cookieStr)
    {
        using var client = MakeClient(cookieStr);
        try
        {
            var resp = await client.GetAsync($"{LbBase}/tmdb/{tmdbId}").ConfigureAwait(false);
            var html = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            return ExtractFilmId(html);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Letterboxd] TMDB lookup failed for {Id}", tmdbId);
            return null;
        }
    }

    /// <summary>Trouve l'ID Letterboxd via recherche textuelle (titre + année).</summary>
    public async Task<string?> FindFilmByTitleAsync(string title, int? year, string cookieStr)
    {
        using var client = MakeClient(cookieStr);
        var query = Uri.EscapeDataString(year.HasValue ? $"{title} {year}" : title);
        try
        {
            var html = await client.GetStringAsync(
                $"{LbBase}/search/films/{query}/").ConfigureAwait(false);

            // Premier résultat : <li class="film-list-entry" data-film-id="XXXXX"
            var m = Regex.Match(html, @"data-film-id=""(\d+)""");
            return m.Success ? m.Groups[1].Value : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Letterboxd] Text search failed for '{Title}'", title);
            return null;
        }
    }

    // ── Journalisation d'un film ──────────────────────────────────────────────

    /// <summary>
    /// Ajoute une entrée dans le journal Letterboxd.
    /// <paramref name="rating"/> : 0 = pas de note, 1–5 = étoiles (entiers uniquement pour l'instant).
    /// </summary>
    public async Task<(bool Success, string? Error)> LogFilmAsync(
        string filmId, int rating, string cookieStr)
    {
        using var client = MakeClient(cookieStr);

        // Récupérer un token CSRF frais
        var csrf = await GetFreshCsrfAsync(client).ConfigureAwait(false);
        if (string.IsNullOrEmpty(csrf))
        {
            csrf = CsrfFromCookieStr(cookieStr);
            if (string.IsNullOrEmpty(csrf))
                return (false, "Session expirée — reconnecte-toi.");
        }

        // Letterboxd: rating interne = étoiles * 2 (½ étoile = 1, 1 étoile = 2 … 5 étoiles = 10)
        var ratingInternal = Math.Clamp(rating * 2, 0, 10);
        var today          = DateTime.Today.ToString("yyyy-MM-dd");

        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["__csrf"]          = csrf,
            ["filmId"]          = filmId,
            ["specifiedDate"]   = "on",
            ["viewingDateStr"]  = today,
            ["rating"]          = ratingInternal.ToString(),
        });

        try
        {
            var resp = await client.PostAsync($"{LbBase}/s/save-diary-entry", form)
                .ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);

            _logger.LogDebug("[Letterboxd] LogFilm response {Status}: {Body}",
                resp.StatusCode, body);

            if (resp.IsSuccessStatusCode)
                return (true, null);

            return (false, $"Letterboxd a répondu {(int)resp.StatusCode}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // ── Helpers privés ────────────────────────────────────────────────────────

    private static HttpClient MakeClient(string cookieStr)
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("User-Agent", UserAgent);
        client.DefaultRequestHeaders.Add("Cookie", cookieStr);
        client.DefaultRequestHeaders.Add("Origin", LbBase);
        client.DefaultRequestHeaders.Add("Referer", $"{LbBase}/");
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
        // <input type="hidden" name="__csrf" value="TOKEN">
        var m = Regex.Match(html,
            @"<input[^>]+name=""__csrf""[^>]+value=""([^""]+)""",
            RegexOptions.IgnoreCase);
        if (m.Success) return m.Groups[1].Value;

        // data-csrf="TOKEN"
        m = Regex.Match(html, @"data-csrf=""([^""]+)""");
        if (m.Success) return m.Groups[1].Value;

        // "csrf":"TOKEN"
        m = Regex.Match(html, @"""csrf""\s*:\s*""([^""]+)""");
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string? CookieCsrf(CookieContainer cc)
        => cc.GetAllCookies()
             .Cast<Cookie>()
             .FirstOrDefault(c => c.Name.Equals("csrf", StringComparison.OrdinalIgnoreCase))
             ?.Value;

    private static string? CsrfFromCookieStr(string cookieStr)
    {
        foreach (var part in cookieStr.Split(';'))
        {
            var kv = part.Trim().Split('=', 2);
            if (kv.Length == 2
                && kv[0].Trim().Equals("csrf", StringComparison.OrdinalIgnoreCase))
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
        => File.WriteAllText(
            SessionPath(session.JellyfinUserId),
            JsonSerializer.Serialize(session, _jsonOpts),
            Encoding.UTF8);

    private string SessionPath(string userId)
        => Path.Combine(_dataDir, $"{userId}.json");
}

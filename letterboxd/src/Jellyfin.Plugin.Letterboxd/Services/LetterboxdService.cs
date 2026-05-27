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
/// Gère les sessions Letterboxd.
/// Tente d'abord un login direct username/password (AJAX vers /user/login.do).
/// Si Cloudflare bloque (403 / page HTML de challenge), retourne "CLOUDFLARE_BLOCKED"
/// pour que le frontend propose une connexion par cookie navigateur.
/// </summary>
public sealed class LetterboxdService
{
    private const string LbBase = "https://letterboxd.com";

    // Firefox UA — Cloudflare lie cf_clearance à l'UA exact du navigateur
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) " +
        "Gecko/20100101 Firefox/134.0";

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

    // ── Login username / mot de passe ─────────────────────────────────────────

    /// <summary>
    /// Tente de se connecter via username + password (flux AJAX en 2 étapes).
    /// Retourne (false, "CLOUDFLARE_BLOCKED", null) si Cloudflare intercepte la requête.
    /// </summary>
    public async Task<(bool Success, string? Error, string? Username)> LoginAsync(
        string jellyfinUserId, string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username))
            return (false, "Nom d'utilisateur requis.", null);
        if (string.IsNullOrWhiteSpace(password))
            return (false, "Mot de passe requis.", null);

        var jar     = new CookieContainer();
        var handler = new HttpClientHandler
        {
            CookieContainer      = jar,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
            AllowAutoRedirect    = true,
        };
        using var client = MakeClientFromHandler(handler);

        // Étape 1 — charger la page de connexion pour obtenir le cookie CSRF
        try
        {
            await client.GetStringAsync($"{LbBase}/sign-in/").ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Letterboxd] Cannot fetch sign-in page");
        }

        var lbUri    = new Uri(LbBase);
        var csrfVal  = jar.GetCookies(lbUri)["com.xk72.webparts.csrf"]?.Value ?? string.Empty;

        // Étape 2 — POST les identifiants en AJAX
        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["__csrf"]   = csrfVal,
            ["username"] = username,
            ["password"] = password,
            ["remember"] = "true",
        });

        var req = new HttpRequestMessage(HttpMethod.Post, $"{LbBase}/user/login.do") { Content = form };
        req.Headers.TryAddWithoutValidation("X-Requested-With", "XMLHttpRequest");
        req.Headers.TryAddWithoutValidation("Accept", "application/json, text/javascript, */*; q=0.01");
        req.Headers.TryAddWithoutValidation("Referer", $"{LbBase}/sign-in/");

        HttpResponseMessage resp;
        try
        {
            resp = await client.SendAsync(req).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return (false, $"Erreur réseau : {ex.Message}", null);
        }

        if (resp.StatusCode == HttpStatusCode.Forbidden)
        {
            _logger.LogInformation("[Letterboxd] Cloudflare blocked direct login for {Id}", jellyfinUserId);
            return (false, "CLOUDFLARE_BLOCKED", null);
        }

        var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
        _logger.LogDebug("[Letterboxd] Login {Status}: {Preview}", resp.StatusCode, body[..Math.Min(200, body.Length)]);

        // La réponse est du HTML → Cloudflare challenge ou page d'erreur
        if (body.TrimStart().StartsWith('<'))
        {
            _logger.LogInformation("[Letterboxd] Received HTML instead of JSON — Cloudflare or error for {Id}", jellyfinUserId);
            return (false, "CLOUDFLARE_BLOCKED", null);
        }

        // Parser la réponse JSON de Letterboxd
        try
        {
            using var doc  = JsonDocument.Parse(body);
            var root   = doc.RootElement;
            var result = root.TryGetProperty("result", out var r) ? r.GetString() : null;

            if (result != "success")
            {
                string? msg = null;
                if (root.TryGetProperty("messages", out var msgs)
                    && msgs.ValueKind == JsonValueKind.Array
                    && msgs.GetArrayLength() > 0)
                    msg = msgs[0].GetString();
                return (false, msg ?? "Identifiants incorrects.", null);
            }
        }
        catch
        {
            return (false, "CLOUDFLARE_BLOCKED", null);
        }

        // Succès — extraire les cookies de session pour les réutiliser côté serveur
        var sessionCookies = jar.GetCookies(lbUri);
        var cookieStr = string.Join("; ", sessionCookies.Cast<Cookie>().Select(c => $"{c.Name}={c.Value}"));

        // Appel /me/ pour confirmer le username canonique
        string? lbUsername = username;
        try
        {
            var meHtml = await client.GetStringAsync($"{LbBase}/me/").ConfigureAwait(false);
            var m = Regex.Match(meHtml,
                @"letterboxd\.com/([a-zA-Z0-9_-]+)/""[^>]*>\s*(?:Profile|Profil)",
                RegexOptions.IgnoreCase);
            if (m.Success) lbUsername = m.Groups[1].Value;
        }
        catch { /* on garde le username saisi */ }

        SaveSession(new UserSession
        {
            JellyfinUserId     = jellyfinUserId,
            LetterboxdUsername = lbUsername ?? username,
            CookieString       = cookieStr,
            ConnectedAt        = DateTime.UtcNow,
        });

        _logger.LogInformation("[Letterboxd] {Id} logged in as {User}", jellyfinUserId, lbUsername);
        return (true, null, lbUsername ?? username);
    }

    // ── Connexion par cookie navigateur (fallback Cloudflare) ────────────────

    /// <summary>Valide une chaîne de cookies copiée depuis le navigateur.</summary>
    public async Task<(bool Success, string? Error, string? Username)> ConnectWithCookiesAsync(
        string jellyfinUserId, string cookieString)
    {
        cookieString = cookieString.Trim();
        if (string.IsNullOrEmpty(cookieString))
            return (false, "Cookie vide.", null);

        using var client = MakeCookieClient(cookieString);
        string? username = null;
        try
        {
            var html = await client.GetStringAsync($"{LbBase}/me/").ConfigureAwait(false);

            if (html.Contains("action=\"/user/login.do\"", StringComparison.OrdinalIgnoreCase))
                return (false, "Session expirée — reconnecte-toi sur letterboxd.com.", null);

            var m = Regex.Match(html,
                @"letterboxd\.com/([a-zA-Z0-9_-]+)/""[^>]*>\s*(?:Profile|Profil)",
                RegexOptions.IgnoreCase);
            if (!m.Success)
            {
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

        SaveSession(new UserSession
        {
            JellyfinUserId     = jellyfinUserId,
            LetterboxdUsername = username ?? "utilisateur",
            CookieString       = cookieString,
            ConnectedAt        = DateTime.UtcNow,
        });

        _logger.LogInformation("[Letterboxd] {Id} connected via cookie as {User}", jellyfinUserId, username);
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
        using var client = MakeCookieClient(cookieStr);
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
        using var client = MakeCookieClient(cookieStr);
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
        using var client = MakeCookieClient(cookieStr);
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

    /// <summary>Ajoute une entrée dans le journal Letterboxd.</summary>
    public async Task<(bool Success, string? Error)> LogFilmAsync(
        string filmId, int rating, string cookieStr)
    {
        using var client = MakeCookieClient(cookieStr);

        var csrf = await GetFreshCsrfAsync(client).ConfigureAwait(false)
                   ?? CsrfFromCookieStr(cookieStr);
        if (string.IsNullOrEmpty(csrf))
            return (false, "Session expirée — reconnecte-toi.");

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

    /// <summary>Client HTTP avec CookieContainer (pour le login 2 étapes).</summary>
    private static HttpClient MakeClientFromHandler(HttpClientHandler handler)
    {
        var client = new HttpClient(handler, disposeHandler: true);
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UserAgent);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Sec-Fetch-Dest", "empty");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Sec-Fetch-Mode", "cors");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Sec-Fetch-Site", "same-origin");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Origin", LbBase);
        return client;
    }

    /// <summary>Client HTTP simple avec Cookie header (pour les appels après connexion).</summary>
    private static HttpClient MakeCookieClient(string cookieStr)
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UserAgent);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",    cookieStr);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Origin",    LbBase);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Referer",   $"{LbBase}/");
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

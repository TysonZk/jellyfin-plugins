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

        // Appel /me/ pour confirmer le username et récupérer l'avatar
        string? lbUsername = username;
        string? avatarUrl  = null;
        try
        {
            var meHtml = await client.GetStringAsync($"{LbBase}/me/").ConfigureAwait(false);
            var m = Regex.Match(meHtml,
                @"letterboxd\.com/([a-zA-Z0-9_-]+)/""[^>]*>\s*(?:Profile|Profil)",
                RegexOptions.IgnoreCase);
            if (m.Success) lbUsername = m.Groups[1].Value;
            avatarUrl = ExtractAvatarUrl(meHtml);
        }
        catch { /* on garde le username saisi */ }

        SaveSession(new UserSession
        {
            JellyfinUserId     = jellyfinUserId,
            LetterboxdUsername = lbUsername ?? username,
            CookieString       = cookieStr,
            AvatarUrl          = avatarUrl,
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
        string? username  = null;
        string? avatarUrl = null;
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

            avatarUrl = ExtractAvatarUrl(html);
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
            AvatarUrl          = avatarUrl,
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

    /// <summary>Trouve l'ID Letterboxd d'un film via son ID IMDB (Wikidata → slug → page film).</summary>
    public async Task<string?> FindFilmByImdbAsync(string imdbId, string cookieStr)
    {
        // 1. Wikidata: IMDB → Letterboxd slug
        var slug = await FindSlugFromWikidataAsync("P345", imdbId).ConfigureAwait(false);
        _logger.LogInformation("[Letterboxd] IMDB {Id} → Wikidata slug={Slug}", imdbId, slug ?? "null");

        // 2. fallback: /imdb/{id} redirect (may be Cloudflare-blocked, worth trying)
        if (slug is null)
        {
            using var client = MakeFollowClient(cookieStr);
            try
            {
                var html = await client.GetStringAsync($"{LbBase}/imdb/{imdbId}").ConfigureAwait(false);
                var id2  = ExtractFilmIdFromPage(html);
                _logger.LogInformation("[Letterboxd] IMDB redirect → filmId={Id}", id2 ?? "null");
                if (id2 is not null) return id2;
            }
            catch { }
        }

        return slug is not null ? await FindFilmIdBySlugAsync(slug).ConfigureAwait(false) : null;
    }

    /// <summary>Trouve l'ID Letterboxd d'un film via son ID TMDB (Wikidata → slug → page film).</summary>
    public async Task<string?> FindFilmByTmdbAsync(string tmdbId, string cookieStr)
    {
        var slug = await FindSlugFromWikidataAsync("P4947", tmdbId).ConfigureAwait(false);
        _logger.LogInformation("[Letterboxd] TMDB {Id} → Wikidata slug={Slug}", tmdbId, slug ?? "null");

        if (slug is null)
        {
            using var client = MakeFollowClient(cookieStr);
            try
            {
                var html = await client.GetStringAsync($"{LbBase}/tmdb/{tmdbId}").ConfigureAwait(false);
                var id2  = ExtractFilmIdFromPage(html);
                _logger.LogInformation("[Letterboxd] TMDB redirect → filmId={Id}", id2 ?? "null");
                if (id2 is not null) return id2;
            }
            catch { }
        }

        return slug is not null ? await FindFilmIdBySlugAsync(slug).ConfigureAwait(false) : null;
    }

    /// <summary>Trouve l'ID Letterboxd via titre + année (slug construit + Wikidata).</summary>
    public async Task<string?> FindFilmByTitleAsync(string title, int? year, string cookieStr)
    {
        // Try Letterboxd slug derived from title (English title, lowercase, hyphenated)
        var slugGuesses = BuildSlugGuesses(title, year);
        foreach (var slug in slugGuesses)
        {
            var id = await FindFilmIdBySlugAsync(slug).ConfigureAwait(false);
            _logger.LogInformation("[Letterboxd] Slug guess '{S}' → filmId={Id}", slug, id ?? "null");
            if (id is not null) return id;
        }

        // Fallback: search (may be Cloudflare-blocked)
        using var client = MakeFollowClient(cookieStr);
        foreach (var q in year.HasValue ? new[] { $"{title} {year}", title } : new[] { title })
        {
            try
            {
                var html = await client.GetStringAsync($"{LbBase}/search/films/{Uri.EscapeDataString(q)}/").ConfigureAwait(false);
                var id   = ExtractFilmIdFromPage(html);
                _logger.LogInformation("[Letterboxd] Title search '{Q}' → filmId={Id}", q, id ?? "null");
                if (id is not null) return id;
            }
            catch { }
        }
        return null;
    }

    // ── Wikidata + slug-based film resolution ─────────────────────────────────

    /// <summary>Requête Wikidata SPARQL pour obtenir le slug Letterboxd via un ID externe.</summary>
    private async Task<string?> FindSlugFromWikidataAsync(string wikidataProperty, string externalId)
    {
        // Wikidata SPARQL — pas de Cloudflare, CORS friendly
        var sparql = $"SELECT ?lb WHERE {{ ?film wdt:{wikidataProperty} \"{externalId}\" . ?film wdt:P6127 ?lb . }}";
        var url    = $"https://query.wikidata.org/sparql?format=json&query={Uri.EscapeDataString(sparql)}";
        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "JellyfinLetterboxdPlugin/1.0");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/json");
            var json = await client.GetStringAsync(url).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            var bindings = doc.RootElement
                .GetProperty("results")
                .GetProperty("bindings");
            if (bindings.GetArrayLength() > 0)
                return bindings[0].GetProperty("lb").GetProperty("value").GetString();
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Wikidata lookup failed for {Prop}={Id}", wikidataProperty, externalId); }
        return null;
    }

    /// <summary>Obtient l'ID numérique Letterboxd depuis la page film (accessible sans Cloudflare).</summary>
    private async Task<string?> FindFilmIdBySlugAsync(string slug)
    {
        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UserAgent);
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,*/*;q=0.9");
            var html = await client.GetStringAsync($"{LbBase}/film/{slug}/").ConfigureAwait(false);
            return ExtractFilmIdFromPage(html);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Slug lookup failed for '{Slug}'", slug); return null; }
    }

    private static IEnumerable<string> BuildSlugGuesses(string title, int? year)
    {
        // Normalise to ASCII-ish lowercase slug
        var slug = Regex.Replace(title.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (year.HasValue)
        {
            yield return $"{slug}-{year}";
        }
        yield return slug;
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
            _logger.LogInformation("[Letterboxd] LogFilm {Status}: {Preview}", resp.StatusCode, body[..Math.Min(120, body.Length)]);

            if (resp.IsSuccessStatusCode) return (true, null);
            if (resp.StatusCode == HttpStatusCode.Forbidden)
                return (false, "CLOUDFLARE_BLOCKED_POST");
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

    /// <summary>Client HTTP avec auto-redirect activé (pour les lookups IMDB/TMDB qui redirigent).</summary>
    private static HttpClient MakeFollowClient(string cookieStr)
    {
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect      = true,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
            UseCookies             = false,
        };
        var client = new HttpClient(handler, disposeHandler: true);
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UserAgent);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",    cookieStr);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Origin",    LbBase);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Referer",   $"{LbBase}/");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept",    "text/html,application/xhtml+xml,*/*;q=0.9");
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

    private static string? ExtractFilmIdFromPage(string html)
    {
        // production-data JSON: {"uid":"film:977835",...}
        var m = Regex.Match(html, @"""uid""\s*:\s*""film:(\d+)""");
        if (m.Success) return m.Groups[1].Value;
        // Inline data-film-id attribute
        m = Regex.Match(html, @"data-film-id=""(\d+)""");
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"""filmId""\s*:\s*(\d+)");
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string? ExtractAvatarUrl(string html)
    {
        // Pattern: <img ... class="avatar" ... src="https://a.ltrbxd.com/..."
        var m = Regex.Match(html, @"<img[^>]+class=""avatar[^""]*""[^>]+src=""(https://[^""]+)""", RegexOptions.IgnoreCase);
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"<img[^>]+src=""(https://a\.ltrbxd\.com[^""]+)""[^>]*class=""avatar", RegexOptions.IgnoreCase);
        if (m.Success) return m.Groups[1].Value;
        // Broader: any a.ltrbxd.com image near "avatar"
        m = Regex.Match(html, @"avatar[^<]{0,200}src=""(https://a\.ltrbxd\.com[^""]+)""", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        return m.Success ? m.Groups[1].Value : null;
    }

    private void SaveSession(UserSession session)
        => File.WriteAllText(SessionPath(session.JellyfinUserId),
            JsonSerializer.Serialize(session, _jsonOpts), Encoding.UTF8);

    private string SessionPath(string userId)
        => Path.Combine(_dataDir, $"{userId}.json");
}

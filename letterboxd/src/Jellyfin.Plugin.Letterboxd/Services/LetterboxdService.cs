using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Jellyfin.Plugin.Letterboxd.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Letterboxd.Services;

/// <summary>
/// Service Letterboxd utilisant l'API officielle api.letterboxd.com (HMAC-SHA256, OAuth2).
/// L'API officielle ne passe pas par Cloudflare — aucun blocage côté serveur.
/// Fallback cookies navigateur conservé pour les comptes sans mot de passe (Google/Facebook).
/// </summary>
public sealed class LetterboxdService
{
    // ── Constantes API officielle ─────────────────────────────────────────────
    private const string ApiBase   = "https://api.letterboxd.com/api/v0";
    private const string ApiKey    = "ebe3d27ec52a35fc8d1835c6531c37bd72b7a54337666d5bd759379b72ae16f0";
    private const string ApiSecret = "c60ce045d25bc90cb56026a8dd621eebeef995cbecc51951192da75348c977cd";

    // ── Constantes web (fallback cookie) ─────────────────────────────────────
    private const string LbBase    = "https://letterboxd.com";
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0";

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

    // ── Connexion via API officielle (username + password) ────────────────────

    /// <summary>
    /// Authentifie l'utilisateur via l'API officielle Letterboxd (OAuth2 password grant).
    /// Pas de Cloudflare sur api.letterboxd.com.
    /// </summary>
    public async Task<(bool Success, string? Error, string? Username)> LoginAsync(
        string jellyfinUserId, string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username)) return (false, "Nom d'utilisateur requis.", null);
        if (string.IsNullOrWhiteSpace(password)) return (false, "Mot de passe requis.", null);

        using var http = MakeApiClient();
        try
        {
            // 1. Obtenir le token OAuth2
            var tokenBody = $"grant_type=password&username={Uri.EscapeDataString(username)}&password={Uri.EscapeDataString(password)}";
            var tokenResp = await SendSignedAsync(http, HttpMethod.Post, "/auth/token", tokenBody, "application/x-www-form-urlencoded")
                .ConfigureAwait(false);

            if (!tokenResp.IsSuccessStatusCode)
            {
                var errBody = await tokenResp.Content.ReadAsStringAsync().ConfigureAwait(false);
                _logger.LogInformation("[Letterboxd] Auth failed {Status}: {Body}", tokenResp.StatusCode, errBody[..Math.Min(200, errBody.Length)]);
                if (tokenResp.StatusCode == HttpStatusCode.Unauthorized)
                    return (false, "Identifiants incorrects.", null);
                return (false, $"Erreur API {(int)tokenResp.StatusCode}", null);
            }

            var tokenJson = await tokenResp.Content.ReadAsStringAsync().ConfigureAwait(false);
            using var tokenDoc = JsonDocument.Parse(tokenJson);
            var accessToken  = tokenDoc.RootElement.GetProperty("access_token").GetString()!;
            var refreshToken = tokenDoc.RootElement.TryGetProperty("refresh_token", out var rt) ? rt.GetString() ?? string.Empty : string.Empty;
            var expiresIn    = tokenDoc.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

            // 2. Récupérer le profil (/me)
            var meResp = await SendSignedAsync(http, HttpMethod.Get, "/me", authenticated: true, accessToken: accessToken)
                .ConfigureAwait(false);
            meResp.EnsureSuccessStatusCode();

            var meJson = await meResp.Content.ReadAsStringAsync().ConfigureAwait(false);
            using var meDoc = JsonDocument.Parse(meJson);
            var member    = meDoc.RootElement.GetProperty("member");
            var memberId  = member.GetProperty("id").GetString()!;
            var lbUsername = member.TryGetProperty("username", out var un) ? un.GetString() ?? username : username;
            var avatarUrl  = ExtractApiAvatarUrl(member);

            SaveSession(new UserSession
            {
                JellyfinUserId     = jellyfinUserId,
                LetterboxdUsername = lbUsername,
                AvatarUrl          = avatarUrl,
                ConnectedAt        = DateTime.UtcNow,
                PasswordB64        = Convert.ToBase64String(Encoding.UTF8.GetBytes(password)),
                AccessToken        = accessToken,
                RefreshToken       = refreshToken,
                TokenExpiry        = DateTime.UtcNow.AddSeconds(expiresIn - 60),
                MemberId           = memberId,
            });

            _logger.LogInformation("[Letterboxd] {Id} connected via API as {User}", jellyfinUserId, lbUsername);
            return (true, null, lbUsername);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Letterboxd] LoginAsync failed");
            return (false, $"Erreur réseau : {ex.Message}", null);
        }
    }

    // ── Connexion via cookies navigateur (fallback Cloudflare) ───────────────

    /// <summary>Valide une chaîne de cookies copiée depuis le navigateur.</summary>
    public async Task<(bool Success, string? Error, string? Username)> ConnectWithCookiesAsync(
        string jellyfinUserId, string cookieString)
    {
        cookieString = cookieString.Trim();
        if (string.IsNullOrEmpty(cookieString)) return (false, "Cookie vide.", null);

        using var client = MakeCookieClient(cookieString);
        string? username = null, avatarUrl = null;
        try
        {
            var html = await client.GetStringAsync($"{LbBase}/me/").ConfigureAwait(false);
            if (html.Contains("action=\"/user/login.do\"", StringComparison.OrdinalIgnoreCase))
                return (false, "Session expirée — reconnecte-toi sur letterboxd.com.", null);

            var m = Regex.Match(html, @"letterboxd\.com/([a-zA-Z0-9_-]+)/""[^>]*>\s*(?:Profile|Profil)", RegexOptions.IgnoreCase);
            if (!m.Success) m = Regex.Match(html, @"<title>([^<]+)\s*•\s*Letterboxd</title>", RegexOptions.IgnoreCase);
            username  = m.Success ? m.Groups[1].Value.Trim() : "utilisateur";
            avatarUrl = ExtractAvatarUrl(html);
        }
        catch (Exception ex) { return (false, $"Impossible de valider la session : {ex.Message}", null); }

        SaveSession(new UserSession
        {
            JellyfinUserId     = jellyfinUserId,
            LetterboxdUsername = username ?? "utilisateur",
            AvatarUrl          = avatarUrl,
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

    /// <summary>Trouve le LID Letterboxd d'un film via son ID IMDB.</summary>
    public async Task<string?> FindFilmByImdbAsync(string imdbId, UserSession session)
    {
        if (session.HasApiToken)
        {
            var token = await EnsureValidTokenAsync(session).ConfigureAwait(false);
            if (token is not null)
            {
                var lid = await ApiFilmLookupAsync(token, $"filmId=imdb%3A{imdbId}&perPage=1").ConfigureAwait(false);
                _logger.LogInformation("[Letterboxd] API IMDB {Id} → LID={Lid}", imdbId, lid ?? "null");
                if (lid is not null) return lid;
            }
        }

        // Fallback: Wikidata + page film
        var slug = await FindSlugFromWikidataAsync("P345", imdbId).ConfigureAwait(false);
        _logger.LogInformation("[Letterboxd] Wikidata IMDB {Id} → slug={Slug}", imdbId, slug ?? "null");
        if (slug is not null) return await FindFilmIdBySlugAsync(slug).ConfigureAwait(false);

        // Fallback 2: redirect /imdb/{id}
        try
        {
            using var client = MakeFollowClient(session.CookieString ?? string.Empty);
            var html = await client.GetStringAsync($"{LbBase}/imdb/{imdbId}").ConfigureAwait(false);
            var id   = ExtractFilmIdFromPage(html);
            _logger.LogInformation("[Letterboxd] IMDB redirect → filmId={Id}", id ?? "null");
            return id;
        }
        catch { return null; }
    }

    /// <summary>Trouve le LID Letterboxd d'un film via son ID TMDB.</summary>
    public async Task<string?> FindFilmByTmdbAsync(string tmdbId, UserSession session)
    {
        if (session.HasApiToken)
        {
            var token = await EnsureValidTokenAsync(session).ConfigureAwait(false);
            if (token is not null)
            {
                var lid = await ApiFilmLookupAsync(token, $"filmId=tmdb%3A{tmdbId}&perPage=1").ConfigureAwait(false);
                _logger.LogInformation("[Letterboxd] API TMDB {Id} → LID={Lid}", tmdbId, lid ?? "null");
                if (lid is not null) return lid;
            }
        }

        var slug = await FindSlugFromWikidataAsync("P4947", tmdbId).ConfigureAwait(false);
        _logger.LogInformation("[Letterboxd] Wikidata TMDB {Id} → slug={Slug}", tmdbId, slug ?? "null");
        if (slug is not null) return await FindFilmIdBySlugAsync(slug).ConfigureAwait(false);

        try
        {
            using var client = MakeFollowClient(session.CookieString ?? string.Empty);
            var html = await client.GetStringAsync($"{LbBase}/tmdb/{tmdbId}").ConfigureAwait(false);
            return ExtractFilmIdFromPage(html);
        }
        catch { return null; }
    }

    /// <summary>Trouve le LID Letterboxd via recherche textuelle.</summary>
    public async Task<string?> FindFilmByTitleAsync(string title, int? year, UserSession session)
    {
        if (session.HasApiToken)
        {
            var token = await EnsureValidTokenAsync(session).ConfigureAwait(false);
            if (token is not null)
            {
                var query = year.HasValue ? $"{title} {year}" : title;
                var lid   = await ApiSearchAsync(token, query).ConfigureAwait(false);
                _logger.LogInformation("[Letterboxd] API search '{Q}' → LID={Lid}", query, lid ?? "null");
                if (lid is not null) return lid;
            }
        }

        // Fallback: slug construit + page film
        foreach (var slug in BuildSlugGuesses(title, year))
        {
            var id = await FindFilmIdBySlugAsync(slug).ConfigureAwait(false);
            _logger.LogInformation("[Letterboxd] Slug '{S}' → filmId={Id}", slug, id ?? "null");
            if (id is not null) return id;
        }

        // Fallback 2: search page (peut être bloqué Cloudflare)
        using var fallback = MakeFollowClient(session.CookieString ?? string.Empty);
        foreach (var q in year.HasValue ? new[] { $"{title} {year}", title } : new[] { title })
        {
            try
            {
                var html = await fallback.GetStringAsync($"{LbBase}/search/films/{Uri.EscapeDataString(q)}/").ConfigureAwait(false);
                var id   = ExtractFilmIdFromPage(html);
                if (id is not null) return id;
            }
            catch { }
        }
        return null;
    }

    // ── Journalisation ────────────────────────────────────────────────────────

    /// <summary>
    /// Enregistre un film dans le journal Letterboxd via l'API officielle.
    /// rating: 0 = pas de note, 1-5 étoiles.
    /// </summary>
    public async Task<(bool Success, string? Error)> LogFilmAsync(
        string filmLid, double rating, UserSession session)
    {
        if (!session.HasApiToken)
            return (false, "SESSION_NO_API");

        var token = await EnsureValidTokenAsync(session).ConfigureAwait(false);
        if (token is null)
            return (false, "Session expirée — reconnecte-toi.");

        using var http = MakeApiClient();

        var bodyObj = new Dictionary<string, object>
        {
            ["filmId"]        = filmLid,
            ["diaryDetails"]  = new { diaryDate = DateTime.Today.ToString("yyyy-MM-dd"), rewatch = false },
            ["like"]          = false,
            ["tags"]          = Array.Empty<string>(),
        };
        if (rating > 0) bodyObj["rating"] = Math.Clamp(rating, 0.5, 5.0);

        var body = JsonSerializer.Serialize(bodyObj);
        try
        {
            var resp = await SendSignedAsync(http, HttpMethod.Post, "/log-entries", body, "application/json",
                authenticated: true, accessToken: token).ConfigureAwait(false);

            var respBody = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            _logger.LogInformation("[Letterboxd] LogFilm API {Status}: {Preview}", resp.StatusCode, respBody[..Math.Min(100, respBody.Length)]);

            if (resp.IsSuccessStatusCode || resp.StatusCode == HttpStatusCode.NoContent)
                return (true, null);

            return (false, $"API a répondu {(int)resp.StatusCode}");
        }
        catch (Exception ex) { return (false, ex.Message); }
    }

    // ── Token management ──────────────────────────────────────────────────────

    /// <summary>
    /// Vérifie l'expiration du token, le renouvelle si nécessaire.
    /// Retourne le token valide ou null si impossible.
    /// </summary>
    private async Task<string?> EnsureValidTokenAsync(UserSession session)
    {
        if (string.IsNullOrEmpty(session.AccessToken)) return null;

        // Token encore valide (marge de 2 minutes)
        if (session.TokenExpiry.HasValue && session.TokenExpiry.Value > DateTime.UtcNow.AddMinutes(2))
            return session.AccessToken;

        // Tenter le refresh
        if (!string.IsNullOrEmpty(session.RefreshToken))
        {
            using var http = MakeApiClient();
            try
            {
                var body = $"grant_type=refresh_token&refresh_token={Uri.EscapeDataString(session.RefreshToken)}";
                var resp = await SendSignedAsync(http, HttpMethod.Post, "/auth/token", body, "application/x-www-form-urlencoded")
                    .ConfigureAwait(false);

                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                    using var doc = JsonDocument.Parse(json);
                    session.AccessToken  = doc.RootElement.GetProperty("access_token").GetString()!;
                    if (doc.RootElement.TryGetProperty("refresh_token", out var rt))
                        session.RefreshToken = rt.GetString() ?? session.RefreshToken;
                    var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;
                    session.TokenExpiry = DateTime.UtcNow.AddSeconds(expiresIn - 60);
                    SaveSession(session);
                    _logger.LogInformation("[Letterboxd] Token refreshed for {User}", session.LetterboxdUsername);
                    return session.AccessToken;
                }
            }
            catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Token refresh failed"); }
        }

        // Tenter la réauthentification avec le mot de passe
        if (!string.IsNullOrEmpty(session.PasswordB64))
        {
            try
            {
                var password = Encoding.UTF8.GetString(Convert.FromBase64String(session.PasswordB64));
                var (ok, _, _) = await LoginAsync(session.JellyfinUserId, session.LetterboxdUsername, password)
                    .ConfigureAwait(false);
                if (ok)
                {
                    var refreshed = GetSession(session.JellyfinUserId);
                    return refreshed?.AccessToken;
                }
            }
            catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Re-auth failed"); }
        }

        return null;
    }

    // ── API helpers ───────────────────────────────────────────────────────────

    private static HttpClient MakeApiClient()
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        client.DefaultRequestHeaders.UserAgent.ParseAdd("JellyfinLetterboxdPlugin/1.0");
        return client;
    }

    private static async Task<HttpResponseMessage> SendSignedAsync(
        HttpClient http, HttpMethod method, string path,
        string? body = null, string? contentType = null,
        string? queryParams = null, bool authenticated = false,
        string? accessToken = null)
    {
        var nonce     = Guid.NewGuid().ToString();
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

        var url = string.IsNullOrEmpty(queryParams)
            ? $"{ApiBase}{path}?apikey={ApiKey}&nonce={nonce}&timestamp={timestamp}"
            : $"{ApiBase}{path}?{queryParams}&apikey={ApiKey}&nonce={nonce}&timestamp={timestamp}";

        var bodyStr  = body ?? string.Empty;
        var sigInput = $"{method.Method}\0{url}\0{bodyStr}";
        var sig      = ComputeHmac(ApiSecret, sigInput);
        url         += $"&signature={sig}";

        using var req = new HttpRequestMessage(method, url);
        if (authenticated && !string.IsNullOrEmpty(accessToken))
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        if (body is not null && contentType is not null)
            req.Content = new StringContent(body, Encoding.UTF8, contentType);

        return await http.SendAsync(req).ConfigureAwait(false);
    }

    private static string ComputeHmac(string secret, string message)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(message))).Replace("-", string.Empty).ToLowerInvariant();
    }

    private async Task<string?> ApiFilmLookupAsync(string accessToken, string queryParams)
    {
        using var http = MakeApiClient();
        try
        {
            var resp = await SendSignedAsync(http, HttpMethod.Get, "/films", queryParams: queryParams,
                authenticated: true, accessToken: accessToken).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return null;
            var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            var items = doc.RootElement.GetProperty("items");
            return items.GetArrayLength() > 0 ? items[0].GetProperty("id").GetString() : null;
        }
        catch { return null; }
    }

    private async Task<string?> ApiSearchAsync(string accessToken, string query)
    {
        using var http = MakeApiClient();
        try
        {
            var qp   = $"input={Uri.EscapeDataString(query)}&searchMethod=FullText&include=FilmSearchItem&perPage=5";
            var resp = await SendSignedAsync(http, HttpMethod.Get, "/search", queryParams: qp,
                authenticated: true, accessToken: accessToken).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return null;
            var json = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            foreach (var r in doc.RootElement.GetProperty("results").EnumerateArray())
            {
                if (r.TryGetProperty("type", out var t) && t.GetString() == "FilmSearchItem" &&
                    r.TryGetProperty("film", out var film) &&
                    film.TryGetProperty("id", out var id))
                    return id.GetString();
            }
        }
        catch { }
        return null;
    }

    // ── Wikidata + slug-based film resolution (fallback) ─────────────────────

    private async Task<string?> FindSlugFromWikidataAsync(string prop, string externalId)
    {
        var sparql = $"SELECT ?lb WHERE {{ ?film wdt:{prop} \"{externalId}\" . ?film wdt:P6127 ?lb . }}";
        var url    = $"https://query.wikidata.org/sparql?format=json&query={Uri.EscapeDataString(sparql)}";
        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "JellyfinLetterboxdPlugin/1.0");
            var json = await client.GetStringAsync(url).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            var bindings = doc.RootElement.GetProperty("results").GetProperty("bindings");
            if (bindings.GetArrayLength() > 0)
                return bindings[0].GetProperty("lb").GetProperty("value").GetString();
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Wikidata lookup failed for {P}={Id}", prop, externalId); }
        return null;
    }

    private async Task<string?> FindFilmIdBySlugAsync(string slug)
    {
        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UserAgent);
            var html = await client.GetStringAsync($"{LbBase}/film/{slug}/").ConfigureAwait(false);
            return ExtractFilmIdFromPage(html);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Letterboxd] Slug lookup failed for '{Slug}'", slug); return null; }
    }

    private static IEnumerable<string> BuildSlugGuesses(string title, int? year)
    {
        var slug = Regex.Replace(title.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (year.HasValue) yield return $"{slug}-{year}";
        yield return slug;
    }

    // ── Helpers web (fallback cookies) ────────────────────────────────────────

    private static HttpClient MakeCookieClient(string cookieStr)
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", UserAgent);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie",    cookieStr);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Origin",    LbBase);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Referer",   $"{LbBase}/");
        return client;
    }

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
        if (!string.IsNullOrEmpty(cookieStr))
            client.DefaultRequestHeaders.TryAddWithoutValidation("Cookie", cookieStr);
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,*/*;q=0.9");
        return client;
    }

    private static string? ExtractFilmIdFromPage(string html)
    {
        var m = Regex.Match(html, @"""uid""\s*:\s*""film:(\d+)""");
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"data-film-id=""(\d+)""");
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"""filmId""\s*:\s*(\d+)");
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string? ExtractAvatarUrl(string html)
    {
        var m = Regex.Match(html, @"<img[^>]+class=""avatar[^""]*""[^>]+src=""(https://[^""]+)""", RegexOptions.IgnoreCase);
        if (m.Success) return m.Groups[1].Value;
        m = Regex.Match(html, @"avatar[^<]{0,200}src=""(https://a\.ltrbxd\.com[^""]+)""", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        return m.Success ? m.Groups[1].Value : null;
    }

    private static string? ExtractApiAvatarUrl(JsonElement member)
    {
        try
        {
            if (!member.TryGetProperty("avatar", out var avatar)) return null;
            if (!avatar.TryGetProperty("sizes", out var sizes)) return null;
            // Prendre la plus grande image disponible
            string? url = null;
            int maxWidth = 0;
            foreach (var s in sizes.EnumerateArray())
            {
                var w = s.TryGetProperty("width", out var wEl) ? wEl.GetInt32() : 0;
                if (w > maxWidth && s.TryGetProperty("url", out var uEl))
                {
                    url = uEl.GetString();
                    maxWidth = w;
                }
            }
            return url;
        }
        catch { return null; }
    }

    private void SaveSession(UserSession session)
        => File.WriteAllText(SessionPath(session.JellyfinUserId),
            JsonSerializer.Serialize(session, _jsonOpts), Encoding.UTF8);

    private string SessionPath(string userId)
        => Path.Combine(_dataDir, $"{userId}.json");
}

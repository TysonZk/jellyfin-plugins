using System;

namespace Jellyfin.Plugin.Letterboxd.Models;

/// <summary>Session Letterboxd d'un utilisateur Jellyfin.</summary>
public sealed class UserSession
{
    /// <summary>ID utilisateur Jellyfin.</summary>
    public string JellyfinUserId { get; set; } = string.Empty;

    /// <summary>Nom d'utilisateur Letterboxd.</summary>
    public string LetterboxdUsername { get; set; } = string.Empty;

    /// <summary>URL de l'avatar Letterboxd.</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>Date de connexion.</summary>
    public DateTime ConnectedAt { get; set; }

    // ── API officielle (méthode préférée, sans Cloudflare) ────────────────────

    /// <summary>Mot de passe en base64 pour renouvellement silencieux.</summary>
    public string? PasswordB64 { get; set; }

    /// <summary>OAuth2 access token (court terme).</summary>
    public string? AccessToken { get; set; }

    /// <summary>OAuth2 refresh token (long terme).</summary>
    public string? RefreshToken { get; set; }

    /// <summary>Expiration UTC du access token.</summary>
    public DateTime? TokenExpiry { get; set; }

    /// <summary>LID du membre (ex: "ab12cd"), requis pour les appels API.</summary>
    public string? MemberId { get; set; }

    // ── Fallback cookies navigateur ───────────────────────────────────────────

    /// <summary>Cookies copiés depuis le navigateur (fallback si API indisponible).</summary>
    public string? CookieString { get; set; }

    /// <summary>True si la session dispose d'un token API valide.</summary>
    public bool HasApiToken => !string.IsNullOrEmpty(AccessToken);
}

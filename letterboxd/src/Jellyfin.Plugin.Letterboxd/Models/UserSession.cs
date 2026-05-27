using System;

namespace Jellyfin.Plugin.Letterboxd.Models;

/// <summary>Session Letterboxd d'un utilisateur Jellyfin.</summary>
public sealed class UserSession
{
    /// <summary>ID utilisateur Jellyfin.</summary>
    public string JellyfinUserId { get; set; } = string.Empty;

    /// <summary>Nom d'utilisateur Letterboxd.</summary>
    public string LetterboxdUsername { get; set; } = string.Empty;

    /// <summary>Cookies de session (valeur de l'en-tête Cookie).</summary>
    public string CookieString { get; set; } = string.Empty;

    /// <summary>Date de connexion.</summary>
    public DateTime ConnectedAt { get; set; }
}

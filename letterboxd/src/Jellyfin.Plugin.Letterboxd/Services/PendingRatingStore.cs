using System;
using System.Collections.Concurrent;

namespace Jellyfin.Plugin.Letterboxd.Services;

/// <summary>Film en attente de notation.</summary>
public sealed class PendingRating
{
    /// <summary>ID Jellyfin de l'item.</summary>
    public string ItemId    { get; init; } = string.Empty;
    /// <summary>Titre du film.</summary>
    public string Title     { get; init; } = string.Empty;
    /// <summary>Année de production.</summary>
    public int?   Year      { get; init; }
    /// <summary>ID IMDB.</summary>
    public string? ImdbId   { get; init; }
    /// <summary>ID TMDB.</summary>
    public string? TmdbId   { get; init; }
}

/// <summary>Stocke en mémoire une notation en attente par utilisateur Jellyfin.</summary>
public sealed class PendingRatingStore
{
    private readonly ConcurrentDictionary<string, PendingRating> _pending = new();

    /// <summary>Enregistre une notation en attente pour un utilisateur.</summary>
    public void Set(string userId, PendingRating rating)
        => _pending[userId] = rating;

    /// <summary>Retourne la notation en attente, ou null.</summary>
    public PendingRating? Get(string userId)
        => _pending.TryGetValue(userId, out var r) ? r : null;

    /// <summary>Efface la notation en attente.</summary>
    public void Clear(string userId)
        => _pending.TryRemove(userId, out _);
}

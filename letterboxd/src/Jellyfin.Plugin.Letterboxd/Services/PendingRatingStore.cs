using System;
using System.Collections.Concurrent;

namespace Jellyfin.Plugin.Letterboxd.Services;

/// <summary>Film en attente de notation.</summary>
public sealed class PendingRating
{
    public string ItemId    { get; init; } = string.Empty;
    public string Title     { get; init; } = string.Empty;
    public int?   Year      { get; init; }
    public string? ImdbId   { get; init; }
    public string? TmdbId   { get; init; }
}

/// <summary>Stocke en mémoire une notation en attente par utilisateur Jellyfin.</summary>
public sealed class PendingRatingStore
{
    private readonly ConcurrentDictionary<string, PendingRating> _pending = new();

    public void Set(string userId, PendingRating rating)
        => _pending[userId] = rating;

    public PendingRating? Get(string userId)
        => _pending.TryGetValue(userId, out var r) ? r : null;

    public void Clear(string userId)
        => _pending.TryRemove(userId, out _);
}

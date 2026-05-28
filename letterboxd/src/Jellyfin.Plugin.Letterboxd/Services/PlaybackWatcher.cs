using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Letterboxd.Services;

/// <summary>
/// Écoute l'événement UserDataSaved côté serveur pour détecter la fin d'un film
/// sans dépendre de l'interception fetch côté client.
/// </summary>
public sealed class PlaybackWatcher : IHostedService
{
    private readonly IUserDataManager _userDataManager;
    private readonly LetterboxdService _lb;
    private readonly PendingRatingStore _store;
    private readonly ILogger<PlaybackWatcher> _logger;

    /// <summary>Initializes a new instance of the <see cref="PlaybackWatcher"/> class.</summary>
    public PlaybackWatcher(
        IUserDataManager userDataManager,
        LetterboxdService lb,
        PendingRatingStore store,
        ILogger<PlaybackWatcher> logger)
    {
        _userDataManager = userDataManager;
        _lb              = lb;
        _store           = store;
        _logger          = logger;
    }

    /// <inheritdoc/>
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _userDataManager.UserDataSaved += OnUserDataSaved;
        _logger.LogInformation("[Letterboxd] PlaybackWatcher started");
        return Task.CompletedTask;
    }

    /// <inheritdoc/>
    public Task StopAsync(CancellationToken cancellationToken)
    {
        _userDataManager.UserDataSaved -= OnUserDataSaved;
        return Task.CompletedTask;
    }

    private void OnUserDataSaved(object? sender, UserDataSaveEventArgs e)
    {
        // Seulement quand un film est marqué comme vu (fin de lecture ou manuel)
        if (e.SaveReason != UserDataSaveReason.PlaybackFinished &&
            e.SaveReason != UserDataSaveReason.TogglePlayed)
            return;

        // Seulement si l'item passe à "vu" (pas quand on le démarque)
        if (!e.UserData.Played) return;

        // Seulement pour les films
        if (e.Item is not Movie movie) return;

        var userId = e.UserId.ToString("N");

        // Seulement si l'utilisateur a une session Letterboxd active
        if (_lb.GetSession(userId) is null) return;

        movie.ProviderIds.TryGetValue("Imdb", out var imdbId);
        movie.ProviderIds.TryGetValue("Tmdb", out var tmdbId);

        _store.Set(userId, new PendingRating
        {
            ItemId = movie.Id.ToString("N"),
            Title  = movie.Name ?? string.Empty,
            Year   = movie.ProductionYear,
            ImdbId = imdbId,
            TmdbId = tmdbId,
        });

        _logger.LogInformation("[Letterboxd] Rating queued for {UserId}: {Title} ({Year})",
            userId, movie.Name, movie.ProductionYear);
    }
}

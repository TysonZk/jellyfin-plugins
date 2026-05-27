using Jellyfin.Plugin.Letterboxd.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Letterboxd;

/// <summary>Enregistre les services du plugin Letterboxd.</summary>
public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc/>
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<LetterboxdService>();
        serviceCollection.AddHostedService<IndexPatcher>();
    }
}

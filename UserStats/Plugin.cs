using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Jellyfin.Plugin.UserStats.Configuration;

namespace Jellyfin.Plugin.UserStats;

/// <summary>Jellyfin UserStats plugin — affiche stats et niveaux sur les profils.</summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <inheritdoc/>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>Singleton accessible depuis les controllers.</summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc/>
    public override string Name => "User Stats";

    /// <inheritdoc/>
    public override string Description => "Statistiques de visionnage et niveaux XP sur les profils Jellyfin.";

    /// <inheritdoc/>
    public override Guid Id => Guid.Parse("a4f7e8c2-3b12-4d56-9870-1e23cf567890");

    /// <inheritdoc/>
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name        = "userstats",
                DisplayName = "User Stats",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.config.html"
            }
        };
    }
}

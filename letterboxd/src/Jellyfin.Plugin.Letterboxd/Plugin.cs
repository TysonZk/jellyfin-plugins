using System;
using System.Collections.Generic;
using Jellyfin.Plugin.Letterboxd.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Letterboxd;

/// <summary>Plugin Letterboxd pour Jellyfin.</summary>
public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>Singleton du plugin.</summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>Initializes a new instance of the <see cref="Plugin"/> class.</summary>
    public Plugin(IApplicationPaths appPaths, IXmlSerializer xmlSerializer)
        : base(appPaths, xmlSerializer) => Instance = this;

    /// <inheritdoc/>
    public override string Name => "Letterboxd";

    /// <inheritdoc/>
    public override Guid Id => Guid.Parse("c2d3e4f5-6a7b-4890-ab12-3456789012cd");

    /// <inheritdoc/>
    public IEnumerable<PluginPageInfo> GetPages() =>
        new[]
        {
            new PluginPageInfo
            {
                Name                 = "letterboxd",
                DisplayName          = "Letterboxd",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.config.html",
            },
        };
}

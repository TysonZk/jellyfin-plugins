using System;
using System.Collections.Generic;
using Jellyfin.Plugin.Seerr.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Seerr;

/// <summary>Plugin principal Jellyseerr.</summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>Instance singleton du plugin.</summary>
    public static Plugin? Instance { get; private set; }

    /// <summary>Initializes a new instance of the <see cref="Plugin"/> class.</summary>
    public Plugin(IApplicationPaths appPaths, IXmlSerializer xmlSerializer)
        : base(appPaths, xmlSerializer) => Instance = this;

    /// <inheritdoc/>
    public override string Name => "Jellyseerr";

    /// <inheritdoc/>
    public override Guid Id => Guid.Parse("b8f4e2d1-7c34-4a56-8901-2e3456789012");

    /// <inheritdoc/>
    public IEnumerable<PluginPageInfo> GetPages() =>
        new[]
        {
            new PluginPageInfo
            {
                Name                 = "jellyseerr",
                DisplayName          = "Jellyseerr",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.config.html",
            }
        };
}

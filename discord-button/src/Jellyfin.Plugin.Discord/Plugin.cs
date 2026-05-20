using System;
using System.Collections.Generic;
using Jellyfin.Plugin.Discord.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Discord;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths appPaths, IXmlSerializer xmlSerializer)
        : base(appPaths, xmlSerializer) { }

    public override string Name => "Discord Button";
    public override Guid   Id   => Guid.Parse("c3f19a72-5d84-4e6b-a017-3b9e21cf8401");

    public IEnumerable<PluginPageInfo> GetPages() =>
        new[]
        {
            new PluginPageInfo
            {
                Name                = "discordbutton",
                DisplayName         = "Discord Button",
                EmbeddedResourcePath = $"{GetType().Namespace}.Web.config.html",
            }
        };
}

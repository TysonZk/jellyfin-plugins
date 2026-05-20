using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Discord.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public string DiscordInviteUrl { get; set; } = "";
    public string ButtonTooltip   { get; set; } = "Rejoindre notre Discord";
    public bool   OpenInNewTab    { get; set; } = true;
    public bool   ShowButton      { get; set; } = true;
}

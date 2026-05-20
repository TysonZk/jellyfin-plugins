using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Discord.Controllers;

[ApiController]
public class DiscordWidgetController : ControllerBase
{
    // La config est injectée directement dans la réponse JS — aucun fetch côté client.
    [HttpGet("/JfDiscord/widget.js")]
    public IActionResult GetWidget()
    {
        var cfg = Plugin.Instance?.Configuration;

        var url     = cfg?.DiscordInviteUrl ?? "";
        var tooltip = cfg?.ButtonTooltip    ?? "Rejoindre notre Discord";
        var newTab  = cfg?.OpenInNewTab     ?? true;
        var show    = cfg?.ShowButton       ?? true;

        var configLine = new StringBuilder();
        configLine.Append("window._JF_DISCORD = {");
        configLine.Append($"url:{JsonSerializer.Serialize(url)},");
        configLine.Append($"tooltip:{JsonSerializer.Serialize(tooltip)},");
        configLine.Append($"newTab:{(newTab ? "true" : "false")},");
        configLine.Append($"show:{(show ? "true" : "false")}");
        configLine.AppendLine("};");

        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.Discord.Web.widget.js");
        if (stream is null) return NotFound();

        using var reader = new StreamReader(stream, Encoding.UTF8);
        var widgetJs = reader.ReadToEnd();

        var response = configLine + widgetJs;
        return Content(response, "application/javascript; charset=utf-8");
    }
}

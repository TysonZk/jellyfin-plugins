using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Discord.Controllers;

[ApiController]
public class DiscordWidgetController : ControllerBase
{
    [HttpGet("/JfDiscord/widget.js")]
    public IActionResult GetWidget()
    {
        var cfg    = Plugin.Instance?.Configuration;
        var url    = cfg?.DiscordInviteUrl  ?? "";
        var newTab = cfg?.OpenInNewTab      ?? true;
        var show   = cfg?.ShowButton        ?? true;
        var label  = cfg?.ButtonTooltip     ?? "Discord";

        var sb = new StringBuilder();
        sb.Append("window._JF_DISCORD={");
        sb.Append($"url:{JsonSerializer.Serialize(url)},");
        sb.Append($"newTab:{(newTab ? "true" : "false")},");
        sb.Append($"show:{(show ? "true" : "false")},");
        sb.Append($"label:{JsonSerializer.Serialize(label)}");
        sb.AppendLine("};");

        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.Discord.Web.widget.js");
        if (stream is null) return NotFound();

        using var reader = new System.IO.StreamReader(stream, Encoding.UTF8);
        var js = reader.ReadToEnd();

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return Content(sb + js, "application/javascript; charset=utf-8");
    }
}

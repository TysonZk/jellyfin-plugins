using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Discord.Controllers;

[ApiController]
public class DiscordWidgetController : ControllerBase
{
    [HttpGet("/JfDiscord/widget.js")]
    public IActionResult GetWidget()
    {
        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.Discord.Web.widget.js");
        if (stream is null) return NotFound();

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return File(stream, "application/javascript; charset=utf-8");
    }
}

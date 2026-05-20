using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Seerr.Controllers;

/// <summary>Sert widget.js avec la configuration injectée.</summary>
[ApiController]
public class SerrWidgetController : ControllerBase
{
    /// <summary>Retourne le widget JavaScript avec la config embarquée.</summary>
    [HttpGet("/JfSeerr/widget.js")]
    public IActionResult GetWidget()
    {
        var cfg = Plugin.Instance?.Configuration;
        var url    = cfg?.JellyseerrUrl  ?? "";
        var label  = cfg?.ButtonLabel    ?? "Demandes";
        var desc   = cfg?.Description    ?? "Demandez des films et séries à ajouter à la médiathèque.";
        var newTab = cfg?.OpenInNewTab   ?? true;
        var show   = cfg?.ShowSection    ?? true;

        var sb = new StringBuilder();
        sb.Append("window._JF_SEERR={");
        sb.Append($"url:{JsonSerializer.Serialize(url)},");
        sb.Append($"label:{JsonSerializer.Serialize(label)},");
        sb.Append($"desc:{JsonSerializer.Serialize(desc)},");
        sb.Append($"newTab:{(newTab ? "true" : "false")},");
        sb.Append($"show:{(show ? "true" : "false")}");
        sb.AppendLine("};");

        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("Jellyfin.Plugin.Seerr.Web.widget.js");
        if (stream is null) return NotFound();

        using var reader = new System.IO.StreamReader(stream, Encoding.UTF8);
        var js = reader.ReadToEnd();

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return Content(sb + js, "application/javascript; charset=utf-8");
    }
}

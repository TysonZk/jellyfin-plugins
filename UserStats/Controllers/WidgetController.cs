using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UserStats.Controllers;

/// <summary>Sert le widget JavaScript depuis la ressource embarquée dans le DLL.</summary>
[ApiController]
[Route("JfStats")]
public class WidgetController : ControllerBase
{
    /// <summary>
    /// Retourne widget.js — le fichier JavaScript du plugin.
    /// Appelé automatiquement par le loader injecté dans index.html.
    /// </summary>
    /// <returns>Le fichier JavaScript du widget.</returns>
    [HttpGet("widget.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetWidget()
    {
        const string resourceName = "Jellyfin.Plugin.UserStats.Web.widget.js";
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }

        // Cache 1h — mise à jour effective au redémarrage Jellyfin
        Response.Headers["Cache-Control"] = "public, max-age=3600";
        return File(stream, "application/javascript");
    }
}

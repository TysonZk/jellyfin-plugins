using System;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Seerr.Services;

/// <summary>Injecte le bouton Jellyseerr dans le header.</summary>
public class IndexPatcher : IHostedService
{
    private const string BtnId = "jf-seerr-btn";

    private const string Svg =
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' width='16' height='16'>" +
        "<path d='M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 " +
        ".9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 " +
        ".45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'/>" +
        "</svg>";

    private const string BtnStyle =
        "position:fixed;top:13px;right:231px;z-index:10000;" +
        "width:28px;height:28px;border-radius:50%;" +
        "background:#E5A00D;color:#fff;" +
        "display:flex;" +
        "align-items:center;justify-content:center;" +
        "cursor:pointer;text-decoration:none;border:none;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.5);" +
        "opacity:0;transition:opacity .25s ease;";

    private static string LoaderScript =>
        $"<script defer=\"defer\" src=\"/JfSeerr/widget.js?v={Plugin.Instance?.Version?.ToString() ?? "1"}\"></script>";

    private readonly ILogger<IndexPatcher> _logger;

    /// <summary>Initializes a new instance of the <see cref="IndexPatcher"/> class.</summary>
    public IndexPatcher(ILogger<IndexPatcher> logger) => _logger = logger;

    /// <inheritdoc/>
    public Task StartAsync(CancellationToken ct)
    {
        ExtractLogo();
        PatchIndex();
        return Task.CompletedTask;
    }

    /// <inheritdoc/>
    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    private void ExtractLogo()
    {
        try
        {
            var pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
            var dest = Path.Combine(pluginDir, "logo.png");
            if (File.Exists(dest)) return;
            using var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("Jellyfin.Plugin.Seerr.Web.logo.png");
            if (stream is null) return;
            using var fs = File.Create(dest);
            stream.CopyTo(fs);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Seerr] Could not extract logo"); }
    }

    private void PatchIndex()
    {
        var path = FindIndexHtml();
        if (path is null) { _logger.LogWarning("[Seerr] index.html not found"); return; }

        try
        {
            var html = File.ReadAllText(path);

            // Supprimer les anciennes injections
            html = Regex.Replace(html, @"<a[^>]*id=""jf-seerr-btn""[^>]*>.*?</a>",
                "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            html = Regex.Replace(html, @"<script[^>]*/JfSeerr/widget\.js[^>]*></script>",
                "", RegexOptions.IgnoreCase);

            if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase)) return;

            var cfg     = Plugin.Instance?.Configuration;
            var url     = string.IsNullOrWhiteSpace(cfg?.JellyseerrUrl) ? "javascript:void(0)" : cfg.JellyseerrUrl;
            var target  = (cfg?.OpenInNewTab ?? true) ? " target=\"_blank\"" : "";
            var tooltip = System.Net.WebUtility.HtmlEncode(cfg?.ButtonLabel ?? "Demandes");
            var show    = cfg?.ShowSection ?? true;

            var btn = show
                ? $"<a id=\"{BtnId}\" href=\"{System.Net.WebUtility.HtmlEncode(url)}\"{target}" +
                  $" title=\"{tooltip}\" aria-label=\"{tooltip}\" style=\"{BtnStyle}\" rel=\"noopener\">{Svg}</a>"
                : "";

            html = html.Replace("</body>", btn + LoaderScript + "\n</body>",
                StringComparison.OrdinalIgnoreCase);
            File.WriteAllText(path, html);
            _logger.LogInformation("[Seerr] index.html patched at {Path}", path);
        }
        catch (UnauthorizedAccessException) { _logger.LogWarning("[Seerr] index.html is read-only"); }
        catch (Exception ex) { _logger.LogError(ex, "[Seerr] Failed to patch index.html"); }
    }

    private static string? FindIndexHtml()
    {
        var candidates = new[]
        {
            System.IO.Path.Combine(
                System.IO.Path.GetDirectoryName(System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName ?? "") ?? "",
                "jellyfin-web", "index.html"),
            "/jellyfin/jellyfin-web/index.html",
            "/usr/share/jellyfin/web/index.html",
            "/usr/lib/jellyfin/web/index.html",
        };
        foreach (var p in candidates)
            if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
        return null;
    }
}

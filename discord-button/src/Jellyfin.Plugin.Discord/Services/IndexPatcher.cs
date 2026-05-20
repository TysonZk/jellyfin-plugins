using System;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Discord.Services;

public class IndexPatcher : IHostedService
{
    private const string BtnId   = "jf-discord-btn";
    private const string Marker  = "jf-discord-btn";

    // SVG Discord logo inline
    private const string Svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 127.14 96.36' fill='currentColor' width='14' height='14'><path d='M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z'/></svg>";

    private const string BtnStyle =
        "position:fixed;top:14px;right:110px;z-index:10000;" +
        "width:24px;height:24px;border-radius:50%;" +
        "background:#5865F2;color:#fff;" +
        "display:none;" +                          // widget.js l'active
        "align-items:center;justify-content:center;" +
        "cursor:pointer;text-decoration:none;border:none;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.5);";

    private readonly ILogger<IndexPatcher> _logger;

    public IndexPatcher(ILogger<IndexPatcher> logger) => _logger = logger;

    public Task StartAsync(CancellationToken ct)
    {
        ExtractLogo();
        PatchIndex();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    // ── Logo extraction ──────────────────────────────────────────────────────
    private void ExtractLogo()
    {
        try
        {
            var pluginDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
            var dest = Path.Combine(pluginDir, "logo.png");
            if (File.Exists(dest)) return;
            using var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("Jellyfin.Plugin.Discord.Web.logo.png");
            if (stream is null) return;
            using var fs = File.Create(dest);
            stream.CopyTo(fs);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "[Discord] Could not extract logo"); }
    }

    // ── Index.html patching ──────────────────────────────────────────────────
    private void PatchIndex()
    {
        var path = FindIndexHtml();
        if (path is null) { _logger.LogWarning("[Discord] index.html not found"); return; }

        try
        {
            var html = File.ReadAllText(path);

            // Supprimer toute injection précédente
            html = Regex.Replace(html, @"<a[^>]*id=""jf-discord-btn""[^>]*>.*?</a>",
                "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            html = Regex.Replace(html, @"<script[^>]*JfDiscord[^>]*></script>",
                "", RegexOptions.IgnoreCase);

            // Construire le bouton HTML + le script
            var btn    = $"<a id=\"{BtnId}\" href=\"#\" style=\"{BtnStyle}\" rel=\"noopener\">{Svg}</a>";
            var script = "<script defer=\"defer\" src=\"/JfDiscord/widget.js\"></script>";
            html = html.Replace("</body>", btn + script + "\n</body>");

            File.WriteAllText(path, html);
            _logger.LogInformation("[Discord] index.html patched at {Path}", path);
        }
        catch (UnauthorizedAccessException) { _logger.LogWarning("[Discord] index.html is read-only"); }
        catch (Exception ex) { _logger.LogError(ex, "[Discord] Failed to patch index.html"); }
    }

    private static string? FindIndexHtml()
    {
        var candidates = new[]
        {
            Path.Combine(
                Path.GetDirectoryName(System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName ?? "") ?? "",
                "jellyfin-web", "index.html"),
            "/usr/share/jellyfin/web/index.html",
            "/usr/lib/jellyfin/web/index.html",
            "/jellyfin/jellyfin-web/index.html",
        };
        foreach (var p in candidates)
            if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
        return null;
    }
}

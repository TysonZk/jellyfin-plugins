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
    private static string LoaderScript =>
        "<script defer=\"defer\" src=\"/JfDiscord/widget.js\"></script>";

    private readonly ILogger<IndexPatcher> _logger;

    public IndexPatcher(ILogger<IndexPatcher> logger) => _logger = logger;

    public Task StartAsync(CancellationToken ct)
    {
        ExtractLogo();
        PatchIndex();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

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

    private void PatchIndex()
    {
        var path = FindIndexHtml();
        if (path is null) { _logger.LogWarning("[Discord] index.html not found"); return; }

        try
        {
            var html = File.ReadAllText(path);

            // Supprimer toute injection précédente (bouton HTML + script)
            html = Regex.Replace(html, @"<a[^>]*id=""jf-discord-btn""[^>]*>.*?</a>",
                "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            html = Regex.Replace(html, @"<script[^>]*/JfDiscord/widget\.js[^>]*></script>",
                "", RegexOptions.IgnoreCase);

            if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase)) return;

            html = html.Replace("</body>", LoaderScript + "\n</body>",
                StringComparison.OrdinalIgnoreCase);
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

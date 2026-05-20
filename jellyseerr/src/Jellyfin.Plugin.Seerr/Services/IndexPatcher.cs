using System;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Seerr.Services;

/// <summary>Injecte le script du plugin dans index.html au démarrage.</summary>
public class IndexPatcher : IHostedService
{
    private static string LoaderTag =>
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

            // Supprimer l'ancienne injection
            html = Regex.Replace(html, @"<script[^>]*/JfSeerr/widget\.js[^>]*></script>",
                "", RegexOptions.IgnoreCase);

            if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase)) return;

            html = html.Replace("</body>", LoaderTag + "\n</body>", StringComparison.OrdinalIgnoreCase);
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
            Path.Combine(
                Path.GetDirectoryName(System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName ?? "") ?? "",
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

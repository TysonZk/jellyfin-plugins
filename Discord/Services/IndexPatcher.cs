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
    private const string ScriptTag  = "<script defer=\"defer\" src=\"/JfDiscord/widget.js\"></script>";
    private const string Marker     = "JfDiscord/widget.js";

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
            _logger.LogInformation("[Discord] logo.png extracted to {Dir}", pluginDir);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Discord] Could not extract logo");
        }
    }

    // ── Index.html patching ──────────────────────────────────────────────────
    private void PatchIndex()
    {
        var path = FindIndexHtml();
        if (path is null)
        {
            _logger.LogWarning("[Discord] index.html not found — widget not injected");
            return;
        }

        try
        {
            var html = File.ReadAllText(path);
            if (html.Contains(Marker))
            {
                _logger.LogInformation("[Discord] index.html already patched");
                return;
            }

            // Remove any stale injection first
            html = Regex.Replace(html, @"<script[^>]*JfDiscord[^>]*></script>", "",
                RegexOptions.IgnoreCase);

            html = html.Replace("</body>", ScriptTag + "\n</body>");
            File.WriteAllText(path, html);
            _logger.LogInformation("[Discord] index.html patched at {Path}", path);
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogWarning("[Discord] index.html is read-only — cannot patch");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Discord] Failed to patch index.html");
        }
    }

    private static string? FindIndexHtml()
    {
        var candidates = new[]
        {
            // next to the running process
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

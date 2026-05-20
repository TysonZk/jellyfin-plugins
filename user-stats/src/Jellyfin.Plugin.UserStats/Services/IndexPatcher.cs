using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UserStats.Services;

/// <summary>
/// Patches jellyfin-web/index.html on every Jellyfin startup to inject the widget.js loader.
/// This makes the plugin self-installing: drop the DLL in plugins/ and restart.
/// Runs again after a Jellyfin update so the fresh index.html is always patched.
/// </summary>
public class IndexPatcher : IHostedService
{
    private static string LoaderTag =>
        $"<script defer=\"defer\" src=\"/JfStats/widget.js?v={Plugin.Instance?.Version?.ToString() ?? "1"}\"></script>";

    private readonly ILogger<IndexPatcher> _logger;

    /// <summary>Initializes a new instance of the <see cref="IndexPatcher"/> class.</summary>
    public IndexPatcher(ILogger<IndexPatcher> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc/>
    public Task StartAsync(CancellationToken cancellationToken)
    {
        try { ExtractLogo(); }
        catch (Exception ex) { _logger.LogError(ex, "[UserStats] Failed to extract logo.png"); }

        try { PatchIndex(); }
        catch (Exception ex) { _logger.LogError(ex, "[UserStats] Unexpected error while patching index.html"); }

        return Task.CompletedTask;
    }

    private void ExtractLogo()
    {
        var pluginDir = Path.GetDirectoryName(GetType().Assembly.Location);
        if (pluginDir is null) return;

        var dest = Path.Combine(pluginDir, "logo.png");
        if (File.Exists(dest)) return;

        const string resource = "Jellyfin.Plugin.UserStats.Web.logo.png";
        using var stream = GetType().Assembly.GetManifestResourceStream(resource);
        if (stream is null) return;

        using var fs = File.Create(dest);
        stream.CopyTo(fs);
        _logger.LogInformation("[UserStats] logo.png extrait dans {Path}", dest);
    }

    /// <inheritdoc/>
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private void PatchIndex()
    {
        var indexPath = FindIndexHtml();
        if (indexPath is null)
        {
            _logger.LogWarning("[UserStats] Could not locate jellyfin-web/index.html — widget will not be injected automatically.");
            return;
        }

        string content;
        try
        {
            content = File.ReadAllText(indexPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[UserStats] Failed to read {Path}", indexPath);
            return;
        }

        // Remove any previous injection (any version) before re-injecting
        content = System.Text.RegularExpressions.Regex.Replace(
            content,
            @"<script[^>]*/JfStats/widget\.js[^>]*></script>",
            "",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (!content.Contains("</body>", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("[UserStats] </body> tag not found in {Path} — skipping.", indexPath);
            return;
        }

        content = content.Replace(
            "</body>",
            LoaderTag + "</body>",
            StringComparison.OrdinalIgnoreCase);

        try
        {
            File.WriteAllText(indexPath, content);
            _logger.LogInformation("[UserStats] index.html patched at {Path}", indexPath);
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogWarning(
                "[UserStats] Cannot write to {Path} (read-only mount?). " +
                "Run update.sh manually or remove the :ro flag from the index.html volume mount.",
                indexPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[UserStats] Failed to write patched index.html to {Path}", indexPath);
        }
    }

    private static string? FindIndexHtml()
    {
        // Primary: resolve from the Jellyfin process executable (works on all platforms)
        try
        {
            var exe = Process.GetCurrentProcess().MainModule?.FileName;
            if (exe is not null)
            {
                var candidate = Path.Combine(Path.GetDirectoryName(exe)!, "jellyfin-web", "index.html");
                if (File.Exists(candidate))
                    return candidate;
            }
        }
        catch
        {
            // ignore — fall through to known paths
        }

        // Fallbacks for common installation layouts
        string[] knownPaths =
        [
            "/jellyfin/jellyfin-web/index.html",                         // Docker official image
            "/usr/share/jellyfin/web/index.html",                        // Debian/Ubuntu package
            "/usr/lib/jellyfin/jellyfin-web/index.html",                 // RPM-based distros
            @"C:\Program Files\Jellyfin\Server\jellyfin-web\index.html", // Windows installer
        ];

        foreach (var path in knownPaths)
        {
            if (File.Exists(path))
                return path;
        }

        return null;
    }
}

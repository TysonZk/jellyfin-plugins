using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UserStats.Services;

/// <summary>
/// Ensures every user has default subtitle burn-in preferences.
/// Runs on startup then every 5 minutes to catch newly created accounts.
/// </summary>
public class UserDefaultsHandler : BackgroundService
{
    private const string DbPath = "/config/data/jellyfin.db";

    private static readonly (string Key, string Value)[] SubtitleDefaults =
    [
        ("subtitleBurnIn",                     "all"),
        ("alwaysBurnInSubtitleWhenTranscoding", "true"),
    ];

    private readonly ILogger<UserDefaultsHandler> _logger;

    /// <summary>Initializes a new instance of the <see cref="UserDefaultsHandler"/> class.</summary>
    public UserDefaultsHandler(ILogger<UserDefaultsHandler> logger) => _logger = logger;

    /// <inheritdoc/>
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // First run after a short delay to let Jellyfin finish startup
        await Task.Delay(TimeSpan.FromSeconds(15), ct).ConfigureAwait(false);

        while (!ct.IsCancellationRequested)
        {
            try { ApplyDefaults(); }
            catch (Exception ex) { _logger.LogWarning(ex, "[UserStats] Could not apply subtitle defaults"); }

            await Task.Delay(TimeSpan.FromMinutes(5), ct).ConfigureAwait(false);
        }
    }

    private void ApplyDefaults()
    {
        using var conn = new SqliteConnection($"Data Source={DbPath}");
        conn.Open();

        // Get all user IDs
        var users = new System.Collections.Generic.List<string>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT Id FROM Users";
            using var r = cmd.ExecuteReader();
            while (r.Read()) users.Add(r.GetString(0));
        }

        int applied = 0;
        foreach (var uid in users)
        {
            foreach (var (key, value) in SubtitleDefaults)
            {
                using var cmd = conn.CreateCommand();
                // Insert only if not already set
                cmd.CommandText = """
                    INSERT OR IGNORE INTO CustomItemDisplayPreferences
                        (Client, ItemId, Key, UserId, Value)
                    VALUES
                        ('emby', '00000000-0000-0000-0000-000000000000', @key, @uid, @val)
                    """;
                cmd.Parameters.AddWithValue("@key", key);
                cmd.Parameters.AddWithValue("@uid", uid);
                cmd.Parameters.AddWithValue("@val", value);
                applied += cmd.ExecuteNonQuery();
            }
        }

        if (applied > 0)
            _logger.LogInformation("[UserStats] Applied subtitle defaults to {Count} missing preferences", applied);
    }
}

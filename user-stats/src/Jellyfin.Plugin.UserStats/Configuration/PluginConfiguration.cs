using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.UserStats.Configuration;

/// <summary>Configuration du plugin User Stats.</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    // ── Affichage ────────────────────────────────────────────────────────────
    /// <summary>Afficher la carte stats sur les pages profil utilisateur.</summary>
    public bool ShowOnUserProfile { get; set; } = true;

    /// <summary>Afficher les badges stats sur la liste admin des utilisateurs.</summary>
    public bool ShowOnAdminView { get; set; } = true;

    /// <summary>Activer le système de niveaux XP.</summary>
    public bool EnableLevelSystem { get; set; } = true;

    /// <summary>Couleur d'accentuation de la carte stats (hex).</summary>
    public string AccentColor { get; set; } = "#00a4dc";

    // ── Formule du score ─────────────────────────────────────────────────────
    /// <summary>Points accordés par film regardé.</summary>
    public int PointsPerMovie { get; set; } = 10;

    /// <summary>Points accordés par épisode regardé.</summary>
    public int PointsPerEpisode { get; set; } = 3;

    /// <summary>Points accordés par heure visionnée.</summary>
    public int PointsPerHour { get; set; } = 2;

    // ── Seuils des niveaux (niveau 1 = 0 pts, toujours) ─────────────────────
    /// <summary>Score minimum pour le niveau 2 — Curieux.</summary>
    public int Level2Score { get; set; } = 60;

    /// <summary>Score minimum pour le niveau 3 — Amateur.</summary>
    public int Level3Score { get; set; } = 180;

    /// <summary>Score minimum pour le niveau 4 — Cinéphile.</summary>
    public int Level4Score { get; set; } = 400;

    /// <summary>Score minimum pour le niveau 5 — Passionné.</summary>
    public int Level5Score { get; set; } = 750;

    /// <summary>Score minimum pour le niveau 6 — Acharné.</summary>
    public int Level6Score { get; set; } = 1200;

    /// <summary>Score minimum pour le niveau 7 — Expert.</summary>
    public int Level7Score { get; set; } = 2000;

    /// <summary>Score minimum pour le niveau 8 — Maître.</summary>
    public int Level8Score { get; set; } = 3200;

    /// <summary>Score minimum pour le niveau 9 — Élite.</summary>
    public int Level9Score { get; set; } = 5000;

    /// <summary>Score minimum pour le niveau 10 — Légende.</summary>
    public int Level10Score { get; set; } = 8000;
}

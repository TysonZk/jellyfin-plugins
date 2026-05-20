using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Seerr.Configuration;

/// <summary>Configuration du plugin Jellyseerr.</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>URL publique de l'instance Jellyseerr.</summary>
    public string JellyseerrUrl { get; set; } = "";

    /// <summary>Libellé du bouton affiché dans les préférences.</summary>
    public string ButtonLabel { get; set; } = "Demandes";

    /// <summary>Description affichée sous le titre de la section.</summary>
    public string Description { get; set; } = "Demandez des films et séries à ajouter à la médiathèque.";

    /// <summary>Ouvrir Jellyseerr dans un nouvel onglet.</summary>
    public bool OpenInNewTab { get; set; } = true;

    /// <summary>Afficher la section dans les préférences.</summary>
    public bool ShowSection { get; set; } = true;
}

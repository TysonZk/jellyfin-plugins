# Discord Button — Jellyfin Plugin

> Bouton d'invitation Discord dans le header Jellyfin, à gauche du bouton "Rejoindre un groupe".

---

## Aperçu

Ce plugin ajoute un bouton rond avec le logo Discord officiel directement dans la barre de navigation Jellyfin. Un clic ouvre l'invitation à votre serveur Discord dans un nouvel onglet — accessible à tous les utilisateurs connectés.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🎮 Logo Discord | Icône officielle Discord avec couleur de marque (#5865F2) |
| 📍 Position | À gauche du bouton "Rejoindre un groupe" (SyncPlay) dans le header |
| 🔗 Lien configurable | URL d'invitation modifiable depuis l'admin sans toucher au code |
| 💬 Infobulle | Texte personnalisable affiché au survol du bouton |
| 👁️ Activable | Peut être activé ou désactivé sans désinstaller le plugin |
| 🔄 Survie aux mises à jour | Se ré-injecte automatiquement à chaque redémarrage de Jellyfin |

---

## Prérequis

- **Jellyfin 10.10+** (testé sur 10.11)

---

## Installation

### Option A — Catalogue Jellyfin *(recommandé)*

1. **Tableau de bord → Plugins → Catalogues → +**
2. Ajouter l'URL du dépôt :
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. **Catalogue → Discord Button → Installer**
4. **Redémarrer Jellyfin**

### Option B — Manuel

1. Télécharger `Jellyfin.Plugin.Discord.zip` depuis les [Releases](../../releases)
2. Dézipper → `Jellyfin.Plugin.Discord.dll`
3. Créer le dossier `<config>/plugins/Discord Button_1.0.0.0/`
4. Copier le fichier `.dll` dans ce dossier
5. **Redémarrer Jellyfin**

### Option C — Compiler depuis les sources

Nécessite le [SDK .NET 8](https://dotnet.microsoft.com/download/dotnet/8.0).

```bash
git clone https://github.com/TysonZk/jellyfin-plugins.git
cd jellyfin-plugins
dotnet build discord-button/src/Jellyfin.Plugin.Discord/Jellyfin.Plugin.Discord.csproj -c Release
```

### Docker

```yaml
volumes:
  - /votre/chemin/jf_config:/config
```

Placer le DLL dans `/votre/chemin/jf_config/plugins/Discord Button_1.0.0.0/Jellyfin.Plugin.Discord.dll`.

---

## Configuration

**Tableau de bord → Plugins → Discord Button → Paramètres**

| Option | Description | Défaut |
|--------|-------------|--------|
| Lien d'invitation | URL `https://discord.gg/XXXXXXXX` | *(vide)* |
| Texte de l'infobulle | Affiché au survol du bouton | `Rejoindre notre Discord` |
| Afficher le bouton | Active ou désactive le bouton | ✅ activé |
| Ouvrir dans un nouvel onglet | Comportement du lien | ✅ activé |

> **Note :** Le bouton n'apparaît pas tant que le champ "Lien d'invitation" est vide.

---

## Structure du code

```
discord-button/
└── src/
    └── Jellyfin.Plugin.Discord/
        ├── Controllers/WidgetController.cs   # GET /JfDiscord/widget.js
        ├── Services/IndexPatcher.cs          # Patch auto de index.html + extraction logo
        ├── Configuration/PluginConfiguration.cs
        ├── Web/
        │   ├── widget.js                     # Injection du bouton Discord
        │   ├── config.html                   # Page de configuration admin
        │   └── logo.png
        ├── Plugin.cs
        └── PluginServiceRegistrator.cs
```

---

## Licence

MIT

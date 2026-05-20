# Jellyfin Plugins

---

## Plugins disponibles

### [📊 User Stats](./user-stats/)

Affiche une carte de statistiques de visionnage et un système de niveaux XP sur les profils Jellyfin.

- Films vus · épisodes · heures totales
- 10 niveaux XP (Spectateur → Légende)
- Formule du score et seuils personnalisables depuis l'admin
- Badge niveau affiché dans la liste admin des utilisateurs

### [🎮 Discord Button](./discord-button/)

Ajoute un bouton Discord dans le header Jellyfin (page d'accueil uniquement).

- Logo Discord officiel avec couleur de marque (#5865F2)
- URL d'invitation configurable depuis l'admin
- Masqué automatiquement pendant la lecture vidéo

### [🎬 Jellyseerr](./jellyseerr/)

Ajoute un bouton d'accès rapide à Jellyseerr dans le header Jellyfin (page d'accueil uniquement).

- Bouton orange à gauche du bouton Discord
- URL Jellyseerr configurable depuis l'admin
- Masqué automatiquement pendant la lecture vidéo

## Installer

1. **Tableau de bord → Plugins → Catalogues → +**
2. Ajouter :
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. **Catalogue** → choisir le plugin → **Installer**
4. **Redémarrer Jellyfin**

## Structure du dépôt

```
jellyfin-plugins/
├── user-stats/               # Plugin User Stats
│   └── src/Jellyfin.Plugin.UserStats/
├── discord-button/           # Plugin Discord Button
│   └── src/Jellyfin.Plugin.Discord/
├── jellyseerr/               # Plugin Jellyseerr
│   └── src/Jellyfin.Plugin.Seerr/
├── manifest.json             # Catalogue Jellyfin (3 plugins)
└── .github/workflows/
    ├── userstats.yml         # Release déclenchée par  userstats-v*
    ├── discord.yml           # Release déclenchée par  discord-v*
    └── seerr.yml             # Release déclenchée par  seerr-v*
```

---

# Jellyfin Plugins

---

## Available plugins

### [📊 User Stats](./user-stats/)

Displays a watch statistics card and an XP level system on Jellyfin user profiles.

- Movies watched · episodes · total hours
- 10 XP levels (Viewer → Legend)
- Score formula and thresholds configurable from the admin panel
- Level badge shown in the admin user list

### [🎮 Discord Button](./discord-button/)

Adds a Discord button in the Jellyfin header (home page only).

- Official Discord logo with brand color (#5865F2)
- Invite URL configurable from the admin panel
- Automatically hidden during video playback

### [🎬 Jellyseerr](./jellyseerr/)

Adds a quick-access button to Jellyseerr in the Jellyfin header (home page only).

- Orange button to the left of the Discord button
- Jellyseerr URL configurable from the admin panel
- Automatically hidden during video playback

## Install

1. **Dashboard → Plugins → Repositories → +**
2. Add:
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. **Catalog** → select the plugin → **Install**
4. **Restart Jellyfin**

## Repository structure

```
jellyfin-plugins/
├── user-stats/               # User Stats plugin
│   └── src/Jellyfin.Plugin.UserStats/
├── discord-button/           # Discord Button plugin
│   └── src/Jellyfin.Plugin.Discord/
├── jellyseerr/               # Jellyseerr plugin
│   └── src/Jellyfin.Plugin.Seerr/
├── manifest.json             # Jellyfin catalog (3 plugins)
└── .github/workflows/
    ├── userstats.yml         # Release triggered by  userstats-v*
    ├── discord.yml           # Release triggered by  discord-v*
    └── seerr.yml             # Release triggered by  seerr-v*
```

## License

MIT

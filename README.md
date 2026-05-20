# Jellyfin Plugins

Collection de plugins pour [Jellyfin](https://jellyfin.org) — serveur multimédia open-source.

---

## Plugins disponibles

### [📊 User Stats](./user-stats/)

Affiche une carte de statistiques de visionnage et un système de niveaux XP sur les profils Jellyfin.

- Films vus · épisodes · heures totales
- 10 niveaux XP (Spectateur → Légende)
- Formule du score et seuils personnalisables depuis l'admin
- Badge niveau affiché dans la liste admin des utilisateurs

---

### [🎮 Discord Button](./discord-button/)

Ajoute un bouton Discord dans le header Jellyfin (page d'accueil uniquement).

- Logo Discord officiel avec couleur de marque (#5865F2)
- URL d'invitation configurable depuis l'admin
- Masqué automatiquement pendant la lecture vidéo

---

### [🎬 Jellyseerr](./jellyseerr/)

Ajoute un bouton d'accès rapide à Jellyseerr dans le header Jellyfin (page d'accueil uniquement).

- Bouton orange à gauche du bouton Discord
- URL Jellyseerr configurable depuis l'admin
- Masqué automatiquement pendant la lecture vidéo

---

## Installer via le catalogue Jellyfin

Les trois plugins sont disponibles dans un seul catalogue.

1. **Tableau de bord → Plugins → Catalogues → +**
2. Ajouter :
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. **Catalogue** → choisir le plugin → **Installer**
4. **Redémarrer Jellyfin**

---

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

## Licence

MIT

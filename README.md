# Jellyfin Plugins

Collection de plugins pour [Jellyfin](https://jellyfin.org) — serveur multimédia open-source.

---

## Plugins disponibles

### [📊 User Stats](./user-stats/)

Affiche une carte de statistiques de visionnage et un système de niveaux XP sur les profils Jellyfin.

- Films vus · épisodes · heures totales
- 10 niveaux XP (Spectateur → Légende)
- Formule du score et seuils personnalisables depuis l'admin

---

### [🎮 Discord Button](./discord-button/)

Ajoute un bouton Discord dans le header Jellyfin, à gauche du bouton "Rejoindre un groupe".

- Logo Discord officiel avec couleur de marque
- URL d'invitation configurable depuis l'admin

---

## Installer via le catalogue Jellyfin

Les deux plugins sont disponibles dans un seul catalogue.

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
│   ├── README.md
│   └── src/Jellyfin.Plugin.UserStats/
├── discord-button/           # Plugin Discord Button
│   ├── README.md
│   └── src/Jellyfin.Plugin.Discord/
├── manifest.json             # Catalogue Jellyfin (les deux plugins)
└── .github/workflows/
    ├── userstats.yml         # Release déclenchée par  userstats-v*
    └── discord.yml           # Release déclenchée par  discord-v*
```

## Licence

MIT

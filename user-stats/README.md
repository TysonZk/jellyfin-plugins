# User Stats — Jellyfin Plugin

> Statistiques de visionnage et système de niveaux XP sur les profils Jellyfin.

---

## Aperçu

Ce plugin affiche une carte de statistiques personnalisée directement sur les pages profil Jellyfin. Chaque utilisateur peut voir ses films vus, ses épisodes regardés, son temps total et son niveau XP — sans aucune configuration manuelle.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 📊 Statistiques | Films vus, épisodes, heures totales — en direct depuis l'API Jellyfin |
| 🏆 Niveaux XP | 10 niveaux progressifs avec icônes, couleurs et barre de progression |
| 👥 Vue admin | Mini-badges de niveau sur chaque carte utilisateur dans le tableau de bord |
| ⚙️ Configurable | Formule du score et seuils des niveaux personnalisables depuis l'admin |
| 🔄 Survie aux mises à jour | Se ré-injecte automatiquement à chaque redémarrage de Jellyfin |

---

## Système de niveaux

| Niveau | Nom | Icône | Score requis |
|--------|-----|-------|-------------|
| 1 | Spectateur | 👀 | 0 |
| 2 | Curieux | 🎬 | 60 |
| 3 | Amateur | 📺 | 180 |
| 4 | Cinéphile | ⭐ | 400 |
| 5 | Passionné | 🎭 | 750 |
| 6 | Acharné | 🔥 | 1 200 |
| 7 | Expert | 🏆 | 2 000 |
| 8 | Maître | 💎 | 3 200 |
| 9 | Élite | 🌟 | 5 000 |
| 10 | Légende | 👑 | 8 000 |

**Formule par défaut :** `films × 10 + épisodes × 3 + heures × 2`

Tous les seuils et la formule sont modifiables depuis la page de configuration.

---

## Prérequis

- **Jellyfin 10.10+** (testé sur 10.11)
- Plugin [**Playback Reporting**](https://github.com/jellyfin/jellyfin-plugin-playbackreporting) — requis pour les données de temps de visionnage

---

## Installation

### Option A — Catalogue Jellyfin *(recommandé)*

1. **Tableau de bord → Plugins → Catalogues → +**
2. Ajouter l'URL du dépôt :
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. **Catalogue → User Stats → Installer**
4. **Redémarrer Jellyfin**

### Option B — Manuel

1. Télécharger `Jellyfin.Plugin.UserStats.zip` depuis les [Releases](../../releases)
2. Dézipper → `Jellyfin.Plugin.UserStats.dll`
3. Créer le dossier `<config>/plugins/User Stats_1.0.0.0/`
4. Copier le fichier `.dll` dans ce dossier
5. **Redémarrer Jellyfin**

### Option C — Compiler depuis les sources

Nécessite le [SDK .NET 8](https://dotnet.microsoft.com/download/dotnet/8.0).

```bash
git clone https://github.com/TysonZk/jellyfin-plugins.git
cd jellyfin-plugins
dotnet build user-stats/src/Jellyfin.Plugin.UserStats/Jellyfin.Plugin.UserStats.csproj -c Release
```

### Docker

```yaml
volumes:
  - /votre/chemin/jf_config:/config
```

Placer le DLL dans `/votre/chemin/jf_config/plugins/User Stats_1.0.0.0/Jellyfin.Plugin.UserStats.dll`.

---

## Configuration

**Tableau de bord → Plugins → User Stats → Paramètres**

### Affichage
| Option | Description |
|--------|-------------|
| Carte sur les profils | Affiche la carte stats sur chaque page profil utilisateur |
| Badges dans la liste admin | Affiche le niveau sous chaque carte utilisateur dans l'admin |
| Système de niveaux XP | Active ou désactive entièrement le système de niveaux |
| Couleur d'accent | Couleur de la bordure gauche de la carte |

### Formule du score
| Paramètre | Défaut |
|-----------|--------|
| Points par film | 10 |
| Points par épisode | 3 |
| Points par heure visionnée | 2 |

### Seuils des niveaux
Les seuils des niveaux 2 à 10 sont modifiables individuellement. Un bouton **Réinitialiser** restaure les valeurs par défaut.

---

## Structure du code

```
user-stats/
└── src/
    └── Jellyfin.Plugin.UserStats/
        ├── Controllers/WidgetController.cs   # GET /JfStats/widget.js
        ├── Services/IndexPatcher.cs          # Patch auto de index.html + extraction logo
        ├── Configuration/PluginConfiguration.cs
        ├── Web/
        │   ├── widget.js                     # Carte stats + niveaux XP
        │   ├── config.html                   # Page de configuration admin
        │   └── logo.png
        ├── Plugin.cs
        └── PluginServiceRegistrator.cs
```

---

## Licence

MIT

# Jellyfin Plugins

<div align="center">

Collection de plugins Jellyfin — **[🇫🇷 Français](#français) · [🇬🇧 English](#english)**

</div>

---

## Français

### Installer via le catalogue Jellyfin

1. **Tableau de bord → Plugins → Catalogues → +**
2. Ajouter l'URL :
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. Aller dans **Catalogue**, choisir le plugin à installer
4. **Redémarrer Jellyfin**

---

### 📊 User Stats

Affiche les statistiques de visionnage et un système de niveaux XP sur les pages profil Jellyfin.

**Fonctionnalités**
- Films vus, épisodes vus, heures totales
- 10 niveaux XP (Spectateur → Légende)
- Carte stats sur le profil utilisateur et la vue admin
- Formule du score configurable (points/film, épisode, heure)
- Seuils des niveaux personnalisables

**Configuration** : Tableau de bord → Plugins → User Stats → Paramètres

---

### 🎮 Discord Button

Ajoute un bouton Discord dans le header Jellyfin, à gauche du bouton "Rejoindre un groupe".

**Fonctionnalités**
- Bouton rond avec logo Discord officiel (#5865F2)
- Ouvre l'invitation Discord en un clic
- Texte de l'infobulle personnalisable

**Configuration** : Tableau de bord → Plugins → Discord Button → Paramètres
- Renseigner le lien d'invitation `https://discord.gg/XXXXXXXX`

---

## English

### Install via Jellyfin catalog

1. **Dashboard → Plugins → Repositories → +**
2. Add URL:
   ```
   https://raw.githubusercontent.com/TysonZk/jellyfin-plugins/main/manifest.json
   ```
3. Go to **Catalog**, pick the plugin to install
4. **Restart Jellyfin**

---

### 📊 User Stats

Displays watch statistics and a gamified XP level system on Jellyfin profile pages.

**Features**
- Movies watched, episodes watched, total hours
- 10 XP levels (Spectateur → Légende)
- Stats card on user profiles and admin view
- Configurable score formula and level thresholds

---

### 🎮 Discord Button

Adds a Discord invite button in the Jellyfin header, left of the "Join Group" button.

**Features**
- Round button with official Discord logo (#5865F2)
- Opens Discord invite in one click
- Configurable tooltip text

---

## Structure

```
jellyfin-plugins/
├── UserStats/          — User Stats plugin source
├── Discord/            — Discord Button plugin source
├── manifest.json       — Jellyfin plugin catalog
└── .github/workflows/
    ├── userstats.yml   — Release on tag  userstats-v*
    └── discord.yml     — Release on tag  discord-v*
```

## License

MIT

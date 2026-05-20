(function () {
  'use strict';

  var PLUGIN_GUID = 'c3f19a72-5d84-4e6b-a017-3b9e21cf8401';

  var DISCORD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="currentColor" width="20" height="20"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';

  // ── Config (cached) ────────────────────────────────────────────────────────
  var _cfg = null;
  var _cfgLoading = false;
  var _cfgQueue = [];

  var CFG_DEFAULTS = {
    DiscordInviteUrl: '',
    ButtonTooltip:   'Rejoindre notre Discord',
    OpenInNewTab:    true,
    ShowButton:      true,
  };

  function getAuth() {
    try {
      if (window.ApiClient) {
        var t = window.ApiClient.accessToken();
        var u = window.ApiClient.getCurrentUserId();
        if (t && u) return { token: t, userId: u };
      }
    } catch (e) {}
    try {
      var c = JSON.parse(localStorage.getItem('servercredentials3') || '{}');
      var s = c.Servers && c.Servers[0];
      if (s && s.AccessToken) return { token: s.AccessToken };
    } catch (e) {}
    return null;
  }

  function getConfig(cb) {
    if (_cfg) { cb(_cfg); return; }
    _cfgQueue.push(cb);
    if (_cfgLoading) return;
    _cfgLoading = true;
    var auth = getAuth();
    if (!auth) { _resolve(CFG_DEFAULTS); return; }
    fetch(window.location.origin + '/Plugins/' + PLUGIN_GUID + '/Configuration', {
      headers: { 'X-Emby-Token': auth.token }
    }).then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (c) { _resolve(Object.assign({}, CFG_DEFAULTS, c)); });
  }

  function _resolve(c) {
    _cfg = c; _cfgLoading = false;
    _cfgQueue.forEach(function (fn) { fn(c); });
    _cfgQueue = [];
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { _cfg = null; }
  });

  // ── Création du bouton ──────────────────────────────────────────────────────
  function makeButton(cfg) {
    var btn = document.createElement('a');
    btn.id        = 'jf-discord-btn';
    btn.href      = cfg.DiscordInviteUrl || '#';
    btn.target    = cfg.OpenInNewTab ? '_blank' : '_self';
    btn.rel       = 'noopener noreferrer';
    btn.title     = cfg.ButtonTooltip || 'Discord';
    btn.setAttribute('aria-label', btn.title);

    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:36px',
      'height:36px',
      'border-radius:50%',
      'background-color:#5865F2',
      'color:#fff',
      'text-decoration:none',
      'cursor:pointer',
      'flex-shrink:0',
      'transition:background-color .15s ease',
      'margin:0 4px',
      'vertical-align:middle',
    ].join(';');

    btn.innerHTML = DISCORD_SVG;

    btn.addEventListener('mouseenter', function () {
      btn.style.backgroundColor = '#4752C4';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.backgroundColor = '#5865F2';
    });

    return btn;
  }

  // ── Injection ───────────────────────────────────────────────────────────────
  // Essaie de placer le bouton à gauche du bouton "Rejoindre un groupe" (SyncPlay).
  // Utilise plusieurs sélecteurs car l'UI Jellyfin varie selon les versions.
  var SYNC_SELECTORS = [
    '.btnSyncPlayJoin',
    '[data-action="syncplay"]',
    '.headerSyncPlayButton',
    '#btnSyncPlay',
    'button[title*="groupe"]',
    'button[title*="group"]',
    'button[aria-label*="groupe"]',
    'button[aria-label*="group"]',
  ];

  function findSyncPlayBtn() {
    for (var i = 0; i < SYNC_SELECTORS.length; i++) {
      var el = document.querySelector(SYNC_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function inject(cfg) {
    if (!cfg.ShowButton || !cfg.DiscordInviteUrl) return;
    if (document.getElementById('jf-discord-btn')) return;

    var syncBtn = findSyncPlayBtn();
    var btn = makeButton(cfg);

    if (syncBtn) {
      // Insérer à gauche du bouton SyncPlay
      syncBtn.parentNode.insertBefore(btn, syncBtn);
    } else {
      // Fallback : ajouter dans la zone droite du header
      var headerRight = document.querySelector('.headerRight, .skinHeader .flex, header .flex');
      if (headerRight) {
        headerRight.insertBefore(btn, headerRight.firstChild);
      }
    }
  }

  // ── Routage avec retry ──────────────────────────────────────────────────────
  var _t = null;

  function check() {
    if (document.getElementById('jf-discord-btn')) return;
    getConfig(function (cfg) {
      if (!cfg.ShowButton || !cfg.DiscordInviteUrl) return;
      inject(cfg);
      // Si le bouton SyncPlay n'était pas encore là, on retente
      if (!document.getElementById('jf-discord-btn')) {
        setTimeout(check, 500);
      }
    });
  }

  window.addEventListener('hashchange', function () {
    var old = document.getElementById('jf-discord-btn');
    if (old) old.remove();
    check();
  });

  var _obs = new MutationObserver(function () {
    clearTimeout(_t);
    _t = setTimeout(function () { _t = null; check(); }, 300);
  });

  function init() {
    _obs.observe(document.body, { childList: true, subtree: true });
    check();
  }

  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();

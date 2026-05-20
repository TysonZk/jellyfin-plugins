(function () {
  'use strict';

  var PLUGIN_GUID = 'c3f19a72-5d84-4e6b-a017-3b9e21cf8401';

  var DISCORD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="currentColor" width="16" height="16"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';

  var CFG_DEFAULTS = {
    DiscordInviteUrl: '',
    ButtonTooltip:   'Rejoindre notre Discord',
    OpenInNewTab:    true,
    ShowButton:      true,
  };

  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Config — PAS de cache si auth indisponible au premier appel ─────────────
  var _cfg = null;

  function loadConfig(cb) {
    var auth = getAuth();
    if (!auth) {
      // Auth pas encore prête — on retourne les défauts SANS mettre en cache
      cb(CFG_DEFAULTS);
      return;
    }
    if (_cfg) { cb(_cfg); return; }
    fetch(window.location.origin + '/Plugins/' + PLUGIN_GUID + '/Configuration', {
      headers: { 'X-Emby-Token': auth.token }
    }).then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (c) {
        _cfg = Object.assign({}, CFG_DEFAULTS, c);
        cb(_cfg);
      });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { _cfg = null; }
  });

  // ── Bouton ──────────────────────────────────────────────────────────────────
  function makeButton(cfg) {
    var btn = document.createElement('a');
    btn.id     = 'jf-discord-btn';
    btn.href   = cfg.DiscordInviteUrl;
    btn.target = cfg.OpenInNewTab ? '_blank' : '_self';
    btn.rel    = 'noopener noreferrer';
    btn.title  = cfg.ButtonTooltip || 'Discord';
    btn.setAttribute('aria-label', btn.title);
    btn.className = 'headerButton headerButtonRight';

    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:28px',
      'height:28px',
      'border-radius:50%',
      'background:#5865F2',
      'color:#fff',
      'text-decoration:none',
      'cursor:pointer',
      'flex-shrink:0',
      'transition:background .15s',
      'margin:0 2px',
      'vertical-align:middle',
      'border:none',
      'padding:5px',
    ].join(';');

    btn.innerHTML = DISCORD_SVG;
    btn.addEventListener('mouseenter', function () { btn.style.background = '#4752C4'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = '#5865F2'; });
    return btn;
  }

  // ── Injection ───────────────────────────────────────────────────────────────
  function inject(cfg) {
    if (document.getElementById('jf-discord-btn')) return true;
    if (!cfg.ShowButton || !cfg.DiscordInviteUrl) return false;

    // 1. À gauche du bouton SyncPlay (toujours dans le DOM, caché par .hide)
    var syncBtn = document.querySelector('.headerSyncButton');
    if (syncBtn && syncBtn.parentNode) {
      syncBtn.parentNode.insertBefore(makeButton(cfg), syncBtn);
      return true;
    }

    // 2. Dans .headerRight
    var hr = document.querySelector('.headerRight');
    if (hr) {
      hr.insertBefore(makeButton(cfg), hr.firstChild);
      return true;
    }

    // 3. Dans le skinHeader (fallback ultime)
    var hb = document.querySelector('.skinHeader .headerButton');
    if (hb && hb.parentNode) {
      hb.parentNode.insertBefore(makeButton(cfg), hb);
      return true;
    }

    return false;
  }

  // ── Boucle de tentatives ────────────────────────────────────────────────────
  // On essaie toutes les 300 ms pendant 15 secondes max après chaque chargement.
  var _interval = null;

  function startLoop() {
    if (_interval) return;
    var attempts = 0;
    _interval = setInterval(function () {
      attempts++;
      loadConfig(function (cfg) {
        var ok = inject(cfg);
        if (ok || attempts >= 50) {           // 50 × 300 ms = 15 s max
          clearInterval(_interval);
          _interval = null;
        }
      });
    }, 300);
  }

  // Reset et relance à chaque navigation
  window.addEventListener('hashchange', function () {
    var old = document.getElementById('jf-discord-btn');
    if (old) old.remove();
    clearInterval(_interval);
    _interval = null;
    startLoop();
  });

  // Lance aussi au chargement initial
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startLoop);
  } else {
    startLoop();
  }
})();

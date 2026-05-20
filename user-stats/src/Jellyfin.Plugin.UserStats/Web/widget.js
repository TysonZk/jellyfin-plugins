(function () {
  'use strict';

  var PLUGIN_GUID = 'a4f7e8c2-3b12-4d56-9870-1e23cf567890';

  // ── Système de niveaux ──────────────────────────────────────────────────────
  var LEVEL_META = [
    { name: 'Spectateur', icon: '👀', color: '#777'    },
    { name: 'Curieux',    icon: '🎬', color: '#78909C' },
    { name: 'Amateur',    icon: '📺', color: '#66BB6A' },
    { name: 'Cinéphile',  icon: '⭐', color: '#42A5F5' },
    { name: 'Passionné',  icon: '🎭', color: '#AB47BC' },
    { name: 'Acharné',    icon: '🔥', color: '#FF7043' },
    { name: 'Expert',     icon: '🏆', color: '#FFA726' },
    { name: 'Maître',     icon: '💎', color: '#EC407A' },
    { name: 'Élite',      icon: '🌟', color: '#E040FB' },
    { name: 'Légende',    icon: '👑', color: '#FFD700' },
  ];

  // Construit le tableau des niveaux à partir de la config (seuils dynamiques)
  function buildLevels(cfg) {
    var thresholds = [
      0,
      cfg.Level2Score  || 60,
      cfg.Level3Score  || 180,
      cfg.Level4Score  || 400,
      cfg.Level5Score  || 750,
      cfg.Level6Score  || 1200,
      cfg.Level7Score  || 2000,
      cfg.Level8Score  || 3200,
      cfg.Level9Score  || 5000,
      cfg.Level10Score || 8000,
    ];
    return LEVEL_META.map(function (m, i) {
      return { min: thresholds[i], name: m.name, icon: m.icon, color: m.color };
    });
  }

  // Score dynamique selon la config admin
  function calcScore(s, cfg) {
    var pM = (cfg && cfg.PointsPerMovie   != null) ? cfg.PointsPerMovie   : 10;
    var pE = (cfg && cfg.PointsPerEpisode != null) ? cfg.PointsPerEpisode : 3;
    var pH = (cfg && cfg.PointsPerHour    != null) ? cfg.PointsPerHour    : 2;
    return Math.floor(s.movies * pM + s.eps * pE + s.totalSec / 3600 * pH);
  }

  function getLevel(score, levels) {
    var lvl = levels[0], idx = 0;
    for (var i = 0; i < levels.length; i++) {
      if (score >= levels[i].min) { lvl = levels[i]; idx = i; }
    }
    var isMax = (idx === levels.length - 1);
    var next  = isMax ? null : levels[idx + 1];
    var pct   = isMax ? 100 : Math.round(((score - lvl.min) / (next.min - lvl.min)) * 100);
    return { icon: lvl.icon, name: lvl.name, color: lvl.color, num: idx + 1,
             pct: pct, isMax: isMax, nextName: next ? next.name : null,
             toNext: next ? next.min - score : 0, score: score };
  }

  // ── Plugin config (avec cache) ───────────────────────────────────────────────
  var CFG_DEFAULTS = {
    ShowOnUserProfile: true, ShowOnAdminView: true,
    EnableLevelSystem: true, AccentColor: '#00a4dc',
    PointsPerMovie: 10, PointsPerEpisode: 3, PointsPerHour: 2,
    Level2Score: 60,   Level3Score: 180,  Level4Score: 400,
    Level5Score: 750,  Level6Score: 1200, Level7Score: 2000,
    Level8Score: 3200, Level9Score: 5000, Level10Score: 8000,
  };
  var _cfg = null;
  var _cfgLoading = false;
  var _cfgQueue = [];

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
  // Invalider le cache quand la page redevient visible (après config admin)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { _cfg = null; }
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  var _statsCache = {};

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
      if (s && s.AccessToken) return { token: s.AccessToken, userId: s.UserId || s.LastUserId || '' };
    } catch (e) {}
    return null;
  }

  function fmtTime(sec) {
    var h = Math.floor(sec / 3600);
    if (h < 1)  return Math.round(sec / 60) + ' min';
    if (h < 48) return h + 'h';
    var d = Math.floor(h / 24);
    return d + 'j ' + (h - d * 24) + 'h';
  }

  // ── Fetch stats ──────────────────────────────────────────────────────────────
  function fetchStats(uid, token, cb) {
    if (_statsCache[uid]) { cb(_statsCache[uid]); return; }
    var o = window.location.origin;
    var hdr = { 'X-Emby-Token': token };
    Promise.all([
      fetch(o + '/Users/' + uid + '/Items?Filters=IsPlayed&Recursive=true&IncludeItemTypes=Movie&Limit=0',   { headers: hdr }).then(function (r) { return r.ok ? r.json() : { TotalRecordCount: 0 }; }).catch(function () { return { TotalRecordCount: 0 }; }),
      fetch(o + '/Users/' + uid + '/Items?Filters=IsPlayed&Recursive=true&IncludeItemTypes=Episode&Limit=0', { headers: hdr }).then(function (r) { return r.ok ? r.json() : { TotalRecordCount: 0 }; }).catch(function () { return { TotalRecordCount: 0 }; }),
      fetch(o + '/user_usage_stats/user_activity?days=99999&limit=500',                                      { headers: hdr }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
    ]).then(function (res) {
      var movies = res[0].TotalRecordCount || 0;
      var eps    = res[1].TotalRecordCount || 0;
      var totalSec = 0;
      if (Array.isArray(res[2])) {
        for (var i = 0; i < res[2].length; i++) {
          if (res[2][i].user_id === uid) { totalSec = res[2][i].total_time || 0; break; }
        }
      }
      var s = { movies: movies, eps: eps, totalSec: totalSec };
      _statsCache[uid] = s;
      cb(s);
    }).catch(function (e) { console.warn('[jf-stats]', e); });
  }

  // ── Rendu de la carte ────────────────────────────────────────────────────────
  function makeBox(s, cfg) {
    var levels = buildLevels(cfg || CFG_DEFAULTS);
    var score  = calcScore(s, cfg);
    var lv     = getLevel(score, levels);
    var accent = (cfg && cfg.AccentColor) || '#00a4dc';
    var showLv = !cfg || cfg.EnableLevelSystem !== false;

    var box = document.createElement('div');
    box.className = 'jf-stats-box';
    box.style.cssText = [
      'margin:12px 0 18px', 'padding:14px 20px',
      'background:rgba(255,255,255,.08)', 'border-radius:10px',
      'border-left:3px solid ' + accent, 'font-family:inherit',
    ].join(';');

    if (showLv) {
      var lvRow = document.createElement('div');
      lvRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px';

      var ico = document.createElement('span');
      ico.style.cssText = 'font-size:34px;line-height:1;flex-shrink:0';
      ico.textContent = lv.icon;

      var info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';

      var nameLine = document.createElement('div');
      nameLine.style.cssText = 'font-size:15px;font-weight:600;color:' + lv.color;
      nameLine.textContent = 'Niveau ' + lv.num + ' — ' + lv.name;

      var sub = document.createElement('div');
      sub.style.cssText = 'font-size:11px;color:#888;margin-top:3px';
      sub.textContent = lv.isMax
        ? score + ' pts • Niveau maximum atteint 🎉'
        : score + ' pts • encore ' + lv.toNext + ' pts pour ' + lv.nextName;

      var barWrap = document.createElement('div');
      barWrap.style.cssText = 'height:4px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden;margin-top:7px';
      var barFill = document.createElement('div');
      barFill.style.cssText = 'width:' + lv.pct + '%;height:100%;background:' + lv.color + ';border-radius:2px';
      barWrap.appendChild(barFill);

      info.appendChild(nameLine); info.appendChild(sub); info.appendChild(barWrap);
      lvRow.appendChild(ico); lvRow.appendChild(info);
      box.appendChild(lvRow);
    }

    var statsRow = document.createElement('div');
    statsRow.style.cssText = [
      'display:flex', 'flex-wrap:wrap', 'gap:16px', 'align-items:center',
      showLv ? 'padding-top:10px;border-top:1px solid rgba(255,255,255,.08)' : '',
    ].join(';');

    var items = [
      ['🎬', s.movies, s.movies !== 1 ? 'films' : 'film'],
      ['📺', s.eps,    s.eps    !== 1 ? 'épisodes' : 'épisode'],
    ];
    if (s.totalSec > 0) items.push(['⏱', fmtTime(s.totalSec), 'visionnés']);

    items.forEach(function (it) {
      var span = document.createElement('span');
      span.style.cssText = 'display:flex;align-items:baseline;gap:5px;font-size:13px;color:#aaa';
      var strong = document.createElement('strong');
      strong.style.cssText = 'color:#fff;font-size:20px;font-weight:500';
      strong.textContent = it[1];
      span.appendChild(document.createTextNode(it[0] + ' '));
      span.appendChild(strong);
      span.appendChild(document.createTextNode(' ' + it[2]));
      statsRow.appendChild(span);
    });

    box.appendChild(statsRow);
    return box;
  }

  // ── Injection avec retry ─────────────────────────────────────────────────────
  function tryInject(getAnchor, getUid, insert, cfg, tries) {
    if (tries <= 0) return;
    if (document.querySelector('.jf-stats-box')) return;
    var anchor = getAnchor();
    if (!anchor) { setTimeout(function () { tryInject(getAnchor, getUid, insert, cfg, tries - 1); }, 250); return; }
    var auth = getAuth();
    if (!auth)   { setTimeout(function () { tryInject(getAnchor, getUid, insert, cfg, tries - 1); }, 250); return; }
    var uid = getUid(auth);
    if (!uid) return;
    fetchStats(uid, auth.token, function (s) {
      if (document.querySelector('.jf-stats-box')) return;
      insert(makeBox(s, cfg), anchor);
    });
  }

  function uidFromHash(auth) {
    var m = window.location.hash.match(/userId=([^&?#]+)/);
    return m ? m[1] : auth.userId;
  }

  function injectSettingsMenu(cfg) {
    tryInject(
      function () { return document.querySelector('h2.sectionTitle.headerUsername'); },
      uidFromHash,
      function (box, anchor) { anchor.parentNode.insertBefore(box, anchor.nextSibling); },
      cfg, 16
    );
  }

  function injectUserList(cfg) {
    var auth = getAuth();
    if (!auth) return;
    var cards = document.querySelectorAll('[data-userid]:not([data-jf-si])');
    if (!cards.length) return;
    Array.prototype.forEach.call(cards, function (card) {
      var uid = card.getAttribute('data-userid');
      if (!uid) return;
      card.setAttribute('data-jf-si', '1');
      fetchStats(uid, auth.token, function (s) {
        var footer = card.querySelector('.cardFooter');
        if (!footer || footer.querySelector('.jf-mini')) return;
        var levels = buildLevels(cfg || CFG_DEFAULTS);
        var score = calcScore(s, cfg);
        var lv = getLevel(score, levels);
        var el = document.createElement('div');
        el.className = 'cardText jf-mini';
        el.style.cssText = 'font-size:11px;opacity:.7;padding-top:1px';
        el.textContent = lv.icon + ' ' + lv.name + ' • ' + s.movies + ' films · ' + s.eps + ' ép' +
          (s.totalSec > 0 ? ' · ' + fmtTime(s.totalSec) : '');
        footer.appendChild(el);
      });
    });
  }

  // ── Routage ───────────────────────────────────────────────────────────────────
  function check() {
    var h = window.location.hash;
    getConfig(function (cfg) {
      if (document.querySelector('.jf-stats-box')) return;
      if      (cfg.ShowOnUserProfile && h.indexOf('/mypreferencesmenu') !== -1)                                    injectSettingsMenu(cfg);
      else if (cfg.ShowOnAdminView   && h.indexOf('/dashboard/users') !== -1 && h.indexOf('userId=') < 0)         injectUserList(cfg);
    });
  }

  window.addEventListener('hashchange', function () {
    document.querySelectorAll('.jf-stats-box').forEach(function (el) { el.remove(); });
    check();
  });

  var _t = null;
  var _obs = new MutationObserver(function () {
    clearTimeout(_t);
    _t = setTimeout(function () { _t = null; check(); }, 200);
  });

  function init() { _obs.observe(document.body, { childList: true, subtree: true }); check(); }
  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();

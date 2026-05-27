(function () {
  'use strict';

  var PREFS_CLASS  = 'jf-lb-prefs';   // sentinelle section préférences
  var MODAL_ID     = 'jf-lb-modal';   // id modal notation
  var _origFetch   = window.fetch.bind(window);

  // ── Auth (même pattern que user-stats) ───────────────────────────────────
  function getAuth() {
    try {
      if (window.ApiClient) {
        var t = window.ApiClient.accessToken();
        var u = window.ApiClient.getCurrentUserId();
        if (t && u) return { token: t, userId: u };
      }
    } catch (_) {}
    try {
      var c = JSON.parse(localStorage.getItem('servercredentials3') || '{}');
      var s = c.Servers && c.Servers[0];
      if (s && s.AccessToken)
        return { token: s.AccessToken, userId: s.UserId || s.LastUserId || '' };
    } catch (_) {}
    return null;
  }

  // ── Section /mypreferencesmenu ────────────────────────────────────────────

  function injectPrefsSection() {
    if (document.querySelector('.' + PREFS_CLASS)) return; // déjà injecté

    var anchor = document.querySelector('h2.sectionTitle.headerUsername');
    if (!anchor) {
      setTimeout(injectPrefsSection, 250);
      return;
    }

    var auth = getAuth();
    if (!auth) { setTimeout(injectPrefsSection, 250); return; }

    var userId = auth.userId;

    _origFetch('/JfLetterboxd/status?userId=' + userId)
      .then(function (r) { return r.json(); })
      .then(function (status) {
        if (document.querySelector('.' + PREFS_CLASS)) return;
        var section = buildPrefsSection(userId, status.connected, status.username || '');
        anchor.parentNode.insertBefore(section, anchor.nextSibling);
      })
      .catch(function () {});
  }

  function buildPrefsSection(userId, connected, lbUser) {
    var wrap = document.createElement('div');
    wrap.className = PREFS_CLASS;
    wrap.style.cssText = 'margin:16px 0 4px;';

    // Titre (style Jellyfin)
    var titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 12px;';

    var logoSvg = document.createElement('span');
    logoSvg.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="50" fill="#00C030"/>' +
        '<text x="50" y="67" text-anchor="middle" font-family="serif" ' +
              'font-size="52" font-weight="bold" fill="white">L</text>' +
      '</svg>';

    var title = document.createElement('h2');
    title.className = 'sectionTitle';
    title.style.cssText = 'margin:0;';
    title.textContent = 'Letterboxd';

    titleRow.appendChild(logoSvg);
    titleRow.appendChild(title);
    wrap.appendChild(titleRow);

    // Corps
    var body = document.createElement('div');
    body.style.cssText = [
      'background:#1a1a1a', 'border-radius:8px', 'padding:16px 20px',
      'max-width:480px',
    ].join(';');

    if (connected) {
      renderConnected(body, userId, lbUser, wrap);
    } else {
      renderConnectForm(body, userId, wrap);
    }

    wrap.appendChild(body);
    return wrap;
  }

  function renderConnected(body, userId, lbUser, wrap) {
    body.innerHTML = '';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;';

    var info = document.createElement('span');
    info.style.cssText = 'color:#ccc;font-size:14px;';
    info.innerHTML = 'Connecté en tant que <strong style="color:#00C030">' + esc(lbUser) + '</strong>';

    var discBtn = document.createElement('button');
    discBtn.className = 'raised button-submit';
    discBtn.style.cssText = 'background:#c0392b;color:#fff;border:none;padding:7px 16px;' +
                            'border-radius:4px;cursor:pointer;font-size:13px;';
    discBtn.textContent = 'Déconnecter';
    discBtn.onclick = function () {
      _origFetch('/JfLetterboxd/disconnect?userId=' + userId, { method: 'DELETE' })
        .then(function () {
          // Retirer la section et la réinjecter (désconnecté)
          wrap.remove();
          setTimeout(injectPrefsSection, 100);
        })
        .catch(function () {});
    };

    row.appendChild(info);
    row.appendChild(discBtn);
    body.appendChild(row);

    var hint = document.createElement('p');
    hint.style.cssText = 'color:#666;font-size:12px;margin:10px 0 0;';
    hint.textContent = 'Une fenêtre de notation apparaîtra automatiquement à la fin de chaque film.';
    body.appendChild(hint);
  }

  function renderConnectForm(body, userId, wrap) {
    body.innerHTML = '';

    var desc = document.createElement('p');
    desc.style.cssText = 'color:#aaa;font-size:13px;margin:0 0 14px;';
    desc.textContent = 'Connecte ton compte pour noter tes films sur Letterboxd à la fin de chaque visionnage.';
    body.appendChild(desc);

    var emailInp = inp('email', 'Email Letterboxd');
    var passInp  = inp('password', 'Mot de passe');
    body.appendChild(emailInp);
    body.appendChild(passInp);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:4px;';

    var connectBtn = document.createElement('button');
    connectBtn.className = 'raised button-submit';
    connectBtn.style.cssText = 'background:#00C030;color:#fff;border:none;padding:8px 20px;' +
                               'border-radius:4px;cursor:pointer;font-size:14px;font-weight:600;';
    connectBtn.textContent = 'Se connecter';

    var errSpan = document.createElement('span');
    errSpan.style.cssText = 'color:#f55;font-size:13px;';

    btnRow.appendChild(connectBtn);
    btnRow.appendChild(errSpan);
    body.appendChild(btnRow);

    function doConnect() {
      var email = emailInp.value.trim();
      var pass  = passInp.value;
      if (!email) { errSpan.textContent = 'Email requis.'; return; }
      errSpan.textContent = '';
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connexion…';

      _origFetch('/JfLetterboxd/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, email: email, password: pass }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            renderConnected(body, userId, res.username || email.split('@')[0], wrap);
          } else {
            errSpan.textContent = res.error || 'Identifiants incorrects.';
            connectBtn.disabled = false;
            connectBtn.textContent = 'Se connecter';
          }
        })
        .catch(function () {
          errSpan.textContent = 'Erreur réseau.';
          connectBtn.disabled = false;
          connectBtn.textContent = 'Se connecter';
        });
    }

    connectBtn.onclick = doConnect;
    [emailInp, passInp].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doConnect(); });
    });
  }

  // ── Modal notation (fin de film) ──────────────────────────────────────────

  // Intercepte fetch pour détecter la fin d'un film
  window.fetch = function (url, options) {
    var p = _origFetch(url, options);
    try {
      if (typeof url === 'string' && options && (options.method || '').toUpperCase() === 'POST') {
        var m = url.match(/\/Users\/([^/?#]+)\/PlayedItems\/([^/?#]+)/);
        if (m) {
          var uid = m[1], itemId = m[2];
          p.then(function () { onItemPlayed(uid, itemId); }).catch(function () {});
        }
      }
    } catch (_) {}
    return p;
  };

  function onItemPlayed(userId, itemId) {
    _origFetch('/Items/' + itemId + '?userId=' + userId)
      .then(function (r) { return r.json(); })
      .then(function (item) {
        if (item.Type !== 'Movie') return;
        _origFetch('/JfLetterboxd/status?userId=' + userId)
          .then(function (r) { return r.json(); })
          .then(function (s) {
            setTimeout(function () {
              showModal(userId, item, s.connected, s.username || '');
            }, 1200);
          })
          .catch(function () {});
      })
      .catch(function () {});
  }

  function showModal(userId, item, connected, lbUser) {
    if (document.getElementById(MODAL_ID)) return;

    var title  = item.Name || 'Film';
    var year   = item.ProductionYear || '';
    var tmdbId = (item.ProviderIds && item.ProviderIds.Tmdb) || '';
    var imdbId = (item.ProviderIds && item.ProviderIds.Imdb) || '';

    var overlay = el('div', {
      id: MODAL_ID,
      style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);' +
             'display:flex;align-items:center;justify-content:center;font-family:sans-serif;',
    });

    var card = el('div', {
      style: 'background:#141414;border-radius:14px;padding:28px 32px;' +
             'max-width:400px;width:92%;text-align:center;' +
             'box-shadow:0 24px 64px rgba(0,0,0,.9);position:relative;color:#fff;',
    });

    var closeBtn = el('button', {
      style: 'position:absolute;top:12px;right:14px;background:none;border:none;' +
             'color:#666;font-size:20px;cursor:pointer;line-height:1;',
    });
    closeBtn.textContent = '✕';
    closeBtn.onclick = function () { overlay.remove(); };

    var logoWrap = el('div', { style: 'margin-bottom:14px' });
    logoWrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="50" fill="#00C030"/>' +
        '<text x="50" y="67" text-anchor="middle" font-family="serif" ' +
              'font-size="52" font-weight="bold" fill="white">L</text>' +
      '</svg>';

    var h = el('h3', { style: 'margin:0 0 2px;font-size:17px;font-weight:700;color:#fff' });
    h.textContent = title;
    var sub = el('p', { style: 'margin:0 0 20px;font-size:13px;color:#888' });
    sub.textContent = year ? String(year) : '';

    card.appendChild(closeBtn);
    card.appendChild(logoWrap);
    card.appendChild(h);
    card.appendChild(sub);

    if (!connected) {
      buildModalConnectUI(card, overlay, userId, item, tmdbId, imdbId);
    } else {
      buildModalRatingUI(card, overlay, userId, lbUser, tmdbId, imdbId, title, year);
    }

    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function buildModalConnectUI(card, overlay, userId, item, tmdbId, imdbId) {
    var desc = el('p', { style: 'color:#bbb;font-size:14px;margin:0 0 16px' });
    desc.textContent = 'Connecte ton compte Letterboxd pour noter ce film.';

    var emailInp = inp('email', 'Email Letterboxd');
    var passInp  = inp('password', 'Mot de passe');
    emailInp.style.cssText += 'margin-bottom:8px;';
    passInp.style.cssText  += 'margin-bottom:14px;';

    var connectBtn = el('button', { style: btnStyle('#00C030') });
    connectBtn.textContent = 'Se connecter';
    var skipBtn = el('button', {
      style: 'background:none;border:none;color:#666;font-size:13px;cursor:pointer;' +
             'margin-top:6px;display:block;width:100%;',
    });
    skipBtn.textContent = 'Passer';
    skipBtn.onclick = function () { overlay.remove(); };
    var errTxt = el('p', { style: 'color:#f55;font-size:13px;margin:10px 0 0' });

    function doConnect() {
      var email = emailInp.value.trim();
      var pass  = passInp.value;
      if (!email) { errTxt.textContent = 'Email requis.'; return; }
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connexion…';
      errTxt.textContent = '';

      _origFetch('/JfLetterboxd/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, email: email, password: pass }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            overlay.remove();
            showModal(userId, item, true, res.username || email.split('@')[0]);
          } else {
            errTxt.textContent = res.error || 'Identifiants incorrects.';
            connectBtn.disabled = false;
            connectBtn.textContent = 'Se connecter';
          }
        })
        .catch(function () {
          errTxt.textContent = 'Erreur réseau.';
          connectBtn.disabled = false;
          connectBtn.textContent = 'Se connecter';
        });
    }

    connectBtn.onclick = doConnect;
    [emailInp, passInp].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doConnect(); });
    });

    [desc, emailInp, passInp, connectBtn, skipBtn, errTxt].forEach(function (n) {
      card.appendChild(n);
    });
  }

  function buildModalRatingUI(card, overlay, userId, lbUser, tmdbId, imdbId, title, year) {
    var userLine = el('p', { style: 'font-size:13px;color:#888;margin:0 0 18px' });
    userLine.innerHTML = 'Connecté · <span style="color:#00C030;font-weight:600">' + esc(lbUser) + '</span>';

    var currentRating = 0;
    var starsWrap = el('div', {
      style: 'font-size:40px;cursor:pointer;user-select:none;letter-spacing:4px;' +
             'display:flex;justify-content:center;gap:2px',
    });

    var starEls = [];
    for (var i = 1; i <= 5; i++) {
      (function (val) {
        var s = el('span', { style: 'color:#333;transition:color .1s' });
        s.textContent = '★';
        s.addEventListener('mouseenter', function () { highlight(val); });
        s.addEventListener('mouseleave', function () { highlight(currentRating); });
        s.addEventListener('click', function () {
          currentRating = (currentRating === val) ? 0 : val;
          highlight(currentRating);
          ratingLabel.textContent = ratingTxt(currentRating);
        });
        starsWrap.appendChild(s);
        starEls.push(s);
      })(i);
    }

    function highlight(n) {
      starEls.forEach(function (s, i) { s.style.color = (i < n) ? '#FFB800' : '#333'; });
    }

    var ratingLabel = el('p', { style: 'color:#777;font-size:13px;margin:8px 0 20px' });
    ratingLabel.textContent = 'Pas de note';

    var row = el('div', { style: 'display:flex;gap:8px' });
    var logBtn = el('button', { style: btnStyle('#00C030') + 'flex:1;' });
    logBtn.textContent = 'Enregistrer';
    var skipBtn = el('button', { style: btnStyle('#2a2a2a') + 'padding:10px 18px;color:#aaa;' });
    skipBtn.textContent = 'Passer';
    skipBtn.onclick = function () { overlay.remove(); };
    var msg = el('p', { style: 'font-size:13px;margin:12px 0 0;min-height:18px' });

    logBtn.onclick = function () {
      logBtn.disabled = true;
      logBtn.textContent = 'Enregistrement…';
      msg.style.color = '#888';
      msg.textContent = '';

      _origFetch('/JfLetterboxd/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          tmdbId: tmdbId,
          imdbId: imdbId,
          title:  title,
          year:   year ? parseInt(year) : null,
          rating: currentRating,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            msg.style.color = '#00C030';
            msg.textContent = '✓ Enregistré sur Letterboxd !';
            setTimeout(function () { overlay.remove(); }, 2200);
          } else {
            msg.style.color = '#f55';
            msg.textContent = res.error || 'Erreur.';
            logBtn.disabled = false;
            logBtn.textContent = 'Enregistrer';
          }
        })
        .catch(function () {
          msg.style.color = '#f55';
          msg.textContent = 'Erreur réseau.';
          logBtn.disabled = false;
          logBtn.textContent = 'Enregistrer';
        });
    };

    row.appendChild(logBtn);
    row.appendChild(skipBtn);
    [userLine, starsWrap, ratingLabel, row, msg].forEach(function (n) { card.appendChild(n); });
  }

  // ── Routage ───────────────────────────────────────────────────────────────
  function check() {
    var h = window.location.hash;
    if (h.indexOf('/mypreferencesmenu') !== -1) {
      injectPrefsSection();
    } else if (h.indexOf('/mypreferences') !== -1 ||
               h.indexOf('/home') !== -1 ||
               h.indexOf('/video') !== -1) {
      // Pas de préférences → retirer la sentinelle pour la prochaine visite
      var old = document.querySelector('.' + PREFS_CLASS);
      if (old) old.remove();
    }
  }

  window.addEventListener('hashchange', check);

  var _obsTimer = null;
  var _obs = new MutationObserver(function () {
    clearTimeout(_obsTimer);
    _obsTimer = setTimeout(function () { _obsTimer = null; check(); }, 200);
  });

  function init() {
    _obs.observe(document.body, { childList: true, subtree: true });
    check();
  }
  if (document.body) { init(); }
  else { document.addEventListener('DOMContentLoaded', init); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function el(tag, attrs) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') node.style.cssText = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function inp(type, placeholder) {
    var i = document.createElement('input');
    i.type = type;
    i.placeholder = placeholder;
    i.style.cssText = [
      'display:block', 'width:100%', 'box-sizing:border-box',
      'padding:9px 12px', 'margin-bottom:8px',
      'border-radius:6px', 'border:1px solid #333',
      'background:#0e0e0e', 'color:#fff', 'font-size:14px',
    ].join(';');
    return i;
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function btnStyle(bg) {
    return 'background:' + bg + ';color:#fff;border:none;border-radius:7px;' +
           'padding:10px 0;font-size:15px;cursor:pointer;width:100%;font-weight:600;';
  }

  function ratingTxt(n) {
    return n === 0 ? 'Pas de note' : n + ' étoile' + (n > 1 ? 's' : '');
  }
})();

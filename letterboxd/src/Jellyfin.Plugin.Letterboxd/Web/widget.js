(function () {
  'use strict';

  var SENTINEL   = 'jf-lb-prefs';
  var MODAL_ID   = 'jf-lb-modal';
  var _origFetch = window.fetch.bind(window);

  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Item dans /mypreferencesmenu ─────────────────────────────────────────────
  function injectMenuItem() {
    if (document.querySelector('.' + SENTINEL)) return;

    var knownItem = document.querySelector(
      '.lnkDisplayPreferences, .lnkUserProfile, .lnkHomePreferences'
    );
    if (!knownItem) { setTimeout(injectMenuItem, 250); return; }

    var auth = getAuth();
    if (!auth) { setTimeout(injectMenuItem, 250); return; }

    var container = knownItem.parentNode;
    if (!container) return;

    var a = document.createElement('a');
    a.className = SENTINEL + ' listItem-border';
    a.href = '#';
    a.style.cssText = 'display:block;margin:0;padding:0;';
    a.innerHTML =
      '<div class="listItem">' +
        '<span class="material-icons listItemIcon listItemIcon-transparent" aria-hidden="true">movie</span>' +
        '<div class="listItemBody"><div class="listItemBodyText">Letterboxd</div></div>' +
      '</div>';

    a.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openSettingsModal(auth.userId);
    });

    container.appendChild(a);
  }

  // ── Modale paramètres ────────────────────────────────────────────────────────
  function openSettingsModal(userId) {
    closeModal();

    var overlay = mkEl('div', {
      id: MODAL_ID,
      style: 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.75);' +
             'display:flex;align-items:center;justify-content:center;',
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var card = mkEl('div', {
      style: 'background:#1a1a1a;border-radius:12px;padding:28px 32px;width:360px;' +
             'max-width:92vw;position:relative;color:#fff;font-family:inherit;' +
             'box-shadow:0 24px 64px rgba(0,0,0,.9);',
    });

    var hdr = mkEl('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:20px;' });
    hdr.innerHTML =
      lbLogo(28) +
      '<span style="font-size:18px;font-weight:700;">Letterboxd</span>';

    var closeBtn = mkEl('button', {
      style: 'position:absolute;top:14px;right:16px;background:none;border:none;' +
             'color:#555;font-size:20px;cursor:pointer;line-height:1;padding:0;',
    });
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeModal;

    card.appendChild(closeBtn);
    card.appendChild(hdr);

    var body = mkEl('div');
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    _origFetch('/JfLetterboxd/status?userId=' + userId)
      .then(function (r) { return r.json(); })
      .then(function (s) { renderModalBody(body, userId, s.connected, s.username || '', s.avatarUrl || ''); })
      .catch(function () {
        body.innerHTML = '<p style="color:#f55;font-size:14px">Erreur de connexion au plugin.</p>';
      });
  }

  function renderModalBody(body, userId, connected, lbUser, avatarUrl) {
    body.innerHTML = '';

    if (connected) {
      var infoDiv = mkEl('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:20px;' });
      infoDiv.appendChild(avatarEl(avatarUrl, lbUser, 44));

      var nameCol = mkEl('div');
      var label = mkEl('div', { style: 'font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.05em;' });
      label.textContent = 'Compte connecté';
      var name = mkEl('div', { style: 'font-size:16px;font-weight:600;color:#fff;margin-top:2px;' });
      name.textContent = lbUser;
      nameCol.appendChild(label);
      nameCol.appendChild(name);
      infoDiv.appendChild(nameCol);

      var hint = mkEl('p', { style: 'font-size:13px;color:#666;margin:0 0 20px;line-height:1.5;' });
      hint.textContent = 'Une fenêtre de notation apparaîtra automatiquement à la fin de chaque film.';

      var discBtn = mkEl('button', { style: dangerBtn() });
      discBtn.textContent = 'Déconnecter';
      discBtn.onclick = function () {
        discBtn.disabled = true;
        discBtn.textContent = 'Déconnexion…';
        _origFetch('/JfLetterboxd/disconnect?userId=' + userId, { method: 'DELETE' })
          .then(function () { renderModalBody(body, userId, false, '', ''); })
          .catch(function () { discBtn.disabled = false; discBtn.textContent = 'Déconnecter'; });
      };

      body.appendChild(infoDiv);
      body.appendChild(hint);
      body.appendChild(discBtn);
    } else {
      renderLoginForm(body, userId, function (username, newAvatarUrl) {
        renderModalBody(body, userId, true, username, newAvatarUrl || '');
        var it = document.querySelector('.' + SENTINEL + ' .listItemBodyText');
        if (it) it.textContent = 'Letterboxd · ' + username;
      });
    }
  }

  // ── Formulaire de connexion ──────────────────────────────────────────────────
  function renderLoginForm(container, userId, onSuccess) {
    container.innerHTML = '';

    var loginInp = formInput('text', 'Nom d\'utilisateur Letterboxd');
    var passInp  = formInput('password', 'Mot de passe');
    container.appendChild(loginInp);
    container.appendChild(passInp);

    var btn = mkEl('button', { style: primaryBtn() });
    btn.textContent = 'Se connecter';
    container.appendChild(btn);

    var err = mkEl('p', { style: 'color:#f55;font-size:13px;margin:10px 0 0;min-height:18px;' });
    container.appendChild(err);

    var cookieZone = mkEl('div', { style: 'display:none;margin-top:16px;' });
    var cfMsg = mkEl('p', {
      style: 'font-size:13px;color:#f90;margin:0 0 8px;border-top:1px solid #2a2a2a;padding-top:14px;',
    });
    cfMsg.innerHTML =
      '⚠️ Cloudflare bloque la connexion directe.<br>' +
      '<a href="https://letterboxd.com" target="_blank" style="color:#00C030;">Ouvre letterboxd.com</a> ' +
      '→ <b>F12</b> → Réseau → copie le <b>cookie</b> :';

    var ta = mkEl('textarea', {});
    ta.placeholder = 'Colle le cookie ici…';
    ta.rows = 3;
    ta.style.cssText =
      'display:block;width:100%;box-sizing:border-box;padding:8px 10px;margin:6px 0;' +
      'border-radius:6px;border:1px solid #333;background:#111;color:#fff;' +
      'font-size:12px;font-family:monospace;resize:vertical;';

    var cookieBtn = mkEl('button', { style: primaryBtn() + 'margin-top:4px;' });
    cookieBtn.textContent = 'Valider le cookie';

    cookieZone.appendChild(cfMsg);
    cookieZone.appendChild(ta);
    cookieZone.appendChild(cookieBtn);
    container.appendChild(cookieZone);

    function doLogin() {
      var login = loginInp.value.trim();
      var pass  = passInp.value;
      if (!login) { err.textContent = 'Nom d\'utilisateur requis.'; return; }
      btn.disabled = true;
      btn.textContent = 'Connexion…';
      err.textContent = '';
      cookieZone.style.display = 'none';

      _origFetch('/JfLetterboxd/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, username: login, password: pass }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            if (onSuccess) onSuccess(res.username || login, res.avatarUrl || '');
          } else if (res.error === 'CLOUDFLARE_BLOCKED') {
            err.textContent = '';
            btn.disabled = false;
            btn.textContent = 'Se connecter';
            cookieZone.style.display = '';
          } else {
            err.textContent = res.error || 'Identifiants incorrects.';
            btn.disabled = false;
            btn.textContent = 'Se connecter';
          }
        })
        .catch(function () {
          err.textContent = 'Erreur réseau.';
          btn.disabled = false;
          btn.textContent = 'Se connecter';
        });
    }

    btn.onclick = doLogin;
    [loginInp, passInp].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    });

    cookieBtn.onclick = function () {
      var cookie = ta.value.trim();
      if (!cookie) { err.textContent = 'Colle le cookie avant de valider.'; return; }
      cookieBtn.disabled = true;
      cookieBtn.textContent = 'Vérification…';
      err.textContent = '';

      _origFetch('/JfLetterboxd/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, cookieString: cookie }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            if (onSuccess) onSuccess(res.username || '?', res.avatarUrl || '');
          } else {
            err.textContent = res.error || 'Cookie invalide ou session expirée.';
            cookieBtn.disabled = false;
            cookieBtn.textContent = 'Valider le cookie';
          }
        })
        .catch(function () {
          err.textContent = 'Erreur réseau.';
          cookieBtn.disabled = false;
          cookieBtn.textContent = 'Valider le cookie';
        });
    };
  }

  function closeModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  // ── Polling fin de film (3s) ─────────────────────────────────────────────────
  function startPendingPoll() {
    var auth = getAuth();
    if (!auth) { setTimeout(startPendingPoll, 2000); return; }

    function poll() {
      _origFetch('/JfLetterboxd/pending?userId=' + auth.userId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.hasPending) return;
          if (document.getElementById(MODAL_ID)) return;

          _origFetch('/JfLetterboxd/pending?userId=' + auth.userId, { method: 'DELETE' })
            .catch(function () {});

          _origFetch('/JfLetterboxd/status?userId=' + auth.userId)
            .then(function (r) { return r.json(); })
            .then(function (s) {
              var m = data.movie;
              showRatingModal(auth, {
                itemId:         m.itemId || m.ItemId || '',
                title:          m.title  || m.Title  || 'Film',
                year:           m.year   || m.Year   || null,
                imdbId:         m.imdbId || m.ImdbId || '',
                tmdbId:         m.tmdbId || m.TmdbId || '',
              }, s.connected, s.username || '', s.avatarUrl || '');
            })
            .catch(function () {});
        })
        .catch(function () {});
    }

    poll();
    setInterval(poll, 3000);
  }
  startPendingPoll();

  // ── Modale de notation ───────────────────────────────────────────────────────
  function showRatingModal(auth, item, connected, lbUser, lbAvatarUrl) {
    if (document.getElementById(MODAL_ID)) return;

    var userId = auth.userId;
    var posterUrl = item.itemId
      ? '/Items/' + item.itemId + '/Images/Primary?fillWidth=120&quality=80&api_key=' + auth.token
      : '';

    var overlay = mkEl('div', {
      id: MODAL_ID,
      style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);' +
             'display:flex;align-items:center;justify-content:center;font-family:inherit;',
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var card = mkEl('div', {
      style: 'background:#1a1a1a;border-radius:14px;overflow:hidden;' +
             'max-width:420px;width:92%;' +
             'box-shadow:0 24px 72px rgba(0,0,0,.95);position:relative;color:#fff;',
    });

    // ── Header bande verte ────────────────────────────────────────────────────
    var header = mkEl('div', {
      style: 'background:#00c030;padding:12px 16px;display:flex;align-items:center;gap:8px;',
    });
    header.innerHTML =
      lbLogo(22) +
      '<span style="font-size:14px;font-weight:700;color:#fff;letter-spacing:.02em;">Letterboxd</span>';

    var xBtn = mkEl('button', {
      style: 'position:absolute;top:10px;right:12px;background:none;border:none;' +
             'color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px;' +
             'border-radius:4px;z-index:1;',
    });
    xBtn.textContent = '✕';
    xBtn.onclick = function () { overlay.remove(); };
    xBtn.onmouseenter = function () { xBtn.style.background = 'rgba(0,0,0,.25)'; };
    xBtn.onmouseleave = function () { xBtn.style.background = 'none'; };

    // ── Corps ─────────────────────────────────────────────────────────────────
    var body = mkEl('div', { style: 'padding:20px 24px 24px;' });

    // Poster + info
    var movieRow = mkEl('div', { style: 'display:flex;gap:14px;margin-bottom:18px;align-items:flex-start;' });

    if (posterUrl) {
      var posterImg = mkEl('img', {});
      posterImg.src = posterUrl;
      posterImg.alt = '';
      posterImg.style.cssText =
        'width:60px;min-width:60px;height:90px;object-fit:cover;border-radius:6px;' +
        'background:#111;flex-shrink:0;';
      posterImg.onerror = function () { posterImg.style.display = 'none'; };
      movieRow.appendChild(posterImg);
    }

    var movieInfo = mkEl('div', { style: 'flex:1;min-width:0;padding-top:2px;' });
    var movieTitle = mkEl('div', {
      style: 'font-size:16px;font-weight:700;color:#fff;line-height:1.3;' +
             'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    });
    movieTitle.textContent = item.title;
    var movieYear = mkEl('div', { style: 'font-size:13px;color:#666;margin-top:3px;' });
    movieYear.textContent = item.year ? String(item.year) : '';
    movieInfo.appendChild(movieTitle);
    movieInfo.appendChild(movieYear);
    movieRow.appendChild(movieInfo);

    body.appendChild(movieRow);

    if (!connected) {
      var wrap = mkEl('div', { style: 'text-align:left;' });
      renderLoginForm(wrap, userId, function (username, newAvatar) {
        overlay.remove();
        showRatingModal(auth, item, true, username, newAvatar || '');
      });
      body.appendChild(wrap);
      var skip = mkEl('button', {
        style: 'background:none;border:none;color:#555;font-size:13px;cursor:pointer;' +
               'display:block;width:100%;margin-top:8px;text-align:center;padding:4px;',
      });
      skip.textContent = 'Passer';
      skip.onclick = function () { overlay.remove(); };
      body.appendChild(skip);
    } else {
      buildStarRatingUI(body, overlay, userId, lbUser, lbAvatarUrl, item);
    }

    card.appendChild(header);
    card.appendChild(xBtn);
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function buildStarRatingUI(body, overlay, userId, lbUser, lbAvatarUrl, item) {
    // Qui est connecté
    var whoRow = mkEl('div', {
      style: 'display:flex;align-items:center;gap:8px;padding:10px 12px;' +
             'background:#111;border-radius:8px;margin-bottom:16px;',
    });
    whoRow.appendChild(avatarEl(lbAvatarUrl, lbUser, 28));
    var whoLabel = mkEl('span', { style: 'font-size:13px;color:#aaa;' });
    whoLabel.innerHTML = 'Connecté en tant que <b style="color:#fff;">' + esc(lbUser) + '</b>';
    whoRow.appendChild(whoLabel);
    body.appendChild(whoRow);

    // Étoiles
    var cur = 0;
    var starsRow = mkEl('div', {
      style: 'display:flex;justify-content:center;gap:4px;cursor:pointer;user-select:none;margin-bottom:6px;',
    });
    var starEls = [];
    for (var i = 1; i <= 5; i++) {
      (function (v) {
        var s = mkEl('span', { style: 'font-size:40px;color:#2a2a2a;transition:color .08s;line-height:1;' });
        s.textContent = '★';
        s.addEventListener('mouseenter', function () { paint(v); });
        s.addEventListener('mouseleave', function () { paint(cur); });
        s.addEventListener('click', function () {
          cur = (cur === v) ? 0 : v;
          paint(cur);
          lbl.textContent = cur ? cur + (cur > 1 ? ' étoiles' : ' étoile') : 'Pas de note';
        });
        starsRow.appendChild(s);
        starEls.push(s);
      })(i);
    }

    function paint(n) {
      starEls.forEach(function (s, i) { s.style.color = i < n ? '#f5c518' : '#2a2a2a'; });
    }

    var lbl = mkEl('p', { style: 'color:#555;font-size:13px;margin:0 0 18px;text-align:center;' });
    lbl.textContent = 'Pas de note';
    body.appendChild(starsRow);
    body.appendChild(lbl);

    var row = mkEl('div', { style: 'display:flex;gap:8px;' });
    var logBtn = mkEl('button', { style: primaryBtn() + 'flex:1;padding:11px 0;font-size:15px;' });
    logBtn.textContent = 'Enregistrer';
    var skipBtn = mkEl('button', {
      style: 'background:#222;color:#888;border:none;border-radius:8px;padding:11px 18px;' +
             'cursor:pointer;font-size:14px;flex-shrink:0;',
    });
    skipBtn.textContent = 'Passer';
    skipBtn.onclick = function () { overlay.remove(); };

    var msg = mkEl('p', { style: 'font-size:13px;margin:12px 0 0;min-height:18px;text-align:center;' });

    logBtn.onclick = function () {
      logBtn.disabled = true;
      logBtn.textContent = 'Enregistrement…';
      msg.textContent = '';
      _origFetch('/JfLetterboxd/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:  userId,
          tmdbId:  item.tmdbId || '',
          imdbId:  item.imdbId || '',
          title:   item.title,
          year:    item.year ? parseInt(item.year) : null,
          rating:  cur,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            msg.style.color = '#00c030';
            msg.textContent = '✓ Enregistré sur Letterboxd !';
            setTimeout(function () { overlay.remove(); }, 1800);
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
    body.appendChild(row);
    body.appendChild(msg);
  }

  // ── Routage ──────────────────────────────────────────────────────────────────
  function check() {
    if (window.location.hash.indexOf('/mypreferencesmenu') !== -1) {
      injectMenuItem();
    } else {
      var old = document.querySelector('.' + SENTINEL);
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

  // ── Helpers DOM ──────────────────────────────────────────────────────────────
  function mkEl(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') n.style.cssText = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  function formInput(type, ph) {
    var i = mkEl('input', { type: type });
    i.placeholder = ph;
    i.style.cssText =
      'display:block;width:100%;box-sizing:border-box;' +
      'padding:9px 12px;margin-bottom:8px;' +
      'border-radius:7px;border:1px solid #2a2a2a;' +
      'background:#111;color:#fff;font-size:14px;';
    return i;
  }

  function primaryBtn() {
    return 'background:#00c030;color:#fff;border:none;border-radius:8px;' +
           'padding:10px 0;font-size:14px;font-weight:600;cursor:pointer;width:100%;';
  }

  function dangerBtn() {
    return 'background:#c0392b;color:#fff;border:none;border-radius:7px;' +
           'padding:9px 20px;font-size:14px;cursor:pointer;';
  }

  function lbLogo(size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="50" fill="#fff" fill-opacity=".2"/>' +
      '<text x="50" y="67" text-anchor="middle" font-family="serif" font-size="54" font-weight="bold" fill="white">L</text>' +
    '</svg>';
  }

  function avatarEl(url, name, size) {
    var s = size + 'px';
    if (url) {
      var img = mkEl('img', {});
      img.src = url;
      img.alt = name || '';
      img.style.cssText =
        'width:' + s + ';height:' + s + ';border-radius:50%;object-fit:cover;' +
        'flex-shrink:0;background:#222;';
      img.onerror = function () {
        img.replaceWith(avatarEl('', name, size));
      };
      return img;
    }
    var circle = mkEl('div', {
      style: 'width:' + s + ';height:' + s + ';border-radius:50%;background:#00c030;' +
             'color:#fff;display:flex;align-items:center;justify-content:center;' +
             'font-size:' + Math.round(size * 0.45) + 'px;font-weight:700;flex-shrink:0;',
    });
    circle.textContent = (name || '?').charAt(0).toUpperCase();
    return circle;
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();

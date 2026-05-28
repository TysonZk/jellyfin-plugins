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
      style: 'background:#14181c;border-radius:12px;padding:24px 28px;width:360px;' +
             'max-width:92vw;position:relative;color:#fff;font-family:inherit;' +
             'box-shadow:0 24px 64px rgba(0,0,0,.9);border:1px solid #2c3440;',
    });

    var hdr = mkEl('div', { style: 'margin-bottom:20px;' });
    hdr.innerHTML = lbLogoFull(26);

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
      var label = mkEl('div', { style: 'font-size:11px;color:#9ab;text-transform:uppercase;letter-spacing:.05em;' });
      label.textContent = 'Compte connecté';
      var name = mkEl('div', { style: 'font-size:16px;font-weight:600;color:#fff;margin-top:2px;' });
      name.textContent = lbUser;
      nameCol.appendChild(label);
      nameCol.appendChild(name);
      infoDiv.appendChild(nameCol);

      var hint = mkEl('p', { style: 'font-size:13px;color:#9ab;margin:0 0 20px;line-height:1.5;' });
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
      style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88);' +
             'display:flex;align-items:center;justify-content:center;font-family:inherit;',
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var card = mkEl('div', {
      style: 'background:#14181c;border-radius:12px;overflow:hidden;' +
             'max-width:400px;width:92%;' +
             'box-shadow:0 24px 72px rgba(0,0,0,.95);position:relative;color:#fff;' +
             'border:1px solid #2c3440;',
    });

    // ── Header Letterboxd ─────────────────────────────────────────────────────
    var header = mkEl('div', {
      style: 'background:#14181c;padding:14px 16px 10px;display:flex;align-items:center;' +
             'gap:10px;border-bottom:1px solid #2c3440;',
    });
    header.innerHTML = lbLogoFull(28);

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
    var body = mkEl('div', { style: 'padding:16px 20px 20px;background:#14181c;' });

    // Poster + info
    var movieRow = mkEl('div', { style: 'display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;' });

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
      style: 'font-size:15px;font-weight:700;color:#fff;line-height:1.3;' +
             'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    });
    movieTitle.textContent = item.title;
    var movieYear = mkEl('div', { style: 'font-size:12px;color:#9ab;margin-top:3px;' });
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
      style: 'display:flex;align-items:center;gap:8px;padding:8px 12px;' +
             'background:#1e2530;border-radius:8px;margin-bottom:14px;',
    });
    whoRow.appendChild(avatarEl(lbAvatarUrl, lbUser, 26));
    var whoLabel = mkEl('span', { style: 'font-size:12px;color:#9ab;' });
    whoLabel.innerHTML = 'Connecté · <b style="color:#fff;">' + esc(lbUser) + '</b>';
    whoRow.appendChild(whoLabel);
    body.appendChild(whoRow);

    // ── Demi-étoiles (0.5 à 5.0 comme Letterboxd) ────────────────────────────
    var cur = 0;
    var fgEls = []; // foreground clip spans (one per star position)

    var starsRow = mkEl('div', {
      style: 'display:flex;justify-content:center;gap:2px;user-select:none;margin-bottom:4px;',
    });

    for (var i = 1; i <= 5; i++) {
      (function (pos) {
        // Container pour une position d'étoile
        var container = mkEl('span', {
          style: 'position:relative;display:inline-block;width:40px;height:40px;cursor:pointer;',
        });

        // Étoile background (gris)
        var bgStar = mkEl('span', {
          style: 'position:absolute;inset:0;font-size:40px;line-height:40px;color:#2e3d4f;' +
                 'text-align:center;pointer-events:none;',
        });
        bgStar.textContent = '★';

        // Étoile foreground (orange LB, clippée selon remplissage)
        var fgClip = mkEl('span', {
          style: 'position:absolute;inset:0;overflow:hidden;width:0;pointer-events:none;',
        });
        var fgStar = mkEl('span', {
          style: 'position:absolute;inset:0;font-size:40px;line-height:40px;color:#ef845d;' +
                 'text-align:center;white-space:nowrap;',
        });
        fgStar.textContent = '★';
        fgClip.appendChild(fgStar);

        container.appendChild(bgStar);
        container.appendChild(fgClip);
        fgEls.push(fgClip);

        container.addEventListener('mousemove', function (e) {
          var rect = container.getBoundingClientRect();
          var half = (e.clientX - rect.left) < (rect.width / 2);
          paint(half ? pos - 0.5 : pos);
          lbl.textContent = formatRating(half ? pos - 0.5 : pos);
        });
        container.addEventListener('mouseleave', function () {
          paint(cur);
          lbl.textContent = formatRating(cur);
        });
        container.addEventListener('click', function (e) {
          var rect = container.getBoundingClientRect();
          var half = (e.clientX - rect.left) < (rect.width / 2);
          var clicked = half ? pos - 0.5 : pos;
          cur = (cur === clicked) ? 0 : clicked;
          paint(cur);
          lbl.textContent = formatRating(cur);
        });

        starsRow.appendChild(container);
      })(i);
    }

    function paint(n) {
      fgEls.forEach(function (fg, idx) {
        var full = n - idx; // combien de cette position est remplie
        if (full >= 1)      fg.style.width = '100%';
        else if (full >= 0.5) fg.style.width = '50%';
        else                  fg.style.width = '0';
      });
    }

    function formatRating(n) {
      if (!n) return 'Pas de note';
      var stars = '';
      for (var k = 0; k < Math.floor(n); k++) stars += '★';
      if (n % 1 >= 0.5) stars += '½';
      return stars + ' · ' + n + (n > 1 ? ' étoiles' : ' étoile');
    }

    var lbl = mkEl('p', { style: 'color:#9ab;font-size:12px;margin:2px 0 14px;text-align:center;min-height:16px;' });
    lbl.textContent = 'Pas de note';
    body.appendChild(starsRow);
    body.appendChild(lbl);

    var row = mkEl('div', { style: 'display:flex;gap:8px;' });
    var logBtn = mkEl('button', { style: lbBtn() + 'flex:1;' });
    logBtn.textContent = 'Enregistrer';
    var skipBtn = mkEl('button', {
      style: 'background:#2c3440;color:#9ab;border:none;border-radius:8px;padding:11px 18px;' +
             'cursor:pointer;font-size:14px;flex-shrink:0;',
    });
    skipBtn.textContent = 'Passer';
    skipBtn.onclick = function () { overlay.remove(); };

    var msg = mkEl('p', { style: 'font-size:12px;margin:10px 0 0;min-height:16px;text-align:center;' });

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
          } else if (res.action === 'client_submit') {
            // Fallback cookie : le navigateur soumet le formulaire directement
            submitFromBrowser(res.filmId, res.csrf, res.date, res.rating);
            msg.style.color = '#00c030';
            var lbUrl = res.lbSlug
              ? 'https://letterboxd.com/film/' + res.lbSlug + '/'
              : 'https://letterboxd.com/';
            msg.innerHTML = '✓ Envoyé ! <a href="' + lbUrl + '" target="_blank" ' +
              'style="color:#aaa;font-size:11px;">Vérifier ↗</a>';
            setTimeout(function () { overlay.remove(); }, 3000);
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
    return 'background:#00c030;color:#fff;border:none;border-radius:6px;' +
           'padding:10px 0;font-size:14px;font-weight:600;cursor:pointer;width:100%;';
  }

  function lbBtn() {
    return 'background:#00e054;color:#14181c;border:none;border-radius:6px;' +
           'padding:11px 0;font-size:14px;font-weight:700;cursor:pointer;width:100%;';
  }

  function dangerBtn() {
    return 'background:#c0392b;color:#fff;border:none;border-radius:6px;' +
           'padding:9px 20px;font-size:14px;cursor:pointer;';
  }

  // Logo Letterboxd — trois cercles superposés (marque officielle)
  function lbLogoFull(h) {
    var r = h / 2;
    var gap = r * 0.6;
    var w = r * 2 + gap * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (w + 90) + '" height="' + h + '" viewBox="0 0 ' + (w + 90) + ' ' + h + '">' +
      '<circle cx="' + r + '" cy="' + r + '" r="' + r + '" fill="#00e054"/>' +
      '<circle cx="' + (r + gap) + '" cy="' + r + '" r="' + r + '" fill="#40bcf4"/>' +
      '<circle cx="' + (r + gap * 2) + '" cy="' + r + '" r="' + r + '" fill="#ec9c52"/>' +
      '<text x="' + (r * 2 + gap * 2 + 10) + '" y="' + (r + r * 0.38) + '" font-family="Georgia,serif" font-size="' + (r * 1.2) + '" font-weight="bold" fill="#fff" letter-spacing="-0.5">letterboxd</text>' +
    '</svg>';
  }

  function lbLogo(size) {
    return lbLogoFull(size);
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

  // ── Soumission directe depuis le navigateur via form submit ─────────────────
  // fetch no-cors ne pas envoyer les cookies SameSite=Lax sur un POST cross-site.
  // Un form submit vers une nouvelle fenêtre compte comme navigation top-level
  // → cookies Lax envoyés → Cloudflare et session Letterboxd OK.
  function submitFromBrowser(filmId, csrf, date, rating) {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://letterboxd.com/s/save-diary-entry';
    form.style.display = 'none';

    var fields = {
      '__csrf':         csrf || '',
      'filmId':         String(filmId),
      'specifiedDate':  'on',
      'viewingDateStr': date,
      'rating':         String(rating),
    };
    Object.keys(fields).forEach(function(k) {
      var inp = document.createElement('input');
      inp.type  = 'hidden';
      inp.name  = k;
      inp.value = fields[k];
      form.appendChild(inp);
    });

    // Ouvre une mini-fenêtre (navigation top-level → cookies LB inclus)
    var winRef = null;
    try {
      winRef = window.open('about:blank', '_lb_diary_submit',
        'width=1,height=1,left=0,top=0,menubar=no,toolbar=no,status=no,scrollbars=no');
      form.target = '_lb_diary_submit';
    } catch (e) {
      form.target = '_blank';
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    if (winRef) setTimeout(function () { try { winRef.close(); } catch (e) {} }, 1500);
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();

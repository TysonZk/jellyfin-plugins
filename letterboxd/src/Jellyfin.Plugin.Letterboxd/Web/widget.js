(function () {
  'use strict';

  var SENTINEL = 'jf-lb-prefs';
  var MODAL_ID = 'jf-lb-modal';
  var _origFetch = window.fetch.bind(window);

  // ── Auth ─────────────────────────────────────────────────────────────────────
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

  // ── Lien dans /mypreferencesmenu ──────────────────────────────────────────────
  function injectMenuItem() {
    if (document.querySelector('.' + SENTINEL)) return;
    var knownItem = document.querySelector('.lnkDisplayPreferences, .lnkUserProfile, .lnkHomePreferences');
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

  // ── Modale paramètres ─────────────────────────────────────────────────────────
  function openSettingsModal(userId) {
    closeModal();
    var overlay = mkOverlay(99998);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var card = mkEl('div', {
      style: 'background:#14181c;border-radius:12px;padding:24px 26px;width:340px;' +
             'max-width:92vw;position:relative;color:#fff;font-family:inherit;' +
             'box-shadow:0 24px 64px rgba(0,0,0,.9);border:1px solid #2c3440;',
    });

    var closeBtn = mkEl('button', {
      style: 'position:absolute;top:12px;right:14px;background:none;border:none;' +
             'color:#456;font-size:18px;cursor:pointer;line-height:1;padding:4px 6px;',
    });
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeModal;

    var hdr = mkEl('div', { style: 'margin-bottom:20px;' });
    hdr.appendChild(lbLogoNode(20));

    card.appendChild(closeBtn);
    card.appendChild(hdr);
    var body = mkEl('div');
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    _origFetch('/JfLetterboxd/status?userId=' + userId)
      .then(function (r) { return r.json(); })
      .then(function (s) { renderModalBody(body, userId, s.connected, s.username || '', s.avatarUrl || ''); })
      .catch(function () { body.innerHTML = '<p style="color:#f55;font-size:13px">Erreur plugin.</p>'; });
  }

  function renderModalBody(body, userId, connected, lbUser, avatarUrl) {
    body.innerHTML = '';
    if (connected) {
      var infoDiv = mkEl('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:16px;' });
      infoDiv.appendChild(avatarEl(avatarUrl, lbUser, 44));
      var col = mkEl('div');
      var lbl = mkEl('div', { style: 'font-size:10px;color:#567;text-transform:uppercase;letter-spacing:.08em;' });
      lbl.textContent = 'Connecté';
      var nm = mkEl('div', { style: 'font-size:15px;font-weight:600;color:#fff;margin-top:2px;' });
      nm.textContent = lbUser;
      col.appendChild(lbl); col.appendChild(nm);
      infoDiv.appendChild(col);

      var hint = mkEl('p', { style: 'font-size:12px;color:#567;margin:0 0 18px;line-height:1.5;' });
      hint.textContent = 'La popup de notation apparaîtra automatiquement à la fin de chaque film.';

      var discBtn = mkEl('button', { style: 'background:#c0392b;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:13px;cursor:pointer;' });
      discBtn.textContent = 'Déconnecter';
      discBtn.onclick = function () {
        discBtn.disabled = true; discBtn.textContent = 'Déconnexion…';
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

  // ── Formulaire connexion ───────────────────────────────────────────────────────
  function renderLoginForm(container, userId, onSuccess) {
    container.innerHTML = '';
    var loginInp = formInput('text', 'Nom d\'utilisateur Letterboxd');
    var passInp  = formInput('password', 'Mot de passe');
    container.appendChild(loginInp);
    container.appendChild(passInp);

    var btn = mkEl('button', { style: lbBtn() });
    btn.textContent = 'Se connecter';
    container.appendChild(btn);

    var err = mkEl('p', { style: 'color:#f55;font-size:12px;margin:8px 0 0;min-height:16px;' });
    container.appendChild(err);

    var cookieZone = mkEl('div', { style: 'display:none;margin-top:14px;' });
    var cfMsg = mkEl('p', { style: 'font-size:12px;color:#f90;margin:0 0 8px;border-top:1px solid #2c3440;padding-top:12px;' });
    cfMsg.innerHTML = '⚠️ Cloudflare bloque. <a href="https://letterboxd.com" target="_blank" style="color:#00e054;">Ouvre letterboxd.com</a> → F12 → Réseau → copie le cookie :';
    var ta = mkEl('textarea', {});
    ta.placeholder = 'Cookie…';
    ta.rows = 3;
    ta.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:8px;margin:6px 0;border-radius:6px;border:1px solid #2c3440;background:#0d1117;color:#fff;font-size:11px;font-family:monospace;resize:vertical;';
    var cookieBtn = mkEl('button', { style: lbBtn() + 'margin-top:4px;' });
    cookieBtn.textContent = 'Valider le cookie';
    cookieZone.appendChild(cfMsg); cookieZone.appendChild(ta); cookieZone.appendChild(cookieBtn);
    container.appendChild(cookieZone);

    function doLogin() {
      var login = loginInp.value.trim(), pass = passInp.value;
      if (!login) { err.textContent = 'Nom d\'utilisateur requis.'; return; }
      btn.disabled = true; btn.textContent = 'Connexion…'; err.textContent = ''; cookieZone.style.display = 'none';
      _origFetch('/JfLetterboxd/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, username: login, password: pass }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.success) { if (onSuccess) onSuccess(res.username || login, res.avatarUrl || ''); }
        else if (res.error === 'CLOUDFLARE_BLOCKED') { err.textContent = ''; btn.disabled = false; btn.textContent = 'Se connecter'; cookieZone.style.display = ''; }
        else { err.textContent = res.error || 'Identifiants incorrects.'; btn.disabled = false; btn.textContent = 'Se connecter'; }
      }).catch(function () { err.textContent = 'Erreur réseau.'; btn.disabled = false; btn.textContent = 'Se connecter'; });
    }
    btn.onclick = doLogin;
    [loginInp, passInp].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); });

    cookieBtn.onclick = function () {
      var cookie = ta.value.trim();
      if (!cookie) { err.textContent = 'Colle le cookie avant de valider.'; return; }
      cookieBtn.disabled = true; cookieBtn.textContent = 'Vérification…'; err.textContent = '';
      _origFetch('/JfLetterboxd/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, cookieString: cookie }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.success) { if (onSuccess) onSuccess(res.username || '?', res.avatarUrl || ''); }
        else { err.textContent = res.error || 'Cookie invalide.'; cookieBtn.disabled = false; cookieBtn.textContent = 'Valider le cookie'; }
      }).catch(function () { err.textContent = 'Erreur réseau.'; cookieBtn.disabled = false; cookieBtn.textContent = 'Valider le cookie'; });
    };
  }

  function closeModal() { var m = document.getElementById(MODAL_ID); if (m) m.remove(); }

  // ── Polling 3s ────────────────────────────────────────────────────────────────
  function startPendingPoll() {
    var auth = getAuth();
    if (!auth) { setTimeout(startPendingPoll, 2000); return; }
    function poll() {
      _origFetch('/JfLetterboxd/pending?userId=' + auth.userId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.hasPending || document.getElementById(MODAL_ID)) return;
          _origFetch('/JfLetterboxd/pending?userId=' + auth.userId, { method: 'DELETE' }).catch(function () {});
          _origFetch('/JfLetterboxd/status?userId=' + auth.userId)
            .then(function (r) { return r.json(); })
            .then(function (s) {
              var m = data.movie;
              showRatingModal(auth, {
                itemId: m.itemId || m.ItemId || '',
                title:  m.title  || m.Title  || 'Film',
                year:   m.year   || m.Year   || null,
                imdbId: m.imdbId || m.ImdbId || '',
                tmdbId: m.tmdbId || m.TmdbId || '',
              }, s.connected, s.username || '', s.avatarUrl || '');
            }).catch(function () {});
        }).catch(function () {});
    }
    poll();
    setInterval(poll, 3000);
  }
  startPendingPoll();

  // ── Popup de notation ─────────────────────────────────────────────────────────
  function showRatingModal(auth, item, connected, lbUser, lbAvatarUrl) {
    if (document.getElementById(MODAL_ID)) return;
    var userId    = auth.userId;
    var posterUrl = item.itemId ? '/Items/' + item.itemId + '/Images/Primary?fillWidth=100&quality=85&api_key=' + auth.token : '';

    var overlay = mkOverlay(99999);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    // ── Card ──────────────────────────────────────────────────────────────────
    var card = mkEl('div', {
      style: 'background:#14181c;border-radius:12px;overflow:hidden;width:360px;max-width:94vw;' +
             'box-shadow:0 32px 80px rgba(0,0,0,.95);position:relative;color:#fff;border:1px solid #2c3440;',
    });

    // ── En-tête ───────────────────────────────────────────────────────────────
    var header = mkEl('div', {
      style: 'padding:12px 16px;border-bottom:1px solid #2c3440;display:flex;align-items:center;justify-content:space-between;',
    });
    header.appendChild(lbLogoNode(18));

    var xBtn = mkEl('button', {
      style: 'background:none;border:none;color:#456;font-size:18px;cursor:pointer;padding:2px 4px;line-height:1;',
    });
    xBtn.textContent = '✕';
    xBtn.onclick = function () { overlay.remove(); };
    header.appendChild(xBtn);

    // ── Film info ─────────────────────────────────────────────────────────────
    var filmSection = mkEl('div', { style: 'display:flex;gap:12px;padding:14px 16px 0;align-items:flex-start;' });

    if (posterUrl) {
      var poster = mkEl('img', {});
      poster.src = posterUrl;
      poster.alt = '';
      poster.style.cssText = 'width:56px;min-width:56px;height:84px;object-fit:cover;border-radius:4px;background:#1e2530;flex-shrink:0;';
      poster.onerror = function () { poster.style.display = 'none'; };
      filmSection.appendChild(poster);
    }

    var filmInfo = mkEl('div', { style: 'flex:1;min-width:0;padding-top:2px;' });
    var titleEl = mkEl('div', {
      style: 'font-size:15px;font-weight:700;color:#fff;line-height:1.35;word-break:break-word;overflow-wrap:break-word;',
    });
    titleEl.textContent = item.title;
    var yearEl = mkEl('div', { style: 'font-size:12px;color:#567;margin-top:3px;' });
    yearEl.textContent = item.year ? String(item.year) : '';
    filmInfo.appendChild(titleEl);
    filmInfo.appendChild(yearEl);
    filmSection.appendChild(filmInfo);

    // ── Corps ─────────────────────────────────────────────────────────────────
    var body = mkEl('div', { style: 'padding:14px 16px 18px;' });

    if (!connected) {
      var wrap = mkEl('div');
      renderLoginForm(wrap, userId, function (username, newAvatar) {
        overlay.remove();
        showRatingModal(auth, item, true, username, newAvatar || '');
      });
      body.appendChild(wrap);
      var skip = mkEl('button', { style: 'background:none;border:none;color:#456;font-size:12px;cursor:pointer;display:block;width:100%;margin-top:6px;' });
      skip.textContent = 'Passer';
      skip.onclick = function () { overlay.remove(); };
      body.appendChild(skip);
    } else {
      buildStarRatingUI(body, overlay, userId, lbUser, lbAvatarUrl, item);
    }

    card.appendChild(header);
    card.appendChild(filmSection);
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // ── UI demi-étoiles ───────────────────────────────────────────────────────────
  function buildStarRatingUI(body, overlay, userId, lbUser, lbAvatarUrl, item) {
    // Barre compte connecté
    var whoRow = mkEl('div', { style: 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1a2030;border-radius:8px;margin-bottom:14px;' });
    whoRow.appendChild(avatarEl(lbAvatarUrl, lbUser, 24));
    var whoLabel = mkEl('span', { style: 'font-size:12px;color:#789;' });
    whoLabel.innerHTML = 'Connecté en tant que <b style="color:#cde;">' + esc(lbUser) + '</b>';
    whoRow.appendChild(whoLabel);
    body.appendChild(whoRow);

    // Étoiles demi-précision
    var cur = 0;
    var fgEls = [];

    var starsRow = mkEl('div', { style: 'display:flex;justify-content:center;gap:0;user-select:none;margin-bottom:2px;' });

    for (var i = 1; i <= 5; i++) {
      (function (pos) {
        var wrap = mkEl('span', { style: 'position:relative;display:inline-block;width:44px;height:44px;cursor:pointer;flex-shrink:0;' });

        // Étoile grise (fond)
        var bg = mkEl('span', { style: 'position:absolute;inset:0;font-size:44px;line-height:44px;color:#2c3a4a;text-align:center;pointer-events:none;' });
        bg.textContent = '★';

        // Étoile orange (foreground clippé)
        var fg = mkEl('span', { style: 'position:absolute;top:0;left:0;height:100%;overflow:hidden;width:0;pointer-events:none;' });
        var fgStar = mkEl('span', { style: 'position:absolute;top:0;left:0;width:44px;height:44px;font-size:44px;line-height:44px;color:#ef845d;text-align:center;' });
        fgStar.textContent = '★';
        fg.appendChild(fgStar);

        wrap.appendChild(bg);
        wrap.appendChild(fg);
        fgEls.push(fg);

        wrap.addEventListener('mousemove', function (e) {
          var rect = wrap.getBoundingClientRect();
          var half = (e.clientX - rect.left) < rect.width / 2;
          var v = half ? pos - 0.5 : pos;
          paintStars(v);
          lbl.textContent = ratingLabel(v);
        });
        wrap.addEventListener('mouseleave', function () {
          paintStars(cur);
          lbl.textContent = ratingLabel(cur);
        });
        wrap.addEventListener('click', function (e) {
          var rect = wrap.getBoundingClientRect();
          var half = (e.clientX - rect.left) < rect.width / 2;
          var v = half ? pos - 0.5 : pos;
          cur = (cur === v) ? 0 : v;
          paintStars(cur);
          lbl.textContent = ratingLabel(cur);
        });

        starsRow.appendChild(wrap);
      })(i);
    }

    function paintStars(n) {
      fgEls.forEach(function (fg, idx) {
        var fill = n - idx;
        fg.style.width = fill >= 1 ? '100%' : fill >= 0.5 ? '50%' : '0';
      });
    }

    function ratingLabel(n) {
      if (!n) return 'Pas de note';
      var s = '';
      for (var k = 0; k < Math.floor(n); k++) s += '★';
      if (n % 1 >= 0.5) s += '½';
      return s + '  ' + n + (n === 1 || n === 0.5 ? ' étoile' : ' étoiles');
    }

    var lbl = mkEl('p', { style: 'color:#567;font-size:12px;margin:2px 0 14px;text-align:center;min-height:16px;letter-spacing:.02em;' });
    lbl.textContent = 'Pas de note';
    body.appendChild(starsRow);
    body.appendChild(lbl);

    // Boutons
    var btnsRow = mkEl('div', { style: 'display:flex;gap:8px;' });
    var logBtn  = mkEl('button', { style: lbBtn() + 'flex:1;' });
    logBtn.textContent = 'Enregistrer';

    var skipBtn = mkEl('button', { style: 'background:#1e2530;color:#789;border:none;border-radius:6px;padding:11px 16px;cursor:pointer;font-size:13px;flex-shrink:0;' });
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
          userId: userId,
          tmdbId: item.tmdbId || '',
          imdbId: item.imdbId || '',
          title:  item.title,
          year:   item.year ? parseInt(item.year) : null,
          rating: cur,
        }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.success) {
          msg.style.color = '#00e054';
          msg.textContent = '✓ Enregistré sur Letterboxd !';
          setTimeout(function () { overlay.remove(); }, 1800);
        } else if (res.action === 'client_submit') {
          submitFromBrowser(res.filmId, res.csrf, res.date, res.rating);
          msg.style.color = '#00e054';
          var lbUrl = res.lbSlug ? 'https://letterboxd.com/film/' + res.lbSlug + '/' : 'https://letterboxd.com/';
          msg.innerHTML = '✓ Envoyé ! <a href="' + lbUrl + '" target="_blank" style="color:#789;font-size:11px;">Vérifier ↗</a>';
          setTimeout(function () { overlay.remove(); }, 3000);
        } else {
          msg.style.color = '#f55';
          msg.textContent = res.error || 'Erreur.';
          logBtn.disabled = false;
          logBtn.textContent = 'Enregistrer';
        }
      }).catch(function () {
        msg.style.color = '#f55';
        msg.textContent = 'Erreur réseau.';
        logBtn.disabled = false;
        logBtn.textContent = 'Enregistrer';
      });
    };

    btnsRow.appendChild(logBtn);
    btnsRow.appendChild(skipBtn);
    body.appendChild(btnsRow);
    body.appendChild(msg);
  }

  // ── Routage ───────────────────────────────────────────────────────────────────
  function check() {
    if (window.location.hash.indexOf('/mypreferencesmenu') !== -1) injectMenuItem();
    else { var old = document.querySelector('.' + SENTINEL); if (old) old.remove(); }
  }
  window.addEventListener('hashchange', check);
  var _obsTimer = null;
  var _obs = new MutationObserver(function () {
    clearTimeout(_obsTimer);
    _obsTimer = setTimeout(function () { _obsTimer = null; check(); }, 200);
  });
  function init() { _obs.observe(document.body, { childList: true, subtree: true }); check(); }
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  // ── Helpers DOM ───────────────────────────────────────────────────────────────
  function mkEl(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') n.style.cssText = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  function mkOverlay(z) {
    return mkEl('div', {
      id: MODAL_ID,
      style: 'position:fixed;inset:0;z-index:' + z + ';background:rgba(0,0,0,.88);' +
             'display:flex;align-items:center;justify-content:center;font-family:inherit;',
    });
  }

  function formInput(type, ph) {
    var i = mkEl('input', { type: type });
    i.placeholder = ph;
    i.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:9px 11px;margin-bottom:8px;' +
                      'border-radius:6px;border:1px solid #2c3440;background:#0d1117;color:#fff;font-size:13px;';
    return i;
  }

  function lbBtn() {
    return 'background:#00e054;color:#14181c;border:none;border-radius:6px;' +
           'padding:11px 0;font-size:14px;font-weight:700;cursor:pointer;width:100%;';
  }

  // Logo Letterboxd : 3 cercles + texte en HTML (pas de SVG text pour éviter le débordement)
  function lbLogoNode(h) {
    var r = h / 2;
    var spacing = r * 1.3; // center-to-center : chevauchement ~35%
    var w = r * 2 + spacing * 2; // total width des 3 cercles

    var wrap = mkEl('span', { style: 'display:inline-flex;align-items:center;gap:9px;' });

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width',   String(Math.ceil(w)));
    svg.setAttribute('height',  String(h));
    svg.setAttribute('viewBox', '0 0 ' + Math.ceil(w) + ' ' + h);
    svg.style.flexShrink = '0';

    [[r,          '#00e054'],
     [r + spacing,'#40bcf4'],
     [r + spacing * 2, '#ec9c52']].forEach(function (pair) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(pair[0]));
      c.setAttribute('cy', String(r));
      c.setAttribute('r',  String(r));
      c.setAttribute('fill', pair[1]);
      svg.appendChild(c);
    });

    var text = mkEl('span', {
      style: 'font-size:' + Math.round(h * 0.75) + 'px;font-weight:700;color:#fff;' +
             'font-family:Georgia,"Times New Roman",serif;letter-spacing:-.3px;white-space:nowrap;',
    });
    text.textContent = 'letterboxd';

    wrap.appendChild(svg);
    wrap.appendChild(text);
    return wrap;
  }

  function avatarEl(url, name, size) {
    var s = size + 'px';
    if (url) {
      var img = mkEl('img', {});
      img.src = url; img.alt = name || '';
      img.style.cssText = 'width:' + s + ';height:' + s + ';border-radius:50%;object-fit:cover;flex-shrink:0;background:#1e2530;';
      img.onerror = function () { img.replaceWith(avatarEl('', name, size)); };
      return img;
    }
    var circle = mkEl('div', {
      style: 'width:' + s + ';height:' + s + ';border-radius:50%;background:#00e054;color:#14181c;' +
             'display:flex;align-items:center;justify-content:center;' +
             'font-size:' + Math.round(size * 0.45) + 'px;font-weight:700;flex-shrink:0;',
    });
    circle.textContent = (name || '?').charAt(0).toUpperCase();
    return circle;
  }

  // Fallback cookie : form submit (navigation top-level → cookies SameSite=Lax inclus)
  function submitFromBrowser(filmId, csrf, date, rating) {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://letterboxd.com/s/save-diary-entry';
    form.style.display = 'none';
    var fields = { '__csrf': csrf || '', 'filmId': String(filmId), 'specifiedDate': 'on', 'viewingDateStr': date, 'rating': String(rating) };
    Object.keys(fields).forEach(function (k) {
      var inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = k; inp.value = fields[k];
      form.appendChild(inp);
    });
    var winRef = null;
    try { winRef = window.open('about:blank', '_lb_diary_submit', 'width=1,height=1,left=0,top=0'); form.target = '_lb_diary_submit'; }
    catch (e) { form.target = '_blank'; }
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
    if (winRef) setTimeout(function () { try { winRef.close(); } catch (e) {} }, 1500);
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();

(function () {
  'use strict';

  var SENTINEL   = 'jf-lb-prefs';   // classe sur l'item injecté
  var MODAL_ID   = 'jf-lb-modal';
  var _origFetch = window.fetch.bind(window);

  // ── Auth (même helper que user-stats) ────────────────────────────────────
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

  // ── Injection de l'item dans /mypreferencesmenu ───────────────────────────
  function injectMenuItem() {
    if (document.querySelector('.' + SENTINEL)) return; // déjà là

    // Attendre qu'un item natif soit rendu (ex: lien "Affichage")
    var knownItem = document.querySelector(
      '.lnkDisplayPreferences, .lnkUserProfile, .lnkHomePreferences'
    );
    if (!knownItem) { setTimeout(injectMenuItem, 250); return; }

    var auth = getAuth();
    if (!auth) { setTimeout(injectMenuItem, 250); return; }

    var container = knownItem.parentNode;
    if (!container) return;

    // Créer l'item — copie exacte du style Jellyfin
    var a = document.createElement('a');
    a.className = SENTINEL + ' listItem-border';
    a.href = '#';
    a.style.cssText = 'display:block;margin:0;padding:0;';
    a.innerHTML =
      '<div class="listItem">' +
        '<span class="material-icons listItemIcon listItemIcon-transparent" aria-hidden="true">' +
          'movie' +
        '</span>' +
        '<div class="listItemBody">' +
          '<div class="listItemBodyText">Letterboxd</div>' +
        '</div>' +
      '</div>';

    a.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openSettingsModal(auth.userId);
    });

    container.appendChild(a);
  }

  // ── Modale paramètres Letterboxd ─────────────────────────────────────────
  function openSettingsModal(userId) {
    closeModal();

    var overlay = mkEl('div', {
      id: MODAL_ID,
      style: [
        'position:fixed', 'inset:0', 'z-index:99998',
        'background:rgba(0,0,0,.75)',
        'display:flex', 'align-items:center', 'justify-content:center',
      ].join(';'),
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var card = mkEl('div', {
      style: [
        'background:#1c1c1c', 'border-radius:10px',
        'padding:28px 32px', 'width:360px', 'max-width:92vw',
        'position:relative', 'color:#fff', 'font-family:inherit',
      ].join(';'),
    });

    // Header
    var hdr = mkEl('div', {
      style: 'display:flex;align-items:center;gap:10px;margin-bottom:20px;',
    });
    hdr.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="50" fill="#00C030"/>' +
        '<text x="50" y="67" text-anchor="middle" font-family="serif" ' +
              'font-size="52" font-weight="bold" fill="white">L</text>' +
      '</svg>' +
      '<span style="font-size:18px;font-weight:700;">Letterboxd</span>';

    var closeBtn = mkEl('button', {
      style: 'position:absolute;top:14px;right:16px;background:none;border:none;' +
             'color:#666;font-size:20px;cursor:pointer;line-height:1;padding:0;',
    });
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeModal;

    card.appendChild(closeBtn);
    card.appendChild(hdr);

    var body = mkEl('div');
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Charger le statut
    _origFetch('/JfLetterboxd/status?userId=' + userId)
      .then(function (r) { return r.json(); })
      .then(function (s) {
        renderModalBody(body, userId, s.connected, s.username || '');
      })
      .catch(function () {
        body.innerHTML = '<p style="color:#f55;font-size:14px">Erreur de connexion au plugin.</p>';
      });
  }

  function renderModalBody(body, userId, connected, lbUser) {
    body.innerHTML = '';

    if (connected) {
      // ── Connecté ──────────────────────────────────────────────────────────
      var infoDiv = mkEl('div', {
        style: 'display:flex;align-items:center;gap:10px;margin-bottom:20px;',
      });
      var badge = mkEl('span', {
        style: 'background:#00C030;color:#fff;border-radius:50%;width:36px;height:36px;' +
               'display:flex;align-items:center;justify-content:center;font-size:18px;' +
               'font-weight:700;flex-shrink:0;',
      });
      badge.textContent = lbUser.charAt(0).toUpperCase();

      var nameCol = mkEl('div');
      var label = mkEl('div', { style: 'font-size:12px;color:#888;' });
      label.textContent = 'Compte connecté';
      var name = mkEl('div', { style: 'font-size:16px;font-weight:600;color:#fff;' });
      name.textContent = lbUser;
      nameCol.appendChild(label);
      nameCol.appendChild(name);
      infoDiv.appendChild(badge);
      infoDiv.appendChild(nameCol);

      var hint = mkEl('p', { style: 'font-size:13px;color:#777;margin:0 0 20px;' });
      hint.textContent = 'Une fenêtre de notation apparaîtra automatiquement à la fin de chaque film.';

      var discBtn = mkEl('button', { style: dangerBtn() });
      discBtn.textContent = 'Déconnecter';
      discBtn.onclick = function () {
        discBtn.disabled = true;
        discBtn.textContent = 'Déconnexion…';
        _origFetch('/JfLetterboxd/disconnect?userId=' + userId, { method: 'DELETE' })
          .then(function () { renderModalBody(body, userId, false, ''); })
          .catch(function () { discBtn.disabled = false; discBtn.textContent = 'Déconnecter'; });
      };

      body.appendChild(infoDiv);
      body.appendChild(hint);
      body.appendChild(discBtn);

    } else {
      // ── Non connecté ─────────────────────────────────────────────────────
      var desc = mkEl('p', { style: 'font-size:14px;color:#aaa;margin:0 0 18px;' });
      desc.textContent = 'Connecte ton compte Letterboxd pour noter tes films à la fin de chaque visionnage.';
      body.appendChild(desc);

      var emailInp = formInput('email', 'Email Letterboxd');
      var passInp  = formInput('password', 'Mot de passe');
      body.appendChild(emailInp);
      body.appendChild(passInp);

      var row = mkEl('div', { style: 'display:flex;align-items:center;gap:10px;margin-top:4px;' });
      var btn = mkEl('button', { style: primaryBtn() });
      btn.textContent = 'Se connecter';
      var errSpan = mkEl('span', { style: 'color:#f55;font-size:13px;' });
      row.appendChild(btn);
      row.appendChild(errSpan);
      body.appendChild(row);

      function doLogin() {
        var email = emailInp.value.trim();
        var pass  = passInp.value;
        if (!email) { errSpan.textContent = 'Email requis.'; return; }
        btn.disabled = true;
        btn.textContent = 'Connexion…';
        errSpan.textContent = '';

        _origFetch('/JfLetterboxd/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId, email: email, password: pass }),
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.success) {
              renderModalBody(body, userId, true, res.username || email.split('@')[0]);
              // Mettre à jour le texte de l'item si visible
              var it = document.querySelector('.' + SENTINEL + ' .listItemBodyText');
              if (it) it.textContent = 'Letterboxd · ' + (res.username || '');
            } else {
              errSpan.textContent = res.error || 'Identifiants incorrects.';
              btn.disabled = false;
              btn.textContent = 'Se connecter';
            }
          })
          .catch(function () {
            errSpan.textContent = 'Erreur réseau.';
            btn.disabled = false;
            btn.textContent = 'Se connecter';
          });
      }

      btn.onclick = doLogin;
      [emailInp, passInp].forEach(function (i) {
        i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
      });
    }
  }

  function closeModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  // ── Modal de notation fin de film ─────────────────────────────────────────

  // Wrapper fetch pour détecter la fin d'un film
  window.fetch = function (url, options) {
    var p = _origFetch(url, options);
    try {
      if (typeof url === 'string' && options && (options.method || '').toUpperCase() === 'POST') {
        var m = url.match(/\/Users\/([^/?#]+)\/PlayedItems\/([^/?#]+)/);
        if (m) {
          (function (uid, itemId) {
            p.then(function () { onItemPlayed(uid, itemId); }).catch(function () {});
          })(m[1], m[2]);
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
              showRatingModal(userId, item, s.connected, s.username || '');
            }, 1200);
          })
          .catch(function () {});
      })
      .catch(function () {});
  }

  function showRatingModal(userId, item, connected, lbUser) {
    if (document.getElementById(MODAL_ID)) return;

    var title  = item.Name || 'Film';
    var year   = item.ProductionYear || '';
    var tmdbId = (item.ProviderIds && item.ProviderIds.Tmdb) || '';
    var imdbId = (item.ProviderIds && item.ProviderIds.Imdb) || '';

    var overlay = mkEl('div', {
      id: MODAL_ID,
      style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.8);' +
             'display:flex;align-items:center;justify-content:center;font-family:inherit;',
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    var card = mkEl('div', {
      style: 'background:#1c1c1c;border-radius:12px;padding:28px 32px;' +
             'max-width:380px;width:92%;text-align:center;' +
             'box-shadow:0 20px 60px rgba(0,0,0,.8);position:relative;color:#fff;',
    });

    var xBtn = mkEl('button', {
      style: 'position:absolute;top:12px;right:14px;background:none;border:none;' +
             'color:#666;font-size:20px;cursor:pointer;line-height:1;padding:0;',
    });
    xBtn.textContent = '✕';
    xBtn.onclick = function () { overlay.remove(); };

    var logoWrap = mkEl('div', { style: 'margin-bottom:12px' });
    logoWrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="50" fill="#00C030"/>' +
        '<text x="50" y="67" text-anchor="middle" font-family="serif" ' +
              'font-size="52" font-weight="bold" fill="white">L</text>' +
      '</svg>';

    var htitle = mkEl('h3', { style: 'margin:0 0 2px;font-size:17px;font-weight:700;' });
    htitle.textContent = title;
    var sub = mkEl('p', { style: 'margin:0 0 18px;font-size:13px;color:#888;' });
    sub.textContent = year ? String(year) : '';

    card.appendChild(xBtn);
    card.appendChild(logoWrap);
    card.appendChild(htitle);
    card.appendChild(sub);

    if (!connected) {
      buildRatingConnectUI(card, overlay, userId, item, tmdbId, imdbId);
    } else {
      buildStarRatingUI(card, overlay, userId, lbUser, tmdbId, imdbId, title, year);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function buildRatingConnectUI(card, overlay, userId, item, tmdbId, imdbId) {
    var desc = mkEl('p', { style: 'color:#bbb;font-size:14px;margin:0 0 16px' });
    desc.textContent = 'Connecte ton compte Letterboxd pour noter ce film.';

    var emailInp = formInput('email', 'Email');
    var passInp  = formInput('password', 'Mot de passe');
    emailInp.style.marginBottom = '8px';
    passInp.style.marginBottom  = '12px';

    var btn = mkEl('button', { style: primaryBtn() });
    btn.textContent = 'Se connecter';

    var skip = mkEl('button', {
      style: 'background:none;border:none;color:#666;font-size:13px;cursor:pointer;' +
             'display:block;width:100%;margin-top:8px;',
    });
    skip.textContent = 'Passer';
    skip.onclick = function () { overlay.remove(); };

    var err = mkEl('p', { style: 'color:#f55;font-size:13px;margin:10px 0 0;' });

    function doLogin() {
      var email = emailInp.value.trim();
      var pass  = passInp.value;
      if (!email) { err.textContent = 'Email requis.'; return; }
      btn.disabled = true; btn.textContent = 'Connexion…'; err.textContent = '';
      _origFetch('/JfLetterboxd/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, email: email, password: pass }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            overlay.remove();
            showRatingModal(userId, item, true, res.username || email.split('@')[0]);
          } else {
            err.textContent = res.error || 'Identifiants incorrects.';
            btn.disabled = false; btn.textContent = 'Se connecter';
          }
        })
        .catch(function () {
          err.textContent = 'Erreur réseau.';
          btn.disabled = false; btn.textContent = 'Se connecter';
        });
    }
    btn.onclick = doLogin;
    [emailInp, passInp].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    });

    [desc, emailInp, passInp, btn, skip, err].forEach(function (n) { card.appendChild(n); });
  }

  function buildStarRatingUI(card, overlay, userId, lbUser, tmdbId, imdbId, title, year) {
    var who = mkEl('p', { style: 'font-size:13px;color:#888;margin:0 0 16px;' });
    who.innerHTML = 'Connecté · <span style="color:#00C030;font-weight:600;">' + esc(lbUser) + '</span>';

    var cur = 0;
    var starsRow = mkEl('div', {
      style: 'display:flex;justify-content:center;gap:6px;font-size:38px;cursor:pointer;user-select:none;',
    });
    var starEls = [];
    for (var i = 1; i <= 5; i++) {
      (function (v) {
        var s = mkEl('span', { style: 'color:#333;transition:color .1s;' });
        s.textContent = '★';
        s.addEventListener('mouseenter', function () { paint(v); });
        s.addEventListener('mouseleave', function () { paint(cur); });
        s.addEventListener('click', function () {
          cur = (cur === v) ? 0 : v;
          paint(cur);
          lbl.textContent = cur ? cur + (cur > 1 ? ' étoiles' : ' étoile') : 'Sans note';
        });
        starsRow.appendChild(s);
        starEls.push(s);
      })(i);
    }

    function paint(n) {
      starEls.forEach(function (s, i) { s.style.color = i < n ? '#FFB800' : '#333'; });
    }

    var lbl = mkEl('p', { style: 'color:#777;font-size:13px;margin:8px 0 18px;' });
    lbl.textContent = 'Sans note';

    var row = mkEl('div', { style: 'display:flex;gap:8px;' });
    var logBtn = mkEl('button', { style: primaryBtn() + 'flex:1;' });
    logBtn.textContent = 'Enregistrer';
    var skipBtn = mkEl('button', { style: 'background:#2a2a2a;color:#aaa;border:none;border-radius:6px;padding:10px 16px;cursor:pointer;font-size:14px;' });
    skipBtn.textContent = 'Passer';
    skipBtn.onclick = function () { overlay.remove(); };

    var msg = mkEl('p', { style: 'font-size:13px;margin:12px 0 0;min-height:18px;' });

    logBtn.onclick = function () {
      logBtn.disabled = true; logBtn.textContent = 'Enregistrement…'; msg.textContent = '';
      _origFetch('/JfLetterboxd/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, tmdbId: tmdbId, imdbId: imdbId,
                               title: title, year: year ? parseInt(year) : null, rating: cur }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            msg.style.color = '#00C030'; msg.textContent = '✓ Enregistré sur Letterboxd !';
            setTimeout(function () { overlay.remove(); }, 2000);
          } else {
            msg.style.color = '#f55'; msg.textContent = res.error || 'Erreur.';
            logBtn.disabled = false; logBtn.textContent = 'Enregistrer';
          }
        })
        .catch(function () {
          msg.style.color = '#f55'; msg.textContent = 'Erreur réseau.';
          logBtn.disabled = false; logBtn.textContent = 'Enregistrer';
        });
    };

    row.appendChild(logBtn);
    row.appendChild(skipBtn);
    [who, starsRow, lbl, row, msg].forEach(function (n) { card.appendChild(n); });
  }

  // ── Routage ───────────────────────────────────────────────────────────────
  function check() {
    var h = window.location.hash;
    if (h.indexOf('/mypreferencesmenu') !== -1) {
      injectMenuItem();
    } else {
      // Réinitialiser la sentinelle quand on quitte la page
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

  // ── Helpers DOM ───────────────────────────────────────────────────────────
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
    i.style.cssText = [
      'display:block', 'width:100%', 'box-sizing:border-box',
      'padding:9px 12px', 'margin-bottom:8px',
      'border-radius:6px', 'border:1px solid #333',
      'background:#111', 'color:#fff', 'font-size:14px',
    ].join(';');
    return i;
  }

  function primaryBtn() {
    return 'background:#00C030;color:#fff;border:none;border-radius:6px;' +
           'padding:10px 0;font-size:14px;font-weight:600;cursor:pointer;width:100%;';
  }

  function dangerBtn() {
    return 'background:#c0392b;color:#fff;border:none;border-radius:6px;' +
           'padding:9px 20px;font-size:14px;cursor:pointer;';
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();

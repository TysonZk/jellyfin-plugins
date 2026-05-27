(function () {
  'use strict';

  var MODAL_ID = 'jf-lb-modal';

  // ── Intercepte fetch pour détecter la fin d'un film ──────────────────────
  var _origFetch = window.fetch.bind(window);
  window.fetch = function (url, options) {
    var p = _origFetch(url, options);
    try {
      if (typeof url === 'string' && options && (options.method || '').toUpperCase() === 'POST') {
        var m = url.match(/\/Users\/([^/?#]+)\/PlayedItems\/([^/?#]+)/);
        if (m) {
          var userId = m[1], itemId = m[2];
          p.then(function () { onItemPlayed(userId, itemId); }).catch(function () {});
        }
      }
    } catch (_) {}
    return p;
  };

  function onItemPlayed(userId, itemId) {
    // Récupérer les infos de l'item via l'API Jellyfin
    _origFetch('/Items/' + itemId + '?userId=' + userId)
      .then(function (r) { return r.json(); })
      .then(function (item) {
        if (item.Type !== 'Movie') return; // seulement les films
        _origFetch('/JfLetterboxd/status?userId=' + userId)
          .then(function (r) { return r.json(); })
          .then(function (status) {
            // Petit délai pour laisser Jellyfin naviguer hors du player
            setTimeout(function () {
              showModal(userId, item, status.connected, status.username || '');
            }, 1200);
          })
          .catch(function () {});
      })
      .catch(function () {});
  }

  // ── Modal principal ───────────────────────────────────────────────────────
  function showModal(userId, item, connected, lbUser) {
    if (document.getElementById(MODAL_ID)) return; // déjà ouvert

    var title  = item.Name || 'Film';
    var year   = item.ProductionYear || '';
    var tmdbId = (item.ProviderIds && item.ProviderIds.Tmdb)  || '';
    var imdbId = (item.ProviderIds && item.ProviderIds.Imdb)  || '';

    // Overlay
    var overlay = el('div', {
      id: MODAL_ID,
      style: [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,.82)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-family:sans-serif',
      ].join(';'),
    });

    // Carte
    var card = el('div', {
      style: [
        'background:#141414', 'border-radius:14px', 'padding:28px 32px',
        'max-width:400px', 'width:92%', 'text-align:center',
        'box-shadow:0 24px 64px rgba(0,0,0,.9)',
        'position:relative', 'color:#fff',
      ].join(';'),
    });

    // Bouton ✕
    var closeBtn = el('button', {
      style: 'position:absolute;top:12px;right:14px;background:none;border:none;' +
             'color:#666;font-size:20px;cursor:pointer;line-height:1;',
    });
    closeBtn.textContent = '✕';
    closeBtn.onclick = function () { overlay.remove(); };

    // Logo Letterboxd (SVG inline — couleur verte officielle)
    var logoWrap = el('div', { style: 'margin-bottom:14px' });
    logoWrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="50" fill="#00C030"/>' +
        '<text x="50" y="68" text-anchor="middle" font-family="serif" font-size="52" ' +
              'font-weight="bold" fill="white">L</text>' +
      '</svg>';

    // Titre film
    var h = el('h3', {
      style: 'margin:0 0 2px;font-size:17px;font-weight:700;color:#fff',
    });
    h.textContent = title;

    var sub = el('p', { style: 'margin:0 0 20px;font-size:13px;color:#888' });
    sub.textContent = year ? String(year) : '';

    card.appendChild(closeBtn);
    card.appendChild(logoWrap);
    card.appendChild(h);
    card.appendChild(sub);

    if (!connected) {
      buildConnectUI(card, overlay, userId, item, tmdbId, imdbId);
    } else {
      buildRatingUI(card, overlay, userId, lbUser, tmdbId, imdbId, title, year);
    }

    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // ── UI connexion ──────────────────────────────────────────────────────────
  function buildConnectUI(card, overlay, userId, item, tmdbId, imdbId) {
    var desc = el('p', { style: 'color:#bbb;font-size:14px;margin:0 0 16px' });
    desc.textContent = 'Connecte ton compte Letterboxd pour noter ce film.';

    var emailInput = el('input', {
      type: 'email', placeholder: 'Email Letterboxd',
      style: inputStyle(),
    });
    var passInput = el('input', {
      type: 'password', placeholder: 'Mot de passe',
      style: inputStyle() + 'margin-bottom:14px;',
    });
    var connectBtn = el('button', { style: btnStyle('#00C030') });
    connectBtn.textContent = 'Se connecter';

    var skipBtn = el('button', {
      style: 'background:none;border:none;color:#666;font-size:13px;' +
             'cursor:pointer;margin-top:6px;display:block;width:100%',
    });
    skipBtn.textContent = 'Passer';
    skipBtn.onclick = function () { overlay.remove(); };

    var errTxt = el('p', { style: 'color:#f55;font-size:13px;margin:10px 0 0' });

    connectBtn.onclick = function () {
      var email = emailInput.value.trim();
      var pass  = passInput.value;
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
    };

    // Autoriser Entrée dans les champs
    [emailInput, passInput].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') connectBtn.click();
      });
    });

    [desc, emailInput, passInput, connectBtn, skipBtn, errTxt].forEach(function (n) {
      card.appendChild(n);
    });
  }

  // ── UI notation ───────────────────────────────────────────────────────────
  function buildRatingUI(card, overlay, userId, lbUser, tmdbId, imdbId, title, year) {
    var userLine = el('p', { style: 'font-size:13px;color:#888;margin:0 0 18px' });
    userLine.innerHTML =
      'Connecté · <span style="color:#00C030;font-weight:600">' + esc(lbUser) + '</span>';

    // Étoiles ★ (1–5, clic = toggle)
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
        s.addEventListener('mouseenter', function () { highlightStars(val); });
        s.addEventListener('mouseleave', function () { highlightStars(currentRating); });
        s.addEventListener('click', function () {
          currentRating = (currentRating === val) ? 0 : val;
          highlightStars(currentRating);
          ratingLabel.textContent = ratingText(currentRating);
        });
        starsWrap.appendChild(s);
        starEls.push(s);
      })(i);
    }

    function highlightStars(n) {
      starEls.forEach(function (s, i) {
        s.style.color = (i < n) ? '#FFB800' : '#333';
      });
    }

    var ratingLabel = el('p', { style: 'color:#777;font-size:13px;margin:8px 0 20px' });
    ratingLabel.textContent = 'Pas de note';

    // Boutons Log / Passer
    var row = el('div', { style: 'display:flex;gap:8px' });

    var logBtn = el('button', { style: btnStyle('#00C030') + 'flex:1;' });
    logBtn.textContent = 'Enregistrer';

    var skipBtn = el('button', {
      style: btnStyle('#2a2a2a') + 'padding:10px 18px;color:#aaa;',
    });
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
            msg.textContent = res.error || 'Erreur lors de l\'enregistrement.';
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

    [userLine, starsWrap, ratingLabel, row, msg].forEach(function (n) {
      card.appendChild(n);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function el(tag, attrs) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') node.style.cssText = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inputStyle() {
    return [
      'display:block', 'width:100%', 'box-sizing:border-box',
      'padding:10px 12px', 'margin-bottom:8px',
      'border-radius:7px', 'border:1px solid #333',
      'background:#0e0e0e', 'color:#fff', 'font-size:14px',
    ].join(';') + ';';
  }

  function btnStyle(bg) {
    return [
      'background:' + bg, 'color:#fff', 'border:none',
      'border-radius:7px', 'padding:10px 0', 'font-size:15px',
      'cursor:pointer', 'width:100%', 'font-weight:600',
    ].join(';') + ';';
  }

  function ratingText(n) {
    if (n === 0) return 'Pas de note';
    return n + ' étoile' + (n > 1 ? 's' : '');
  }
})();

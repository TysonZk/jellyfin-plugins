(function () {
  'use strict';

  var cfg = window._JF_DISCORD || {};
  if (!cfg.show || !cfg.url) return;

  var SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="currentColor" width="14" height="14"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';

  function makeButton() {
    var a = document.createElement('a');
    a.id        = 'jf-discord-btn';
    a.href      = cfg.url;
    a.target    = cfg.newTab ? '_blank' : '_self';
    a.rel       = 'noopener noreferrer';
    a.title     = cfg.tooltip || 'Discord';
    a.setAttribute('aria-label', a.title);
    a.className = 'headerButton headerButtonRight';
    a.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
      + 'width:24px;height:24px;border-radius:50%;background:#5865F2;color:#fff;'
      + 'text-decoration:none;cursor:pointer;flex-shrink:0;'
      + 'transition:background .15s;margin:0 3px;vertical-align:middle;border:none;padding:4px;';
    a.innerHTML = SVG;
    a.addEventListener('mouseenter', function () { a.style.background = '#4752C4'; });
    a.addEventListener('mouseleave', function () { a.style.background = '#5865F2'; });
    return a;
  }

  function inject() {
    if (document.getElementById('jf-discord-btn')) return true;

    var ref = document.querySelector('.headerSyncButton')
           || document.querySelector('.headerRight > :first-child')
           || document.querySelector('.skinHeader .headerButton');

    if (ref && ref.parentNode) {
      ref.parentNode.insertBefore(makeButton(), ref);
      return true;
    }

    var hr = document.querySelector('.headerRight');
    if (hr) { hr.insertBefore(makeButton(), hr.firstChild); return true; }

    return false;
  }

  // ── Boucle persistante ──────────────────────────────────────────────────────
  // Tourne toutes les 300 ms.
  // - Tant que le bouton n'est pas dans le DOM : on injecte.
  // - Dès qu'il est stable 3 s (10 ticks) : on ralentit à 2 s.
  // - Après 60 s au total sans succès : on abandonne.
  var _iv = null;
  var _ticks = 0;
  var _stableTicks = 0;
  var _fast = true;

  function tick() {
    _ticks++;

    var present = !!document.getElementById('jf-discord-btn');
    if (!present) {
      inject();
      _stableTicks = 0;
    } else {
      _stableTicks++;
    }

    // Passe en mode lent (2 s) une fois stable
    if (_fast && _stableTicks >= 10) {
      _fast = false;
      clearInterval(_iv);
      _iv = setInterval(tick, 2000);
      return;
    }

    // Abandonne si plus de 60 s sans succès
    if (_fast && _ticks > 200) {
      clearInterval(_iv);
      _iv = null;
    }
  }

  function startLoop() {
    clearInterval(_iv);
    _ticks = 0; _stableTicks = 0; _fast = true;
    var old = document.getElementById('jf-discord-btn');
    if (old) old.remove();
    _iv = setInterval(tick, 300);
  }

  window.addEventListener('hashchange', startLoop);
  startLoop();
})();

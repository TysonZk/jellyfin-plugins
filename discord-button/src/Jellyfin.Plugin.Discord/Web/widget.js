(function () {
  'use strict';

  // Config injectée par le serveur dans window._JF_DISCORD
  var cfg = window._JF_DISCORD || {};
  if (!cfg.show || !cfg.url) return;

  var DISCORD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="currentColor" width="16" height="16"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';

  function makeButton() {
    var btn = document.createElement('a');
    btn.id        = 'jf-discord-btn';
    btn.href      = cfg.url;
    btn.target    = cfg.newTab ? '_blank' : '_self';
    btn.rel       = 'noopener noreferrer';
    btn.title     = cfg.tooltip || 'Discord';
    btn.setAttribute('aria-label', btn.title);
    btn.className = 'headerButton headerButtonRight';
    btn.style.cssText = [
      'display:inline-flex', 'align-items:center', 'justify-content:center',
      'width:28px', 'height:28px', 'border-radius:50%',
      'background:#5865F2', 'color:#fff', 'text-decoration:none',
      'cursor:pointer', 'flex-shrink:0', 'transition:background .15s',
      'margin:0 2px', 'vertical-align:middle', 'border:none', 'padding:5px',
    ].join(';');
    btn.innerHTML = DISCORD_SVG;
    btn.addEventListener('mouseenter', function () { btn.style.background = '#4752C4'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = '#5865F2'; });
    return btn;
  }

  function inject() {
    if (document.getElementById('jf-discord-btn')) return true;

    var syncBtn = document.querySelector('.headerSyncButton');
    if (syncBtn && syncBtn.parentNode) {
      syncBtn.parentNode.insertBefore(makeButton(), syncBtn);
      return true;
    }
    var hr = document.querySelector('.headerRight');
    if (hr) {
      hr.insertBefore(makeButton(), hr.firstChild);
      return true;
    }
    var hb = document.querySelector('.skinHeader .headerButton');
    if (hb && hb.parentNode) {
      hb.parentNode.insertBefore(makeButton(), hb);
      return true;
    }
    return false;
  }

  // Retry toutes les 300 ms jusqu'au succès (max 30 s)
  var _iv = null;
  function startLoop() {
    if (_iv) { clearInterval(_iv); }
    var n = 0;
    _iv = setInterval(function () {
      if (inject() || ++n > 100) { clearInterval(_iv); _iv = null; }
    }, 300);
  }

  window.addEventListener('hashchange', function () {
    var old = document.getElementById('jf-discord-btn');
    if (old) old.remove();
    startLoop();
  });

  startLoop();
})();

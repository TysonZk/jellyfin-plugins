(function () {
  'use strict';

  var cfg = window._JF_DISCORD || {};

  var SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="currentColor" width="16" height="16"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';

  var btn = null;

  function createBtn() {
    var a = document.createElement('a');
    a.id = 'jf-discord-btn';
    a.href = cfg.url || 'javascript:void(0)';
    if (cfg.newTab) { a.target = '_blank'; }
    a.rel = 'noopener noreferrer';
    a.title = cfg.label || 'Discord';
    a.setAttribute('aria-label', cfg.label || 'Discord');
    a.innerHTML = SVG;
    a.style.cssText = [
      'width:36px', 'height:36px', 'border-radius:50%',
      'background:#5865F2', 'color:#fff',
      'display:none', 'align-items:center', 'justify-content:center',
      'cursor:pointer', 'text-decoration:none', 'border:none',
      'box-shadow:0 1px 4px rgba(0,0,0,.5)',
      'flex-shrink:0', 'margin:0 4px',
      'opacity:0', 'transition:opacity .25s ease'
    ].join(';');
    a.addEventListener('mouseenter', function () { a.style.background = '#4752C4'; });
    a.addEventListener('mouseleave', function () { a.style.background = '#5865F2'; });
    return a;
  }

  function attachToHeader() {
    var headerRight = document.querySelector('.headerRight');
    if (!headerRight) { setTimeout(attachToHeader, 200); return; }
    if (document.getElementById('jf-discord-btn')) return;
    btn = createBtn();
    headerRight.insertBefore(btn, headerRight.firstChild);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { btn.style.opacity = '1'; });
    });
    updateVisibility();
  }

  function updateVisibility() {
    if (!btn) return;
    if (!cfg.show) { btn.style.display = 'none'; return; }
    var onHome = window.location.hash === '#/home' || window.location.hash === '' || window.location.hash === '#';
    var inPlayer = !!document.querySelector('.videoPlayerContainer, .htmlVideoPlayer, .OSD');
    btn.style.display = (onHome && !inPlayer) ? 'flex' : 'none';
  }

  window.addEventListener('hashchange', updateVisibility);

  var _t = null;
  var obs = new MutationObserver(function () {
    clearTimeout(_t);
    _t = setTimeout(function () {
      if (!document.getElementById('jf-discord-btn')) { attachToHeader(); }
      else { updateVisibility(); }
    }, 100);
  });

  function init() {
    obs.observe(document.body, { childList: true, subtree: true });
    attachToHeader();
  }

  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();

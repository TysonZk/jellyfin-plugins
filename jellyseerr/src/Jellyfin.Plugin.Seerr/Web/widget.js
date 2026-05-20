(function () {
  'use strict';

  var cfg = window._JF_SEERR || {};

  var SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';

  var btn = null;

  function createBtn() {
    var a = document.createElement('a');
    a.id = 'jf-seerr-btn';
    a.href = cfg.url || 'javascript:void(0)';
    if (cfg.newTab) { a.target = '_blank'; }
    a.rel = 'noopener noreferrer';
    a.title = cfg.label || 'Demandes';
    a.setAttribute('aria-label', cfg.label || 'Demandes');
    a.innerHTML = SVG;
    a.style.cssText = [
      'width:36px', 'height:36px', 'border-radius:50%',
      'background:#E5A00D', 'color:#fff',
      'display:none', 'align-items:center', 'justify-content:center',
      'cursor:pointer', 'text-decoration:none', 'border:none',
      'box-shadow:0 1px 4px rgba(0,0,0,.5)',
      'flex-shrink:0', 'margin:0 4px',
      'opacity:0', 'transition:opacity .25s ease'
    ].join(';');
    a.addEventListener('mouseenter', function () { a.style.background = '#C77E0B'; });
    a.addEventListener('mouseleave', function () { a.style.background = '#E5A00D'; });
    return a;
  }

  function attachToHeader() {
    var headerRight = document.querySelector('.headerRight');
    if (!headerRight) { setTimeout(attachToHeader, 200); return; }
    if (document.getElementById('jf-seerr-btn')) return;
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
      if (!document.getElementById('jf-seerr-btn')) { attachToHeader(); }
      else { updateVisibility(); }
    }, 100);
  });

  function init() {
    obs.observe(document.body, { childList: true, subtree: true });
    attachToHeader();
  }

  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();

(function () {
  'use strict';

  var cfg = window._JF_DISCORD || {};
  var btn = document.getElementById('jf-discord-btn');
  if (!btn) return;

  if (!cfg.show || !cfg.url) {
    btn.style.display = 'none';
    return;
  }

  btn.href   = cfg.url;
  btn.title  = cfg.tooltip || 'Discord';
  btn.setAttribute('aria-label', btn.title);
  btn.target = cfg.newTab ? '_blank' : '_self';
  btn.style.display = 'flex';

  btn.addEventListener('mouseenter', function () { btn.style.background = '#4752C4'; });
  btn.addEventListener('mouseleave', function () { btn.style.background = '#5865F2'; });
})();

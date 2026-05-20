(function () {
  'use strict';

  var cfg = window._JF_SEERR || {};
  var btn = document.getElementById('jf-seerr-btn');
  if (!btn) return;

  if (cfg.url) { btn.href = cfg.url; }

  btn.addEventListener('mouseenter', function () { btn.style.background = '#C77E0B'; });
  btn.addEventListener('mouseleave', function () { btn.style.background = '#E5A00D'; });

  function reveal() { btn.style.opacity = '1'; }
  if (document.readyState === 'complete') { reveal(); }
  else { window.addEventListener('load', reveal); }

  function updateVisibility() {
    if (!cfg.show) { btn.style.display = 'none'; return; }
    var inPlayer = !!document.querySelector('.videoPlayerContainer, .htmlVideoPlayer, .OSD');
    btn.style.display = inPlayer ? 'none' : 'flex';
  }

  window.addEventListener('hashchange', updateVisibility);

  var _t = null;
  var obs = new MutationObserver(function () {
    clearTimeout(_t);
    _t = setTimeout(updateVisibility, 100);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  updateVisibility();
})();

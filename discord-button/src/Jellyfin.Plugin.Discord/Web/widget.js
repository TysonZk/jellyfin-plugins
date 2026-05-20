(function () {
  'use strict';
  var btn = document.getElementById('jf-discord-btn');
  if (!btn) return;

  btn.addEventListener('mouseenter', function () { btn.style.background = '#4752C4'; });
  btn.addEventListener('mouseleave', function () { btn.style.background = '#5865F2'; });

  // Reveal only after the app has finished loading
  function show() { btn.style.opacity = '1'; }
  if (document.readyState === 'complete') {
    show();
  } else {
    window.addEventListener('load', show);
  }

  // Show only on #/home and hide during video playback
  function updateVisibility() {
    var onHome = window.location.hash === '#/home' || window.location.hash === '' || window.location.hash === '#';
    var inPlayer = !!document.querySelector('.videoPlayerContainer, .htmlVideoPlayer, video.videoPlayerContainer, .OSD');
    btn.style.display = (onHome && !inPlayer) ? 'flex' : 'none';
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

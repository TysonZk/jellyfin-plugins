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
})();

(function () {
  'use strict';

  var cfg = window._JF_SEERR || {};

  function makeSection() {
    var sec = document.createElement('div');
    sec.className = 'jf-seerr-section verticalSection';

    var titleDiv = document.createElement('div');
    titleDiv.className = 'sectionTitleContainer flex align-items-center';
    var h2 = document.createElement('h2');
    h2.className = 'sectionTitle';
    h2.textContent = cfg.label || 'Demandes';
    titleDiv.appendChild(h2);
    sec.appendChild(titleDiv);

    if (cfg.desc) {
      var p = document.createElement('p');
      p.style.cssText = 'color:#aaa;font-size:13px;margin:4px 0 16px';
      p.textContent = cfg.desc;
      sec.appendChild(p);
    }

    var a = document.createElement('a');
    a.href = cfg.url || '#';
    if (cfg.newTab) { a.target = '_blank'; }
    a.rel = 'noopener noreferrer';
    a.className = 'raised emby-button';
    a.style.cssText = 'display:inline-flex;align-items:center;gap:8px;text-decoration:none;padding:10px 20px;margin-top:8px';
    a.textContent = cfg.label || 'Demandes';
    sec.appendChild(a);

    return sec;
  }

  var _tries = 0;

  function inject() {
    if (!cfg.show || !cfg.url) return;
    if (document.querySelector('.jf-seerr-section')) return;

    var anchor = document.querySelector('h2.sectionTitle.headerUsername');
    if (!anchor && _tries < 24) {
      _tries++;
      setTimeout(inject, 250);
      return;
    }

    var container = document.querySelector('.content-primary');
    if (!container) return;

    var sections = container.querySelectorAll('.verticalSection');
    var last = sections.length ? sections[sections.length - 1] : null;
    var sec = makeSection();

    if (last) {
      last.parentNode.insertBefore(sec, last.nextSibling);
    } else {
      container.appendChild(sec);
    }
  }

  function check() {
    var h = window.location.hash;
    if (h.indexOf('/mypreferencesmenu') !== -1) {
      _tries = 0;
      inject();
    } else {
      var el = document.querySelector('.jf-seerr-section');
      if (el) { el.remove(); }
    }
  }

  window.addEventListener('hashchange', check);

  var _t = null;
  var obs = new MutationObserver(function () {
    clearTimeout(_t);
    _t = setTimeout(check, 200);
  });

  function init() {
    obs.observe(document.body, { childList: true, subtree: true });
    check();
  }

  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();

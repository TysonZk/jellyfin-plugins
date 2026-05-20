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
  var _injecting = false;

  function inject() {
    if (!cfg.show || !cfg.url) return;
    if (document.querySelector('.jf-seerr-section')) return;
    if (_injecting) return;

    var header = document.querySelector('h2.sectionTitle.headerUsername');
    if (!header && _tries < 24) {
      _tries++;
      setTimeout(inject, 250);
      return;
    }
    if (!header) return;

    _injecting = true;

    // Climb up from the h2 to find the main content container
    var container = header.closest('.content-primary') ||
                    header.parentNode.parentNode.parentNode;

    if (!container) { _injecting = false; return; }

    // Find the save button area to insert before it, or just append
    var saveBtn = container.querySelector('button[type="submit"]');
    var sec = makeSection();

    if (saveBtn && saveBtn.parentNode && saveBtn.parentNode.parentNode === container) {
      container.insertBefore(sec, saveBtn.parentNode);
    } else if (saveBtn && saveBtn.parentNode) {
      // saveBtn is deeper — insert the section before the nearest ancestor that is a direct child of container
      var el = saveBtn;
      while (el.parentNode && el.parentNode !== container) { el = el.parentNode; }
      if (el.parentNode === container) {
        container.insertBefore(sec, el);
      } else {
        container.appendChild(sec);
      }
    } else {
      container.appendChild(sec);
    }

    _injecting = false;
  }

  function check() {
    var h = window.location.hash;
    if (h.indexOf('/mypreferencesmenu') !== -1) {
      if (!document.querySelector('.jf-seerr-section')) {
        _tries = 0;
        inject();
      }
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

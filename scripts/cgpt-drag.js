(function () {
  const helper = window.cgptNoteHelper || {};
  const PANEL_ID = (helper && helper.PANEL_ID) || 'cgpt-note-panel';
  const POSITION_KEY = 'cgpt-note-helper::panel-position';

  function getStorage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return {
          get: (key) => new Promise((resolve) => {
            try {
              chrome.storage.local.get([key], (obj) => resolve(obj && obj[key]));
            } catch (e) { resolve(null); }
          }),
          set: (key, value) => new Promise((resolve) => {
            try {
              const data = {}; data[key] = value;
              chrome.storage.local.set(data, () => resolve());
            } catch (e) { resolve(); }
          })
        };
      }
    } catch (e) {}
    return {
      get: (key) => Promise.resolve(JSON.parse(localStorage.getItem(key) || 'null')),
      set: (key, value) => Promise.resolve(localStorage.setItem(key, JSON.stringify(value)))
    };
  }

  const storage = getStorage();

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function getPanel() {
    return document.getElementById(PANEL_ID);
  }

  async function applySavedPosition(panel) {
    const saved = await storage.get(POSITION_KEY);
    if (!panel || !saved || typeof saved.left !== 'number' || typeof saved.top !== 'number') {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    const left = clamp(saved.left, 8, vw - rect.width - 8);
    const top  = clamp(saved.top,  8, vh - rect.height - 8);

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
  }

  function makeDraggable(panel) {
    if (!panel || panel.dataset.dragEnabled === 'true') return;

    const header = panel.querySelector('.cgpt-note-header') || panel;
    header.style.cursor = 'grab';
    header.style.webkitUserSelect = 'none';
    header.style.userSelect = 'none';

    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;
    let dragging = false;

    function onPointerDown(ev) {
      try {
        const isLeftClick = (ev.button === 0 || ev.buttons === 1 || ev.type === 'touchstart');
        if (!isLeftClick) return;

        const rect = panel.getBoundingClientRect();
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        // If panel currently right-anchored, compute a left value from rect.
        if (!panel.style.left) {
          panel.style.left = Math.max(8, Math.min(vw - rect.width - 8, rect.left)) + 'px';
          panel.style.right = 'auto';
        }
        if (!panel.style.top) {
          panel.style.top = Math.max(8, Math.min(vh - rect.height - 8, rect.top)) + 'px';
        }

        dragging = true;
        header.style.cursor = 'grabbing';
        panel.classList.add('cgpt-note-dragging');

        startX = (ev.touches ? ev.touches[0].clientX : ev.clientX);
        startY = (ev.touches ? ev.touches[0].clientY : ev.clientY);
        origLeft = parseFloat(panel.style.left || rect.left);
        origTop  = parseFloat(panel.style.top  || rect.top);

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp, { passive: true });
        ev.preventDefault();
      } catch (e) {}
    }

    function onPointerMove(ev) {
      if (!dragging) return;
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;

      const dx = clientX - startX;
      const dy = clientY - startY;

      const rect = panel.getBoundingClientRect();
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

      const newLeft = clamp(origLeft + dx, 8, vw - rect.width - 8);
      const newTop  = clamp(origTop  + dy, 8, vh - rect.height - 8);

      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
      panel.style.right = 'auto';

      if (ev.cancelable) ev.preventDefault();
    }

    async function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = 'grab';
      panel.classList.remove('cgpt-note-dragging');

      const left = parseFloat(panel.style.left || '0') || 0;
      const top  = parseFloat(panel.style.top  || '0') || 0;
      await storage.set(POSITION_KEY, { left, top });
    }

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('touchstart', onPointerDown, { passive: true });

    window.addEventListener('resize', () => applySavedPosition(panel));
    panel.dataset.dragEnabled = 'true';
  }

  function init() {
    // If panel already exists, enhance immediately; otherwise observe for it.
    const panel = getPanel();
    if (panel) {
      makeDraggable(panel);
      applySavedPosition(panel);
      return;
    }

    const obs = new MutationObserver(() => {
      const p = getPanel();
      if (p) {
        makeDraggable(p);
        applySavedPosition(p);
        obs.disconnect();
      }
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
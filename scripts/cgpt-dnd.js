(function () {
  const helper = window.cgptNoteHelper;
  if (!helper || !helper.STATE) return;

  const LIST_SELECTORS = ['[data-role="note-list"]', '.cgpt-note-list', '.cgpt-notes-list', '.cgpt-notes'];
  const ITEM_SELECTORS = ['.cgpt-note-item', '.cgpt-note'];
  const DRAG_CLASS = 'dragging';
  const ANIM_MS = 180;
  const EASE = 'cubic-bezier(0.2, 0.0, 0.2, 1)';
  let _wrapped = false;
  let _rects = new Map(); // id -> DOMRect
  let _autoScrollRAF = 0;

  function findList(root) {
    for (const sel of LIST_SELECTORS) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function itemsOf(list) {
    let items = [];
    for (const sel of ITEM_SELECTORS) items = items.concat([...list.querySelectorAll(sel)]);
    return [...new Set(items)];
  }
  function getId(el) { return el.dataset.noteId || el.dataset.id || el.getAttribute('data-id') || el.id || ''; }

  function snapshotRects(list) {
    _rects.clear();
    for (const el of itemsOf(list)) {
      const id = getId(el);
      if (!id) continue;
      _rects.set(id, el.getBoundingClientRect());
    }
  }

  function playFlip(list) {
    const items = itemsOf(list);
    items.forEach(el => {
      const id = getId(el);
      if (!id || !_rects.has(id)) return;
      const first = _rects.get(id);
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.style.willChange = 'transform';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = 'none';
        // two RAFs to ensure the browser applies initial transform
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = `transform ${ANIM_MS}ms ${EASE}`;
            el.style.transform = 'translate(0, 0)';
          });
        });
        const clear = () => {
          el.style.transition = '';
          el.style.transform = '';
          el.style.willChange = '';
          el.removeEventListener('transitionend', clear);
        };
        el.addEventListener('transitionend', clear);
      }
    });
  }

  function enableDnd(list) {
    if (!list || list.dataset.dndEnabled === 'true') return;
    list.dataset.dndEnabled = 'true';
    list.addEventListener('dragover', onDragOver, { passive: false });
    list.addEventListener('drop', onDrop);
    list.addEventListener('dragenter', (e) => e.preventDefault());
    list.addEventListener('dragleave', () => stopAutoScroll());
    const mo = new MutationObserver(() => bindItems(list));
    mo.observe(list, { childList: true, subtree: true });
    list._dndObserver = mo;
    bindItems(list);
  }

  function bindItems(list) {
    itemsOf(list).forEach((el) => {
      if (el.hasAttribute('draggable')) return;
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', onDragStart);
      el.addEventListener('dragend', onDragEnd);
      el.style.cursor = el.style.cursor || 'grab';
    });
  }

  function onDragStart(e) {
    const el = e.currentTarget;
    el.classList.add(DRAG_CLASS);
    el.style.cursor = 'grabbing';
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.dropEffect = 'move';
      const img = document.createElement('canvas'); img.width = img.height = 1;
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch (_) {}
    // Snapshot before any movement
    const list = el.closest(findList(document) ? LIST_SELECTORS.join(',') : '*') || el.parentElement;
    if (list) snapshotRects(list);
  }

  function onDragEnd(e) {
    const el = e.currentTarget;
    el.classList.remove(DRAG_CLASS);
    el.style.cursor = 'grab';
    const list = el.closest(findList(document) ? LIST_SELECTORS.join(',') : '*') || el.parentElement;
    stopAutoScroll();
    if (!list) return;
    persistOrder(list);
  }

  function onDrop(e) {
    e.preventDefault();
    const list = e.currentTarget;
    stopAutoScroll();
    persistOrder(list);
  }

  function onDragOver(e) {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    const list = e.currentTarget;
    const dragging = list.querySelector('.' + DRAG_CLASS);
    if (!dragging) return;

    // Autoscroll when near edges
    autoScroll(list, e.clientY);

    // FLIP: snapshot before DOM change
    snapshotRects(list);

    const afterEl = getAfterElement(list, e.clientX, e.clientY, dragging);
    if (afterEl == null) list.appendChild(dragging);
    else list.insertBefore(dragging, afterEl);

    // Animate siblings to new spots
    playFlip(list);
  }

  function getAfterElement(container, x, y, dragging) {
    const els = itemsOf(container).filter(el => el !== dragging);
    let candidate = null;
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (y < cy || (Math.abs(y - cy) < 6 && x < cx)) {
        candidate = el;
        break;
      }
    }
    return candidate;
  }

  function persistOrder(list) {
    try {
      const ids = itemsOf(list).map(getId).filter(Boolean);
      const map = Object.create(null);
      (helper.STATE.notes || []).forEach(n => { map[n.id] = n; });
      const reordered = ids.map(id => map[id]).filter(Boolean);
      if (reordered.length === (helper.STATE.notes || []).length && reordered.length > 0) {
        helper.STATE.notes = reordered;
        if (typeof helper.persistSettings === 'function') helper.persistSettings();
      }
    } catch (e) {
      console.warn('[CGPT][DND] persist error', e);
    }
  }

  // Auto-scroll the notes container if mouse is near top/bottom
  function autoScroll(container, clientY) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const threshold = 32;
    const maxSpeed = 18; // px per frame

    let dir = 0;
    if (clientY < rect.top + threshold) dir = -1;
    else if (clientY > rect.bottom - threshold) dir = 1;

    if (dir === 0) { stopAutoScroll(); return; }
    if (_autoScrollRAF) return;

    const step = () => {
      container.scrollTop += dir * maxSpeed;
      _autoScrollRAF = requestAnimationFrame(step);
    };
    _autoScrollRAF = requestAnimationFrame(step);
  }
  function stopAutoScroll() {
    if (_autoScrollRAF) cancelAnimationFrame(_autoScrollRAF);
    _autoScrollRAF = 0;
  }

  function injectStyles() {
    if (document.getElementById('cgpt-dnd-anim-style')) return;
    const style = document.createElement('style');
    style.id = 'cgpt-dnd-anim-style';
    style.textContent = `
      .cgpt-note-list, .cgpt-notes-list, .cgpt-notes {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        grid-auto-rows: minmax(40px, auto);
        gap: 12px;
        align-content: start;
        overflow: auto;
      }
      .cgpt-note-item, .cgpt-note {
        transition: box-shadow 120ms ${EASE}, transform ${ANIM_MS}ms ${EASE};
        will-change: transform;
      }
      .${DRAG_CLASS} {
        opacity: 0.95;
        box-shadow: 0 6px 24px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15);
      }
    `;
    document.head.appendChild(style);
  }

  function wrapRender() {
    if (_wrapped) return;
    const cand = ['renderNotes', 'renderNotesList', 'renderAll'];
    const name = cand.find(fn => typeof helper[fn] === 'function');
    if (!name) return;
    const orig = helper[name];
    helper[name] = function wrapped() {
      const res = orig.apply(this, arguments);
      try {
        const panel = helper.ensurePanel && helper.ensurePanel();
        const list = panel && findList(panel);
        if (list) enableDnd(list);
      } catch (e) {}
      return res;
    };
    _wrapped = true;
  }

  function init() {
    injectStyles();
    wrapRender();
    try {
      const panel = helper.ensurePanel && helper.ensurePanel();
      const list = panel && findList(panel);
      if (list) enableDnd(list);
    } catch (_) {}
    const obs = new MutationObserver(() => {
      try {
        const panel = helper.ensurePanel && helper.ensurePanel();
        const list = panel && findList(panel);
        if (list) { enableDnd(list); obs.disconnect(); }
      } catch (_) {}
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
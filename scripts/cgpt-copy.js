(function () {
  const helper = window.cgptNoteHelper;
  if (!helper) return;

  const NOTE_BTN_CLASS = 'cgpt-set-note-btn';
  const NOTE_BTN_SELECTOR = '.' + NOTE_BTN_CLASS;

  // strict = nur Raw-Paste; loose = auch normale Codeblöcke
  const MODE = (localStorage.getItem('cgpt-note-mode') || 'loose').toLowerCase();

  // kurze Re-Attach-Serie nach „Kopiert!“-Re-Render
  const KEEP_ALIVE_DELAYS = [0, 60, 180, 400, 800, 1200];

  /* ───────────────── helpers ───────────────── */

  const getBubble = (el) => el?.closest?.('[data-message-author-role="assistant"]') || null;

  // Finde den **zum Header gehörenden** <pre>.
  // Annahme: der Copy-Button sitzt im Header; das passende <pre> ist i. d. R. ein Nachbar darunter.
  function findAssociatedPreFromHeader(headerEl) {
    if (!headerEl) return null;

    // 1) nextElementSibling-Kette prüfen
    let sib = headerEl.nextElementSibling;
    while (sib) {
      if (sib.matches && sib.matches('pre')) return sib;
      const nested = sib.querySelector && sib.querySelector('pre');
      if (nested) return nested;
      sib = sib.nextElementSibling;
    }

    // 2) im gemeinsamen Container suchen (meist parent)
    const group = headerEl.parentElement;
    if (group) {
      const pres = group.querySelectorAll ? group.querySelectorAll('pre') : [];
      if (pres.length === 1) return pres[0];
      if (pres.length > 1) {
        // wähle das visuell nächste <pre> (erste nach dem Header)
        let el = headerEl.nextElementSibling;
        while (el) {
          if (el.matches && el.matches('pre')) return el;
          const p = el.querySelector && el.querySelector('pre');
          if (p) return p;
          el = el.nextElementSibling;
        }
        return pres[0];
      }
    }

    // 3) Fallback: im Bubble das erste <pre>
    const bubble = getBubble(headerEl);
    return bubble?.querySelector?.('pre') || null;
  }

  function findAssociatedPreFromCopyButton(copyButton) {
    const header = copyButton?.parentElement || copyButton?.closest?.('header, div, section, article');
    return findAssociatedPreFromHeader(header || copyButton);
  }

  function findCodeElement(pre) {
    return pre?.querySelector?.('code') || null;
  }

  function getTextForHeader(headerEl) {
    const pre = findAssociatedPreFromHeader(headerEl);
    const code = findCodeElement(pre);
    return ((code ? code.textContent : pre?.textContent) || '').trim();
  }

  function detectLanguageNear(copyButton) {
    const pre = findAssociatedPreFromCopyButton(copyButton);
    const code = findCodeElement(pre);

    const cls = (code && code.className ? String(code.className).toLowerCase() : '');
    const m = cls.match(/language-([\w-]+)/);
    if (m) return m[1];

    // Badge/Label im Header
    const header = copyButton?.parentElement || null;
    const badge = header?.querySelector?.('span, div, strong, em');
    const badgeTxt = (badge?.textContent || '').trim().toLowerCase();
    if (badgeTxt) return badgeTxt;

    // Fallback-Attribute
    const attr = (code?.getAttribute?.('data-language') || code?.getAttribute?.('data-lang')) ||
                 (pre?.getAttribute?.('data-language') || pre?.getAttribute?.('data-lang')) || '';
    return String(attr).toLowerCase();
  }

  function isEligibleContext(copyButton) {
    const bubble = getBubble(copyButton);
    if (!bubble) return false;

    const pre = findAssociatedPreFromCopyButton(copyButton);
    if (!pre) return false;

    if (MODE === 'strict') {
      const lang = detectLanguageNear(copyButton);
      return /^(text|plain|plaintext)$/.test(lang);
    }
    return true; // loose
  }

  /* ───────────── inject PER HEADER & keep position ───────────── */

  function ensureSetNoteButton(copyButton) {
    if (!copyButton) return;
    if (!isEligibleContext(copyButton)) return;

    // Header/Action-Container des Copy-Buttons
    const header = copyButton.parentElement ||
                   copyButton.closest?.('header, div, section, article') ||
                   getBubble(copyButton) || document;

    // Pro **Header** genau EIN Note-Button
    let noteButton = header.querySelector(NOTE_BTN_SELECTOR);
    if (!noteButton) {
      noteButton = createNoteButton();
      header.insertBefore(noteButton, copyButton.nextSibling);
    } else {
      // sicherstellen, dass er direkt rechts vom aktuellen Copy-Button sitzt
      if (noteButton.previousElementSibling !== copyButton) {
        header.insertBefore(noteButton, copyButton.nextSibling);
      }
    }

    // Markiere den Copy-Button, damit wir ihn nicht doppelt verarbeiten
    copyButton.dataset.cgptNoteApplied = 'true';
  }

  function createNoteButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = NOTE_BTN_CLASS;
    btn.textContent = 'Set Note';
    btn.title = 'Send to the note panel (Shift: edit before saving)';

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // Text aus DEM Header holen, in dem der Button sitzt
      const header = btn.parentElement;
      const text = getTextForHeader(header);
      if (!text) return;

      if (ev.shiftKey || ev.altKey) {
        helper.openComposer(text);
        return;
      }
      helper.focusPanel();
      helper.addNote(text, { chatUrl: helper.getCurrentChatUrl() });
    });

    return btn;
  }

  function scanForCopyButtons(root = document.body) {
    if (!root) return;

    if (root instanceof HTMLButtonElement) {
      if (root.matches?.(helper.COPY_BUTTON_SELECTOR)) ensureSetNoteButton(root);
      return;
    }
    root.querySelectorAll?.(helper.COPY_BUTTON_SELECTOR)?.forEach((btn) => {
      // pro Copy-Button prüfen, nicht Bubble-weit
      if (btn.dataset.cgptNoteApplied !== 'true') ensureSetNoteButton(btn);
    });
  }

  // Nach Copy-Klick kurzzeitig öfter re-attachen (gegen „Kopiert!“-Re-Render)
  function scheduleKeepAliveAround(button) {
    const header = button.parentElement || getBubble(button) || document;
    KEEP_ALIVE_DELAYS.forEach((ms) => {
      setTimeout(() => {
        // nur Buttons im gleichen Header/Bereich re-asserten
        const localCopies = header.querySelectorAll(helper.COPY_BUTTON_SELECTOR);
        localCopies.forEach(ensureSetNoteButton);
      }, ms);
    });
  }

  document.addEventListener('click', (ev) => {
    const target = ev.target?.closest?.(helper.COPY_BUTTON_SELECTOR);
    if (target) scheduleKeepAliveAround(target);
  }, true);

  function observePage() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.(helper.COPY_BUTTON_SELECTOR)) ensureSetNoteButton(node);
          scanForCopyButtons(node);
        }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-label', 'data-state', 'data-testid']
    });
  }

  // export
  helper.ensureSetNoteButton = ensureSetNoteButton;
  helper.scanForCopyButtons = scanForCopyButtons;
  helper.observePage = observePage;
})();

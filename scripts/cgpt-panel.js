(function () {
  const helper = window.cgptNoteHelper;
  if (!helper) {
    return;
  }
  const { STATE } = helper;

  // interner UI-Filterzustand, runtime-only
  if (typeof STATE.activeFilterTag !== 'string') {
    STATE.activeFilterTag = '';
  }

  // ───────────────────────────────────────────────────────────
  // Inline Undo (10s) – erscheint genau dort, wo man "Delete" klickt
  // ───────────────────────────────────────────────────────────
  function createInlineUndoPlaceholder(message = 'Note deleted') {
    const ph = document.createElement('article');
    ph.className = 'cgpt-note-item cgpt-note-undo-inline';
    // Minimal Inline-Styles, damit keine zusätzlichen CSS-Änderungen nötig sind
    ph.style.border = '1px dashed rgba(0,0,0,0.2)';
    ph.style.borderRadius = '8px';
    ph.style.padding = '10px 12px';
    ph.style.display = 'flex';
    ph.style.justifyContent = 'space-between';
    ph.style.alignItems = 'center';
    ph.style.gap = '12px';
    ph.style.background = 'rgba(0,0,0,0.02)';

    const msg = document.createElement('span');
    msg.textContent = message;
    msg.style.opacity = '0.9';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Undo';
    btn.className = 'cgpt-note-btn small';
    btn.style.padding = '6px 10px';

    ph.appendChild(msg);
    ph.appendChild(btn);
    return { ph, btn };
  }
  // ───────────────────────────────────────────────────────────

  // Auto-Resize für Textareas (öffnet direkt groß & wächst mit)
  function autoSizeTextarea(el, { min = 220, max = 800 } = {}) {
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, min), max);
    el.style.height = h + 'px';
  }

  function formatTimestamp(ts) {
    try {
      const date = new Date(ts);
      return date.toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      });
    } catch (error) {
      return '';
    }
  }

  function createButton(label, action, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = `cgpt-note-btn ${extraClass}`.trim();
    button.dataset.action = action;
    return button;
  }

  function ensurePanel() {
    const existing = document.getElementById(helper.PANEL_ID);
    if (existing) {
      return existing;
    }

    const panel = document.createElement('section');
    panel.id = helper.PANEL_ID;
    panel.className = 'cgpt-note-panel';
    panel.innerHTML = `
      <header class="cgpt-note-header">
        <div class="cgpt-note-header-title">
          <span class="cgpt-note-title">Work Notes</span>
          <span class="cgpt-note-counter" data-role="note-counter"></span>
        </div>
        <div class="cgpt-note-header-actions">
          <button type="button" class="cgpt-note-icon-btn" data-action="toggle-panel" title="Expand or collapse panel">Toggle</button>
          <button type="button" class="cgpt-note-icon-btn" data-action="clear-notes" title="Remove all notes">Clear</button>
        </div>
      </header>
      <div class="cgpt-note-composer" data-role="composer">
        <textarea data-role="composer-input" placeholder="Write your note here or paste it from ChatGPT..."></textarea>
        <div class="cgpt-tag-editor-placeholder" data-role="composer-tag-area"></div>
        <div class="cgpt-note-composer-actions">
          <button type="button" class="cgpt-note-btn" data-action="save-composer" disabled>Save</button>
          <button type="button" class="cgpt-note-btn ghost" data-action="cancel-composer">Discard</button>
        </div>
      </div>
      <div class="cgpt-note-toolbar">
        <button type="button" class="cgpt-note-btn primary" data-action="open-composer">+ New Note</button>
        <div class="cgpt-tag-filter" data-role="tag-filter"></div>
      </div>
      <div class="cgpt-note-list" data-role="note-list"></div>
      <div class="cgpt-note-empty" data-role="empty-state">No notes yet. Use the "Set Note" button or start manually.</div>
    `;

    // Tag-Editor (Composer)
    const composerTagArea = panel.querySelector('[data-role="composer-tag-area"]');
    if (composerTagArea) {
      const tagEditor = helper.createTagEditor({ context: 'composer', tags: STATE.composerTags });
      composerTagArea.replaceWith(tagEditor);
    }

    document.body.appendChild(panel);

    panel.addEventListener('click', handlePanelClick);
    const composer = panel.querySelector('[data-role="composer"]');
    composer.dataset.open = 'false';
    const textarea = panel.querySelector('[data-role="composer-input"]');
    const composerTagEditor = panel.querySelector('[data-role="tag-editor"][data-context="composer"]');
    if (composerTagEditor) {
      helper.setEditorTags(composerTagEditor, STATE.composerTags);
      const tagInput = composerTagEditor.querySelector('[data-role="tag-input"]');
      if (tagInput) {
        tagInput.value = '';
      }
    }
    textarea.addEventListener('input', handleComposerInput);
    textarea.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        triggerSaveComposer();
      }
    });

    // initial Filterleiste rendern
    renderTagFilter();

    return panel;
  }

  function handlePanelClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget || !event.currentTarget.contains(actionTarget)) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (!action) {
      return;
    }

    const noteItem = actionTarget.closest('[data-note-id]');

    switch (action) {
      case 'open-composer':
        openComposer();
        break;
      case 'cancel-composer':
        closeComposer();
        break;
      case 'save-composer':
        triggerSaveComposer();
        break;
      case 'toggle-panel':
        STATE.collapsed = !STATE.collapsed;
        updatePanelCollapse();
        helper.persistSettings();
        break;
      case 'clear-notes':
        if (STATE.notes.length === 0) {
          break;
        }
        if (confirm('Delete all notes?')) {
          STATE.notes = [];
          renderNotes();
          helper.persistSettings();
        }
        break;
      case 'toggle-chat-link':
        toggleNoteChatLink(noteItem);
        break;
      case 'edit-note':
        enterEditMode(noteItem);
        break;
      case 'delete-note':
        // ➜ übergeben wir das Element, damit das Inline-Undo an genau dieser Stelle erscheint
        deleteNote(noteItem?.dataset.noteId, noteItem);
        break;
      case 'copy-note':
        copyNote(noteItem?.dataset.noteId);
        break;
      case 'save-note-edit':
        finalizeEdit(noteItem);
        break;
      case 'cancel-note-edit':
        cancelEdit(noteItem);
        break;
      case 'toggle-tag': {
        const editor = actionTarget.closest('[data-role="tag-editor"]');
        if (editor) {
          helper.toggleTagInEditor(editor, actionTarget.dataset.tag);
          const input = editor.querySelector('[data-role="tag-input"]');
          if (input) {
            input.focus();
          }
        }
        break;
      }
      case 'remove-tag': {
        const editor = actionTarget.closest('[data-role="tag-editor"]');
        if (editor) {
          helper.removeTagFromEditor(editor, actionTarget.dataset.tag);
        }
        break;
      }
      case 'clear-tags': {
        const editor = actionTarget.closest('[data-role="tag-editor"]');
        if (editor) {
          helper.clearTagEditor(editor);
        }
        break;
      }
      // NEW: Tag-Filter togglen
      case 'toggle-filter-tag': {
        const tag = (actionTarget.dataset.tag || '').trim();
        if (!tag) break;
        if ((STATE.activeFilterTag || '').toLowerCase() === tag.toLowerCase()) {
          STATE.activeFilterTag = ''; // ausschalten
        } else {
          STATE.activeFilterTag = tag;
        }
        // UI aktualisieren
        renderTagFilter();
        renderNotes(); // Liste nach Filter neu
        break;
      }
      case 'clear-tag-filter': {
        STATE.activeFilterTag = '';
        renderTagFilter();
        renderNotes();
        break;
      }
      default:
        break;
    }
  }

  function handleComposerInput(event) {
    const value = event.target.value.trim();
    const saveButton = document.querySelector('#' + helper.PANEL_ID + ' [data-action="save-composer"]');
    if (saveButton) {
      saveButton.disabled = value.length === 0;
    }
  }

  function openComposer(content = '') {
    const panel = focusPanel();
    const composer = panel.querySelector('[data-role="composer"]');
    const textarea = panel.querySelector('[data-role="composer-input"]');
    const composerTagEditor = panel.querySelector('[data-role="tag-editor"][data-context="composer"]');
    if (composerTagEditor) {
      helper.setEditorTags(composerTagEditor, STATE.composerTags);
      const tagInput = composerTagEditor.querySelector('[data-role="tag-input"]');
      if (tagInput) {
        tagInput.value = '';
      }
    }
    composer.dataset.open = 'true';
    textarea.value = content.trim();
    handleComposerInput({ target: textarea });
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    helper.persistSettings();
  }

  function closeComposer() {
    const panel = ensurePanel();
    const composer = panel.querySelector('[data-role="composer"]');
    const textarea = panel.querySelector('[data-role="composer-input"]');
    composer.dataset.open = 'false';
    textarea.value = '';
    handleComposerInput({ target: textarea });
  }

  function maybeRemoveEditingState() {
    const panel = document.getElementById(helper.PANEL_ID);
    if (!panel) {
      return;
    }
    const editing = panel.querySelector('[data-note-editing="true"]');
    if (editing) {
      cancelEdit(editing);
    }
  }

  function triggerSaveComposer() {
    const panel = ensurePanel();
    const textarea = panel.querySelector('[data-role="composer-input"]');
    const value = textarea.value.trim();
    if (!value) {
      return;
    }
    const composerTagEditor = panel.querySelector('[data-role="tag-editor"][data-context="composer"]');
    if (composerTagEditor) {
      helper.commitPendingTagInput(composerTagEditor);
    }
    const tags = composerTagEditor ? helper.collectTagsFromEditor(composerTagEditor) : [];
    addNote(value, { focus: true, tags });
    closeComposer();
  }

  function updatePanelCollapse() {
    const panel = ensurePanel();
    panel.dataset.collapsed = STATE.collapsed ? 'true' : 'false';
  }

  function renderStaticTags(container, tags) {
    if (!container) {
      return;
    }
    const normalized = helper.sanitizeTags(tags);
    container.innerHTML = '';
    if (!normalized.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    normalized.forEach((tag) => {
      const pill = document.createElement('span');
      pill.className = 'cgpt-note-tag';
      pill.textContent = helper.formatTagLabel(tag);
      pill.dataset.tag = tag;
      container.appendChild(pill);
    });
  }

  function applyChatLinkState(item, note) {
    const linkEl = item.querySelector('[data-role="note-chat-link"]');
    const toggleBtn = item.querySelector('[data-action="toggle-chat-link"]');
    const chatUrl = helper.normalizeChatUrl(note.chatUrl || note.chatId || '');
    const hasLink = !!chatUrl;
    note.chatUrl = chatUrl;

    if (linkEl) {
      if (hasLink) {
        linkEl.hidden = false;
        linkEl.href = chatUrl;
        linkEl.textContent = 'Open chat';
      } else {
        linkEl.hidden = true;
        linkEl.removeAttribute('href');
        linkEl.textContent = '';
      }
    }

    if (toggleBtn) {
      toggleBtn.dataset.chatLinked = hasLink ? 'true' : 'false';
      toggleBtn.title = hasLink ? 'Remove chat link' : 'Link to the current chat';
    }
  }

  // NEW: Tag-Stats berechnen (aus allen Notes); Ausgabe: [{tag, count}]
  function computeTagStats() {
    const counts = new Map();
    (STATE.notes || []).forEach(n => {
      const tags = helper.sanitizeTags(n.tags || []);
      tags.forEach(t => {
        const key = t.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    const entries = [...counts.entries()].map(([lower, count]) => {
      return { tag: lower, label: helper.formatTagLabel(lower), count };
    });
    // Sort: häufigste zuerst, dann alphabetisch
    entries.sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
    return entries;
  }

  // NEW: Filterleiste rendern
  function renderTagFilter() {
    const panel = ensurePanel();
    const bar = panel.querySelector('[data-role="tag-filter"]');
    if (!bar) return;

    const stats = computeTagStats();
    bar.innerHTML = '';

    if (stats.length === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    bar.style.flexWrap = 'wrap';
    bar.style.gap = '6px';
    bar.style.alignItems = 'center';
    bar.style.marginLeft = '8px';

    // Optionaler "All"-Button (sichtbar, wenn Filter aktiv)
    if (STATE.activeFilterTag) {
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'cgpt-tag-preset';
      allBtn.dataset.action = 'clear-tag-filter';
      allBtn.textContent = 'All';
      bar.appendChild(allBtn);
    }

    stats.forEach(({ tag, label, count }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cgpt-tag-preset';
      btn.dataset.action = 'toggle-filter-tag';
      btn.dataset.tag = tag;
      if ((STATE.activeFilterTag || '').toLowerCase() === tag.toLowerCase()) {
        btn.setAttribute('data-active', 'true');
      }
      btn.textContent = `${label} (${count})`;
      bar.appendChild(btn);
    });
  }

  function renderNotes(highlightId) {
    const panel = ensurePanel();
    const list = panel.querySelector('[data-role="note-list"]');
    const empty = panel.querySelector('[data-role="empty-state"]');
    const counter = panel.querySelector('[data-role="note-counter"]');

    list.innerHTML = '';

    // Filter anwenden (case-insensitive)
    const active = (STATE.activeFilterTag || '').toLowerCase();
    const source = active
      ? (STATE.notes || []).filter(n => (n.tags || []).some(t => String(t).toLowerCase() === active))
      : (STATE.notes || []);

    // Counter + Filter-Bar aktualisieren
    const total = (STATE.notes || []).length;
    const shown = source.length;
    if (!total) {
      empty.style.display = 'block';
      counter.textContent = '';
      renderTagFilter();
      return;
    }

    empty.style.display = 'none';
    counter.textContent = active
      ? (shown === 1 ? '1 Note (filtered)' : `${shown} Notes (filtered)`)
      : (total === 1 ? '1 Note' : `${total} Notes`);

    source.forEach((note) => {
      const item = document.createElement('article');
      item.className = 'cgpt-note-item';
      item.dataset.noteId = note.id;
      item.innerHTML = `
        <header class="cgpt-note-item-header">
          <div class="cgpt-note-meta">
            <span class="cgpt-note-time">${formatTimestamp(note.createdAt)}</span>
            <a class="cgpt-note-chat-link" data-role="note-chat-link" target="_blank" rel="noopener noreferrer"></a>
          </div>
          <div class="cgpt-note-item-actions">
            <button type="button" class="cgpt-note-icon-btn" data-action="toggle-chat-link" title="Link or unlink with the current chat">Chat</button>
            <button type="button" class="cgpt-note-icon-btn" data-action="edit-note" title="Edit note">Edit</button>
            <button type="button" class="cgpt-note-icon-btn" data-action="copy-note" title="Copy to clipboard">Copy</button>
            <button type="button" class="cgpt-note-icon-btn danger" data-action="delete-note" title="Delete note">Delete</button>
          </div>
        </header>
        <div class="cgpt-note-tags" data-role="note-tags"></div>
        <pre class="cgpt-note-text"></pre>
      `;
      const textEl = item.querySelector('.cgpt-note-text');
      textEl.textContent = note.content;
      const tagsEl = item.querySelector('[data-role="note-tags"]');
      const noteTags = helper.sanitizeTags(note.tags);
      note.tags = noteTags;
      renderStaticTags(tagsEl, noteTags);
      applyChatLinkState(item, note);
      list.appendChild(item);

      if (highlightId && note.id === highlightId) {
        item.classList.add('cgpt-note-highlight');
        setTimeout(() => item.classList.remove('cgpt-note-highlight'), 1200);
      }
    });

    list.scrollTop = 0;

    // Filterbar nach jeder Änderung aktualisieren (Counts können sich ändern)
    renderTagFilter();
  }

  function addNote(content, options = {}) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const tags = helper.sanitizeTags(options.tags || []);
    const chatUrl = helper.normalizeChatUrl(options.chatUrl || '');
    const note = {
      id: helper.generateId(),
      content: trimmed,
      createdAt: Date.now(),
      tags,
      chatUrl
    };
    STATE.notes.unshift(note);
    renderNotes(note.id);
    helper.persistSettings();

    if (options.focus) {
      focusPanel();
    }
  }

  function focusPanel() {
    const panel = ensurePanel();
    STATE.collapsed = false;
    updatePanelCollapse();
    panel.classList.add('cgpt-note-panel-attention');
    panel.addEventListener('animationend', () => panel.classList.remove('cgpt-note-panel-attention'), { once: true });
    setTimeout(() => panel.classList.remove('cgpt-note-panel-attention'), 600);
    return panel;
  }

  function deleteNote(id, anchorEl) {
    if (!id) {
      return;
    }
    const index = STATE.notes.findIndex((note) => note.id === id);
    if (index === -1) {
      return;
    }

    // entferne aus STATE
    const [removed] = STATE.notes.splice(index, 1);
    helper.persistSettings();

    // Inline-Placeholder an exakt dieser Stelle anzeigen
    const { ph, btn } = createInlineUndoPlaceholder('Note deleted');
    let autoTimer = null;

    // Ersetze das DOM-Element inline durch den Undo-Placeholder, ohne alles neu zu rendern
    if (anchorEl && anchorEl.parentElement) {
      anchorEl.replaceWith(ph);
    } else {
      // Fallback: wenn Element nicht existiert, einfach neu rendern und abbrechen
      renderNotes();
      return;
    }

    const cleanup = () => {
      if (ph && ph.parentElement) {
        ph.parentElement.removeChild(ph);
      }
      if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
      // Nach Löschung Filter/Counts aktualisieren
      renderTagFilter();
    };

    // Undo klick
    btn.addEventListener('click', () => {
      cleanup();
      // wieder einfügen an der alten Position (bounds safe)
      const insertAt = Math.max(0, Math.min(index, STATE.notes.length));
      STATE.notes.splice(insertAt, 0, removed);
      helper.persistSettings();
      renderNotes(removed.id);
    });

    // Auto-Expire nach 10s
    autoTimer = setTimeout(() => {
      cleanup();
      // Liste ist bereits ohne Note (STATE mutiert)
    }, 10000);
  }

  function copyNote(id) {
    if (!id) {
      return;
    }
    const note = STATE.notes.find((item) => item.id === id);
    if (!note) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(note.content).catch((error) => console.error('ChatGPT Note Helper: Copy failed', error));
    } else {
      const temp = document.createElement('textarea');
      temp.value = note.content;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
  }

  function toggleNoteChatLink(item) {
    if (!item) {
      return;
    }
    const id = item.dataset.noteId;
    if (!id) {
      return;
    }
    const note = STATE.notes.find((entry) => entry.id === id);
    if (!note) {
      return;
    }

    const currentChatUrl = helper.getCurrentChatUrl();

    if (note.chatUrl && (!currentChatUrl || note.chatUrl === currentChatUrl)) {
      note.chatUrl = '';
      helper.persistSettings();
      renderNotes(id);
      return;
    }

    if (!currentChatUrl) {
      alert('No chat link detected. Open a chat and try again.');
      return;
    }

    note.chatUrl = currentChatUrl;
    helper.persistSettings();
    renderNotes(id);
  }

  function enterEditMode(item) {
    if (!item || item.dataset.noteEditing === 'true') {
      return;
    }

    const id = item.dataset.noteId;
    const note = STATE.notes.find((entry) => entry.id === id);
    if (!note) {
      return;
    }

    maybeRemoveEditingState();

    item.dataset.noteEditing = 'true';
    const textEl = item.querySelector('.cgpt-note-text');
    const original = note.content;
    const editArea = document.createElement('div');
    editArea.className = 'cgpt-note-edit-area';
    const textarea = document.createElement('textarea');
    textarea.className = 'cgpt-note-edit-input';
    textarea.value = original;

    // direkt groß öffnen & mitwachsen lassen
    textarea.style.maxHeight = 'none';
    textarea.style.height = 'auto';
    editArea.appendChild(textarea);
    autoSizeTextarea(textarea, { min: 220, max: 800 });
    textarea.addEventListener('input', () => autoSizeTextarea(textarea, { min: 220, max: 800 }));

    const tagEditor = helper.createTagEditor({ context: 'note', noteId: id, tags: note.tags });
    editArea.appendChild(tagEditor);
    textEl.replaceWith(editArea);

    const actions = item.querySelector('.cgpt-note-item-actions');
    actions.dataset.editMode = 'true';
    actions.innerHTML = '';
    const save = createButton('Save', 'save-note-edit', 'small');
    const cancel = createButton('Cancel', 'cancel-note-edit', 'small ghost');
    actions.appendChild(save);
    actions.appendChild(cancel);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function finalizeEdit(item) {
    if (!item) {
      return;
    }
    const id = item.dataset.noteId;
    const textarea = item.querySelector('textarea.cgpt-note-edit-input');
    if (!textarea) {
      return;
    }
    const value = textarea.value.trim();
    if (!value) {
      deleteNote(id, item); // beim Leeren gleiches Inline-Undo
      return;
    }

    const note = STATE.notes.find((entry) => entry.id === id);
    if (!note) {
      return;
    }
    const editor = item.querySelector('[data-role="tag-editor"][data-context="note"]');
    let tags = Array.isArray(note.tags) ? note.tags : [];
    if (editor) {
      helper.commitPendingTagInput(editor);
      tags = helper.collectTagsFromEditor(editor);
    } else {
      tags = helper.sanitizeTags(tags);
    }
    note.content = value;
    note.tags = tags;
    renderNotes(id);
    helper.persistSettings();
  }

  function cancelEdit(item) {
    if (!item) {
      return;
    }
    const id = item.dataset.noteId;
    const note = STATE.notes.find((entry) => entry.id === id);
    if (!note) {
      renderNotes();
      return;
    }
    renderNotes(id);
  }

  helper.formatTimestamp = formatTimestamp;
  helper.createButton = createButton;
  helper.ensurePanel = ensurePanel;
  helper.openComposer = openComposer;
  helper.closeComposer = closeComposer;
  helper.updatePanelCollapse = updatePanelCollapse;
  helper.renderNotes = renderNotes;
  helper.addNote = addNote;
  helper.focusPanel = focusPanel;
  helper.deleteNote = deleteNote;
  helper.copyNote = copyNote;
  helper.toggleNoteChatLink = toggleNoteChatLink;
  helper.enterEditMode = enterEditMode;
  helper.finalizeEdit = finalizeEdit;
  helper.cancelEdit = cancelEdit;
})();

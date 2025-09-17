(function () {
  const helper = window.cgptNoteHelper;
  if (!helper) {
    return;
  }

  function getPresetButtonsMarkup() {
    return helper.PRESET_TAGS.map((tag) => `<button type="button" class="cgpt-tag-preset" data-role="tag-preset" data-action="toggle-tag" data-tag="${tag.id}">${tag.label}</button>`).join("");
  }

  function parseTagInput(value) {
    if (typeof value !== 'string') {
      return [];
    }
    return value
      .split(/[,;\n]+/)
      .split(/[,;\n]+/)
      .filter((entry) => entry.length > 0);
  }

  function readEditorTags(editor) {
    if (!editor) {
      return [];
    }
    return Array.from(editor.querySelectorAll('[data-role="tag-chip"]'))
      .map((chip) => chip.dataset.tag)
      .filter((tag) => typeof tag === 'string' && tag.length > 0);
  }

  function updatePresetButtonStates(editor, tags = readEditorTags(editor)) {
    if (!editor) {
      return;
    }
    const active = new Set(tags.map((tag) => tag.toLowerCase()));
    const buttons = editor.querySelectorAll('[data-role="tag-preset"]');
    buttons.forEach((button) => {
      const value = (button.dataset.tag || '').toLowerCase();
      button.dataset.active = value && active.has(value) ? 'true' : 'false';
    });
  }

  function setEditorTags(editor, tags) {
    if (!editor) {
      return;
    }
    const chipList = editor.querySelector('[data-role="tag-chip-list"]');
    if (!chipList) {
      return;
    }
    const sanitized = helper.sanitizeTags(tags);
    chipList.innerHTML = '';
    sanitized.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'cgpt-tag-chip';
      chip.dataset.role = 'tag-chip';
      chip.dataset.tag = tag;
      chip.innerHTML = "<span class=\"cgpt-tag-chip-label\">" + helper.formatTagLabel(tag) + "</span><button type=\"button\" class=\"cgpt-tag-chip-remove\" data-action=\"remove-tag\" data-tag=\"" + tag + "\" aria-label=\"Remove tag " + helper.formatTagLabel(tag) + "\">x</button>";
      chipList.appendChild(chip);
    });
    editor.dataset.tagCount = String(sanitized.length);
    updatePresetButtonStates(editor, sanitized);
    if (editor.dataset.context === 'composer') {
      helper.STATE.composerTags = sanitized.slice();
    }
  }

  function flashTagLimit(editor) {
    if (!editor) {
      return;
    }
    editor.classList.add('cgpt-tag-limit');
    setTimeout(() => editor.classList.remove('cgpt-tag-limit'), 600);
  }

  function addTagToEditor(editor, tag) {
    if (!editor) {
      return;
    }
    const sanitized = helper.sanitizeTagValue(tag);
    if (!sanitized) {
      return;
    }
    const current = readEditorTags(editor);
    const key = sanitized.toLowerCase();
    if (current.some((entry) => (entry || '').toLowerCase() === key)) {
      return;
    }
    if (current.length >= helper.MAX_TAGS_PER_NOTE) {
      flashTagLimit(editor);
      return;
    }
    setEditorTags(editor, current.concat([sanitized]));
  }

  function removeTagFromEditor(editor, tag) {
    if (!editor) {
      return;
    }
    const key = typeof tag === 'string' ? tag.toLowerCase() : '';
    const current = readEditorTags(editor);
    const filtered = current.filter((entry) => (entry || '').toLowerCase() !== key);
    setEditorTags(editor, filtered);
  }

  function toggleTagInEditor(editor, tag) {
    if (!editor) {
      return;
    }
    const sanitized = helper.sanitizeTagValue(tag);
    if (!sanitized) {
      return;
    }
    const current = readEditorTags(editor);
    const key = sanitized.toLowerCase();
    if (current.some((entry) => (entry || '').toLowerCase() === key)) {
      removeTagFromEditor(editor, sanitized);
    } else {
      addTagToEditor(editor, sanitized);
    }
  }

  function clearTagEditor(editor) {
    if (!editor) {
      return;
    }
    setEditorTags(editor, []);
    const input = editor.querySelector('[data-role="tag-input"]');
    if (input) {
      input.value = '';
    }
  }

  function commitTagInputValue(editor, input) {
    if (!editor || !input) {
      return;
    }
    const parsed = parseTagInput(input.value);
    let addedAny = false;
    parsed.forEach((entry) => {
      const before = readEditorTags(editor).length;
      addTagToEditor(editor, entry);
      const after = readEditorTags(editor).length;
      if (after > before) {
        addedAny = true;
      }
    });
    if (parsed.length && !addedAny) {
      flashTagLimit(editor);
    }
    input.value = '';
  }

  function handleTagInputKeydown(event) {
    const target = event.target;
    if (!target || target.dataset.role !== 'tag-input') {
      return;
    }
    const editor = target.closest('[data-role="tag-editor"]');
    if (!editor) {
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      commitTagInputValue(editor, target);
      return;
    }
    if (event.key === 'Backspace' && !target.value) {
      const current = readEditorTags(editor);
      if (current.length) {
        removeTagFromEditor(editor, current[current.length - 1]);
      }
    }
  }

  function handleTagInputBlur(event) {
    const target = event.target;
    if (!target || target.dataset.role !== 'tag-input') {
      return;
    }
    const editor = target.closest('[data-role="tag-editor"]');
    if (!editor) {
      return;
    }
    if (target.value.trim()) {
      commitTagInputValue(editor, target);
    }
  }

  function attachTagEditor(editor) {
    if (!editor || editor.dataset.tagEditorBound === 'true') {
      return;
    }
    const input = editor.querySelector('[data-role="tag-input"]');
    if (input) {
      input.addEventListener('keydown', handleTagInputKeydown);
      input.addEventListener('blur', handleTagInputBlur);
    }
    editor.dataset.tagEditorBound = 'true';
    updatePresetButtonStates(editor);
  }

  function collectTagsFromEditor(editor) {
    return helper.sanitizeTags(readEditorTags(editor));
  }

  function commitPendingTagInput(editor) {
    if (!editor) {
      return;
    }
    const input = editor.querySelector('[data-role="tag-input"]');
    if (input && input.value.trim()) {
      commitTagInputValue(editor, input);
    }
  }

  function createTagEditor({ context, noteId, tags = [] } = {}) {
    const editor = document.createElement('div');
    editor.className = 'cgpt-tag-editor';
    editor.dataset.role = 'tag-editor';
    editor.dataset.context = context || 'composer';
    if (noteId) {
      editor.dataset.noteId = noteId;
    }

    const header = document.createElement('div');
    header.className = 'cgpt-tag-editor-top';

    const title = document.createElement('span');
    title.className = 'cgpt-tag-editor-title';
    title.textContent = 'Tags';

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'cgpt-tag-editor-reset';
    reset.dataset.action = 'clear-tags';
    reset.textContent = 'Reset';

    header.appendChild(title);
    header.appendChild(reset);

    const chipList = document.createElement('div');
    chipList.className = 'cgpt-tag-chip-list';
    chipList.dataset.role = 'tag-chip-list';

    const presetRow = document.createElement('div');
    presetRow.className = 'cgpt-tag-preset-row';
    presetRow.dataset.role = 'tag-presets';
    presetRow.innerHTML = getPresetButtonsMarkup();

    editor.append(header, chipList, presetRow);

    attachTagEditor(editor);
    setEditorTags(editor, tags);

    return editor;
  }

  helper.readEditorTags = readEditorTags;
  helper.updatePresetButtonStates = updatePresetButtonStates;
  helper.setEditorTags = setEditorTags;
  helper.removeTagFromEditor = removeTagFromEditor;
  helper.toggleTagInEditor = toggleTagInEditor;
  helper.clearTagEditor = clearTagEditor;
  helper.collectTagsFromEditor = collectTagsFromEditor;
  helper.commitPendingTagInput = commitPendingTagInput;
  helper.createTagEditor = createTagEditor;
})();

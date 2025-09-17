(function () {
  const helper = window.cgptNoteHelper;
  if (!helper) {
    return;
  }

  function serializeNotes() {
    return helper.STATE.notes
      .filter((note) => note && typeof note.content === 'string')
      .map((note) => {
        const content = note.content.trim();
        if (!content) {
          return null;
        }
        const tags = helper.sanitizeTags(note.tags);
        const chatUrl = helper.normalizeChatUrl(note.chatUrl || note.chatId || '');
        note.tags = tags;
        note.chatUrl = chatUrl;
        return {
          id: typeof note.id === 'string' && note.id ? note.id : helper.generateId(),
          content,
          createdAt: typeof note.createdAt === 'number' ? note.createdAt : Date.now(),
          tags,
          chatUrl
        };
      })
      .filter(Boolean);
  }

  function normalizeNotes(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((entry) => entry && typeof entry.content === 'string')
      .map((entry) => {
        const content = entry.content.trim();
        const tags = helper.sanitizeTags(entry.tags);
        const chatUrl = helper.normalizeChatUrl(entry.chatUrl || entry.chatId || '');
        return {
          id: typeof entry.id === 'string' && entry.id ? entry.id : helper.generateId(),
          content,
          createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
          tags,
          chatUrl
        };
      })
      .filter((entry) => entry.content.length > 0);
  }

  async function loadSettings() {
    if (!helper.storage) {
      try {
        const raw = localStorage.getItem(helper.STORAGE_KEY);
        helper.STATE.notes = raw ? normalizeNotes(JSON.parse(raw)) : [];
        const collapsed = localStorage.getItem(helper.COLLAPSE_KEY);
        helper.STATE.collapsed = collapsed === 'true';
      } catch (error) {
        console.error('ChatGPT Note Helper: Failed to load local notes.', error);
        helper.STATE.notes = [];
        helper.STATE.collapsed = false;
      }
      return;
    }

    return new Promise((resolve) => {
      helper.storage.get([helper.STORAGE_KEY, helper.COLLAPSE_KEY], (items) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('ChatGPT Note Helper: Storage error', chrome.runtime.lastError);
        }
        helper.STATE.notes = normalizeNotes(items[helper.STORAGE_KEY]);
        helper.STATE.collapsed = items[helper.COLLAPSE_KEY] === true;
        resolve();
      });
    });
  }

  function persistSettings() {
    const serialized = serializeNotes();
    if (!helper.storage) {
      try {
        localStorage.setItem(helper.STORAGE_KEY, JSON.stringify(serialized));
        localStorage.setItem(helper.COLLAPSE_KEY, String(helper.STATE.collapsed));
      } catch (error) {
        console.error('ChatGPT Note Helper: Failed to save notes.', error);
      }
      helper.STATE.notes = serialized;
      return;
    }

    helper.storage.set({
      [helper.STORAGE_KEY]: serialized,
      [helper.COLLAPSE_KEY]: helper.STATE.collapsed
    }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.error('ChatGPT Note Helper: Storage error', chrome.runtime.lastError);
      }
    });
    helper.STATE.notes = serialized;
  }

  helper.serializeNotes = serializeNotes;
  helper.normalizeNotes = normalizeNotes;
  helper.loadSettings = loadSettings;
  helper.persistSettings = persistSettings;
})();

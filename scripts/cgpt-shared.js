(function () {
  const helper = window.cgptNoteHelper = window.cgptNoteHelper || {};

  helper.STORAGE_KEY = 'cgpt-note-helper::notes';
  helper.COLLAPSE_KEY = 'cgpt-note-helper::collapsed';
  helper.PANEL_ID = 'cgpt-note-panel';
  helper.STATE = {
    notes: [],
    collapsed: false,
    composerTags: []
  };

  helper.COPY_BUTTON_SELECTOR = [
    'button[data-testid="copy-button"]',
    'button[data-testid="copy-code-button"]',
    'button[aria-label*="Copy" i]',
    'button[aria-label*="Kopieren" i]'
  ].join(', ');
  helper.PRESET_TAGS = [
    { id: 'todo', label: 'TODO' },
    { id: 'bug', label: 'Bug' },
    { id: 'info', label: 'Info' },
    { id: 'idea', label: 'Idea' },
    { id: 'question', label: 'Question' }
  ];
  helper.MAX_TAGS_PER_NOTE = 12;

  helper.storage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  helper.log = function log(...args) {
    if (false) {
      console.log('[ChatGPT Note Helper]', ...args);
    }
  };

  helper.waitForBody = function waitForBody() {
    if (document.body) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  };

  helper.generateId = function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'note-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  };

  helper.sanitizeTagValue = function sanitizeTagValue(tag) {
    if (typeof tag !== 'string') {
      return '';
    }
    const cleaned = tag.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return '';
    }
    return cleaned.slice(0, 48);
  };

  helper.sanitizeTags = function sanitizeTags(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    const seen = new Set();
    const result = [];
    for (const entry of raw) {
      const cleaned = helper.sanitizeTagValue(entry);
      if (!cleaned) {
        continue;
      }
      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(cleaned);
      if (result.length >= helper.MAX_TAGS_PER_NOTE) {
        break;
      }
    }
    return result;
  };

  helper.formatTagLabel = function formatTagLabel(tag) {
    if (!tag || typeof tag !== 'string') {
      return '';
    }
    if (tag.length <= 3) {
      return tag.toUpperCase();
    }
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  };

  helper.normalizeChatUrl = function normalizeChatUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    try {
      const base = typeof location !== 'undefined' ? location.origin : 'https://chat.openai.com';
      const url = new URL(trimmed, base);
      if (!url.pathname || !url.pathname.startsWith('/c/')) {
        return '';
      }
      return url.origin + url.pathname;
    } catch (error) {
      return '';
    }
  };

  helper.getCurrentChatUrl = function getCurrentChatUrl() {
    if (typeof location === 'undefined') {
      return '';
    }
    return helper.normalizeChatUrl(location.origin + (location.pathname || ''));
  };

})();

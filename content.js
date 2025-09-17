(function () {
  const helper = window.cgptNoteHelper;
  if (!helper || typeof helper.init !== 'function') {
    console.error('ChatGPT Note Helper failed to initialize: missing bootstrap.');
    return;
  }

  helper.init().catch((error) => console.error('ChatGPT Note Helper failed to initialize.', error));
})();

(function () {
  const helper = window.cgptNoteHelper;
  if (!helper) {
    return;
  }

  helper.init = async function init() {
    await helper.waitForBody();
    helper.ensurePanel();
    await helper.loadSettings();
    helper.renderNotes();
    helper.updatePanelCollapse();
    helper.scanForCopyButtons();
    helper.observePage();
  };
})();

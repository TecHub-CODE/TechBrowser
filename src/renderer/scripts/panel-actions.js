// Dynamic markup carries data, never executable JavaScript. Keep the action
// names explicit: attributes cannot invoke arbitrary window functions.
(function installPanelActions() {
  const decode = (element) => decodeURIComponent(element.dataset.value || '');
  const extension = (element) => EXT_STORE.find((item) => item.id === decode(element));
  const actions = {
    'close-google-info': () => document.getElementById('googleInfoModal')?.remove(),
    'external-google': (element) => {
      window.electronAPI.openExternal(decode(element));
      document.getElementById('googleInfoModal')?.remove();
    },
    external: (element) => window.electronAPI.openExternal(decode(element)),
    navigate: (element) => doNavigate(decode(element)),
    'visit-history': (element) => {
      doNavigate(decode(element));
      closeSpanel();
    },
    'clear-history': () => clearHist(),
    'downloads-folder': () => window.electronAPI.openDownloadsFolder(),
    'open-download': (element) => window.electronAPI.openDownload(decode(element)),
    'cancel-download': (element) => cancelDownload(decode(element)),
    'remove-download': (element) => removeDownload(decode(element)),
    'clear-downloads': () => clearAllDownloads(),
    'extension-store': () => openExtStore(),
    'toggle-extension': (element) => {
      const item = extension(element);
      if (item) return toggleExt(item.id, item.name, item.key || '', element);
    },
    'install-extension': (element) => {
      const item = extension(element);
      if (item) return installExt(item.id, item.name);
    },
    'custom-theme': () => useCustomTheme(),
    'reset-custom-theme': () => resetCustomTheme(),
    theme: (element) => applyThemeCard(decode(element), element),
    'search-engine': (element) => setSeCard(decode(element), element),
    'toggle-setting': (element) => toggleCfg(decode(element), element, element.dataset.label),
    'vertical-tabs': (element) => toggleVerticalTabs(element),
    'performance-mode': (element) => togglePerformanceMode(element),
    'clear-browsing-data': () => clearBrowsingData(),
    'check-update': () => manualCheckUpdate(),
    speedtest: () => startSpeedtest(),
    report: () => showReportModal(),
    'add-password': () => addPassword(),
    'copy-user': (element) => copyPwUser(Number(decode(element))),
    'copy-password': (element) => copyPwPass(Number(decode(element))),
    'delete-password': (element) => deletePw(Number(decode(element))),
    'new-note': () => newNote(),
    'edit-note': (element) => editNote(Number(decode(element))),
    'delete-note': (element, event) => {
      event.stopPropagation();
      deleteNote(Number(decode(element)));
    },
    'back-notes': () => backToNotes(),
    'save-note': () => saveNote(),
    'retry-tab': (element) => retryTab(Number(decode(element))),
    'remove-bookmark': (element) => removeBookmark(decode(element)),
    'close-tab': (element, event) => closeTab(event, element),
  };
  const inputs = {
    'theme-background': (element) => setCustomThemeColor('background', element.value),
    'theme-accent': (element) => setCustomThemeColor('accent', element.value),
    'font-size': (element) => changeFontSize(Number(element.value)),
    'memory-limit': (element) => changeRam(Number(element.value)),
  };
  function dispatch(event, attribute, handlers) {
    const element = event.target.closest?.(`[data-${attribute}]`);
    if (!element || element.disabled) return;
    const handler =
      Object.hasOwn(handlers, element.dataset[attribute]) && handlers[element.dataset[attribute]];
    if (!handler) return;
    try {
      Promise.resolve(handler(element, event)).catch((error) =>
        toast(error.message || 'İşlem tamamlanamadı.'),
      );
    } catch (error) {
      toast(error.message || 'İşlem tamamlanamadı.');
    }
  }
  // Capture preserves tab-close behavior before the parent tab's click handler.
  document.addEventListener('click', (event) => dispatch(event, 'action', actions), true);
  document.addEventListener('input', (event) => dispatch(event, 'input', inputs));
})();

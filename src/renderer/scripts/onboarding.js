var firstRunActive = false;
var firstRunSetupTabId = null;
var firstRunSurveyTabId = null;
var firstRunTheme = 'default';
var firstRunAccent = 'white';
var firstRunSearch = 'google';
var firstRunSource = null;
var firstRunWantsDefault = false;

function firstRunTabMarkup(icon, title) {
  return (
    '<span class="tab-fav"><svg class="icon"><use href="#i-' +
    icon +
    '"/></svg></span><span class="tab-title">' +
    title +
    '</span><button class="tab-x" aria-label="Sekmeyi kapat"><svg class="icon"><use href="#i-x"/></svg></button>'
  );
}

function configureFirstRunTab(tab, id, url, title, icon, active) {
  tab.className = 'tab first-run-tab' + (active ? ' active' : '');
  tab.dataset.id = id;
  tab.draggable = false;
  tab.innerHTML = firstRunTabMarkup(icon, title);
  tab.onclick = function () {
    selectTab(tab);
  };
  tab.querySelector('.tab-x').onclick = function (event) {
    closeTab(event, this);
  };
  tabData[id] = {
    wv: null,
    url: url,
    title: title,
    fav: icon === 'gear' ? '⚙' : '✦',
    canBack: false,
    canFwd: false,
    internal: true,
    lastActive: Date.now(),
  };
}

function createFirstRunSurveyTab() {
  var id = tabCnt++;
  var tab = document.createElement('div');
  configureFirstRunTab(tab, id, 'techbrowser://survey', 'Kısa Anket', 'sparkle', false);
  document.querySelector('.tab-new').before(tab);
  return id;
}

function showInternalFirstRunPage(url) {
  if (!firstRunActive || (url !== 'techbrowser://setup' && url !== 'techbrowser://survey'))
    return false;
  document.getElementById('newtab').classList.add('hidden');
  document.querySelectorAll('.wv-container').forEach(function (container) {
    container.classList.remove('active');
  });
  document.querySelectorAll('.first-run-page').forEach(function (page) {
    page.classList.remove('active');
  });
  var page = document.getElementById(
    url === 'techbrowser://setup' ? 'firstRunSetup' : 'firstRunSurvey',
  );
  page.classList.add('active');
  var address = document.getElementById('addr');
  address.value = url;
  address.readOnly = true;
  updateLockIcon(url);
  document.getElementById('btnBack').disabled = true;
  document.getElementById('btnFwd').disabled = true;
  return true;
}

function selectFirstRunTab(id) {
  var tab = document.querySelector('.tab[data-id="' + id + '"]');
  if (tab) selectTab(tab);
}

function updateFirstRunChoice(group, selector, value) {
  document.querySelectorAll(group + ' ' + selector).forEach(function (button) {
    button.classList.toggle(
      'selected',
      button.dataset.themeChoice === value || button.dataset.searchChoice === value,
    );
    button.setAttribute('aria-pressed', button.classList.contains('selected') ? 'true' : 'false');
  });
}

function updateFirstRunAccent(value) {
  document.querySelectorAll('[data-accent-choice]').forEach(function (button) {
    var selected = button.dataset.accentChoice === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function toggleFirstRunOther(show) {
  var container = document.getElementById('firstRunOther');
  var input = document.getElementById('firstRunOtherInput');
  container.classList.toggle('visible', show);
  container.setAttribute('aria-hidden', show ? 'false' : 'true');
  input.disabled = !show;
  if (show)
    requestAnimationFrame(function () {
      input.focus();
    });
}

function mergeImportedRows(current, imported) {
  var seen = new Set();
  return imported
    .concat(current)
    .filter(function (item) {
      if (!item || typeof item.url !== 'string' || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 200);
}

async function importFirstRunBrowserData() {
  var button = document.getElementById('firstRunImport');
  var status = document.getElementById('firstRunImportStatus');
  button.disabled = true;
  button.textContent = 'Aktarılıyor…';
  status.textContent = 'Tarayıcı profilleri okunuyor';
  try {
    var result = await window.electronAPI.invoke('import-browser-data');
    if (!result?.success) throw new Error(result?.error || 'Veriler okunamadı.');
    var importedBookmarks = Array.isArray(result.bookmarks) ? result.bookmarks : [];
    var importedHistory = Array.isArray(result.history) ? result.history : [];
    bookmarkList = mergeImportedRows(bookmarkList, importedBookmarks);
    hist = mergeImportedRows(hist, importedHistory);
    await saveAllData();
    renderBookmarks();
    var total = importedBookmarks.length + importedHistory.length;
    var source =
      Array.isArray(result.sources) && result.sources.length
        ? result.sources.join(', ')
        : 'uyumlu tarayıcı bulunamadı';
    status.textContent = total ? total + ' kayıt · ' + source : source;
    button.textContent = total ? 'Aktarıldı' : 'Bulunamadı';
  } catch (error) {
    status.textContent = error.message;
    button.textContent = 'Tekrar Dene';
    button.disabled = false;
  }
}

function bindFirstRunControls() {
  document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      firstRunTheme = button.dataset.themeChoice;
      updateFirstRunChoice('#firstRunThemes', '[data-theme-choice]', firstRunTheme);
      applyTheme(firstRunTheme, false);
    });
  });
  document.querySelectorAll('[data-accent-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      firstRunAccent = button.dataset.accentChoice;
      cfg.accentColor = firstRunAccent;
      updateFirstRunAccent(firstRunAccent);
      applyAccentChoice(firstRunAccent);
    });
  });
  document.querySelectorAll('[data-search-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      firstRunSearch = button.dataset.searchChoice;
      updateFirstRunChoice('#firstRunSearch', '[data-search-choice]', firstRunSearch);
    });
  });
  document.querySelectorAll('[data-source]').forEach(function (button) {
    button.addEventListener('click', function () {
      firstRunSource = button.dataset.source;
      document.querySelectorAll('[data-source]').forEach(function (option) {
        option.classList.toggle('selected', option === button);
        option.setAttribute('aria-pressed', option === button ? 'true' : 'false');
      });
      toggleFirstRunOther(firstRunSource === 'other');
      document.getElementById('firstRunFinish').disabled = false;
    });
  });
  document.getElementById('firstRunSave').addEventListener('click', saveFirstRunSetup);
  document.getElementById('firstRunImport').addEventListener('click', importFirstRunBrowserData);
  document.getElementById('firstRunSkipSetup').addEventListener('click', useFirstRunDefaults);
  document.getElementById('firstRunFinish').addEventListener('click', function () {
    completeFirstRun(firstRunSource);
  });
  document.getElementById('firstRunSkipSurvey').addEventListener('click', function () {
    completeFirstRun('skipped');
  });
}

async function saveFirstRunSetup() {
  var button = document.getElementById('firstRunSave');
  button.disabled = true;
  cfg.theme = firstRunTheme;
  cfg.accentColor = firstRunAccent;
  cfg.searchEngine = firstRunSearch;
  cfg.adBlock = document.getElementById('firstRunAdBlock').checked;
  firstRunWantsDefault = document.getElementById('firstRunDefaultBrowser').checked;
  applyTheme(cfg.theme, false);
  updateSeBadge();
  try {
    await applyBrowserSettings();
    await saveAllData();
    selectFirstRunTab(firstRunSurveyTabId);
  } catch (error) {
    toast('Ayarlar kaydedilemedi: ' + error.message);
  } finally {
    button.disabled = false;
  }
}

async function useFirstRunDefaults() {
  firstRunTheme = 'default';
  firstRunAccent = 'white';
  firstRunSearch = 'google';
  cfg.theme = 'default';
  cfg.accentColor = 'white';
  cfg.searchEngine = 'google';
  cfg.adBlock = true;
  firstRunWantsDefault = false;
  document.getElementById('firstRunAdBlock').checked = true;
  document.getElementById('firstRunDefaultBrowser').checked = false;
  applyTheme('default', false);
  updateFirstRunAccent('white');
  updateSeBadge();
  await saveAllData();
  selectFirstRunTab(firstRunSurveyTabId);
}

function leaveFirstRunPages() {
  [firstRunSetupTabId, firstRunSurveyTabId].forEach(function (id) {
    var tab = document.querySelector('.tab[data-id="' + id + '"]');
    if (tab) tab.remove();
    delete tabData[id];
  });
  document.querySelectorAll('.first-run-page').forEach(function (page) {
    page.classList.remove('active');
  });
  firstRunActive = false;
  document.getElementById('addr').readOnly = false;
  var remaining = document.querySelector('.tab');
  if (remaining) selectTab(remaining);
  else newTab(false);
}

async function completeFirstRun(source) {
  var finish = document.getElementById('firstRunFinish');
  finish.disabled = true;
  try {
    var result = await window.electronAPI.invoke('complete-onboarding', {
      source: source || 'skipped',
      sourceDetail: source === 'other' ? document.getElementById('firstRunOtherInput').value : '',
    });
    if (!result || !result.success) throw new Error(result?.error || 'Başlangıç tamamlanamadı.');
    leaveFirstRunPages();
    if (firstRunWantsDefault) {
      var defaultResult = await window.electronAPI.setDefaultBrowser();
      if (!defaultResult?.success)
        toast('Varsayılan tarayıcı seçimini Windows Ayarlar’dan tamamlayın.');
    }
    toast('TechBrowser hazır. Hoş geldiniz.');
  } catch (error) {
    finish.disabled = false;
    toast(error.message);
  }
}

async function initFirstRunExperience() {
  var status;
  try {
    status = await window.electronAPI.invoke('onboarding-status');
  } catch (error) {
    return;
  }
  if (!status || !status.required) return;
  firstRunActive = true;
  firstRunSetupTabId = 0;
  firstRunTheme = THEMES[cfg.theme] ? cfg.theme : 'default';
  firstRunAccent = ACCENT_CHOICES[cfg.accentColor] ? cfg.accentColor : 'white';
  firstRunSearch = SE[cfg.searchEngine] ? cfg.searchEngine : 'google';
  var firstTab = document.querySelector('.tab[data-id="0"]');
  configureFirstRunTab(
    firstTab,
    firstRunSetupTabId,
    'techbrowser://setup',
    'Başlangıç',
    'gear',
    true,
  );
  firstRunSurveyTabId = createFirstRunSurveyTab();
  updateFirstRunChoice('#firstRunThemes', '[data-theme-choice]', firstRunTheme);
  updateFirstRunAccent(firstRunAccent);
  updateFirstRunChoice('#firstRunSearch', '[data-search-choice]', firstRunSearch);
  applyAccentChoice(firstRunAccent);
  document.getElementById('firstRunAdBlock').checked = cfg.adBlock !== false;
  bindFirstRunControls();
  activeTabId = firstRunSetupTabId;
  showInternalFirstRunPage('techbrowser://setup');
}

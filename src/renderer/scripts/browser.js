// ══════════════════════════════════════════
//  WEBVIEW
// ══════════════════════════════════════════
function createWebview(tabId, url) {
  var container = document.createElement('div');
  container.className = 'wv-container';
  container.id = 'wvc-' + tabId;
  var lo = document.createElement('div');
  lo.className = 'loading-overlay on';
  lo.innerHTML =
    '<div class="ld-spinner"></div><div class="ld-url" id="ld-url-' +
    tabId +
    '">' +
    escHtml(url) +
    '</div>';
  var ep = document.createElement('div');
  ep.className = 'error-page';
  ep.id = 'err-' + tabId;
  ep.innerHTML =
    '<div class="error-icon"><svg class="icon"><use href="#i-globe"/></svg></div><div class="error-title">Sayfa yüklenemedi</div><div class="error-sub" id="err-msg-' +
    tabId +
    '">Sunucuya ulaşılamıyor.</div><div class="error-url" id="err-url-' +
    tabId +
    '"></div><button class="error-retry" data-action="retry-tab" data-value="' +
    tabId +
    '">Tekrar Dene</button>';
  var wv = document.createElement('webview');
  wv.src = url;
  wv.id = 'wv-' + tabId;
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=true, sandbox=true, javascript=true');
  // Webview UA ve partition
  if (tabData[tabId] && tabData[tabId].incognito) {
    // Gerçek gizli mod: kalıcı olmayan in-memory partition — hiçbir şey diske yazılmaz
    wv.setAttribute('partition', 'incognito');
    wv.setAttribute('useragent', navigator.userAgent);
  } else if (url && url.includes('yandex')) {
    wv.setAttribute('partition', 'persist:yandex');
    // Standart Chrome UA — Yandex Browser UA konum izni popup'ına neden oluyor
    wv.setAttribute('useragent', navigator.userAgent);
  } else if (
    url &&
    (url.includes('google.com') ||
      url.includes('youtube.com') ||
      url.includes('gmail.com') ||
      url.includes('googleapis.com'))
  ) {
    wv.setAttribute('partition', 'persist:google');
    wv.setAttribute('useragent', navigator.userAgent);
  } else {
    wv.setAttribute('useragent', navigator.userAgent);
  }
  // Beyaz arka plan engeli — webview yüklenene kadar koyu arka plan
  wv.style.cssText = 'width:100%;height:100%;border:none;display:flex;flex:1;background:#0a0a0f;';
  container.appendChild(lo);
  container.appendChild(ep);
  container.appendChild(wv);
  document.getElementById('wvContainers').appendChild(container);
  tabData[tabId].wv = wv;
  tabData[tabId].container = container;
  tabData[tabId].loadingOverlay = lo;
  tabData[tabId].errPage = ep;

  // Google hesap girişi gömülü Chromium'da reddedilir; güvenli sistem tarayıcısına aktar.
  wv.addEventListener('will-navigate', function (e) {
    var u = e.url || '';
    if (isEmbeddedGoogleAuthUrl(u)) {
      e.preventDefault && e.preventDefault();
      showGoogleLoginInfo(u);
    }
  });
  let loadDeadline;
  wv.addEventListener('dom-ready', () => {
    clearTimeout(loadDeadline);
    lo.classList.remove('on');
    applyPageFeatures(tabData[tabId]);
  });
  wv.addEventListener('did-start-loading', function () {
    clearTimeout(loadDeadline);
    loadDeadline = setTimeout(() => {
      if (!wv.isConnected) return;
      try {
        wv.stop();
      } catch {}
      if (tabData[tabId]) tabData[tabId].loading = false;
      lo.classList.remove('on');
      stopProg();
      ep.classList.add('on');
      document.getElementById('err-msg-' + tabId).textContent =
        'Sayfa 30 saniye içinde yanıt vermedi. Bağlantıyı kontrol edip yeniden deneyin.';
      document.getElementById('err-url-' + tabId).textContent = wv.src;
    }, 30000);
    if (tabData[tabId]) tabData[tabId].loading = true;
    lo.classList.add('on');
    ep.classList.remove('on');
    startProg();
    if (activeTabId === tabId) {
      document.getElementById('btnReload').innerHTML =
        '<svg viewBox="0 0 24 24" data-panel-style="panel-1"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    }
  });
  wv.addEventListener('did-stop-loading', function () {
    clearTimeout(loadDeadline);
    if (tabData[tabId]) tabData[tabId].loading = false;
    lo.classList.remove('on');
    stopProg();
    if (activeTabId === tabId) {
      document.getElementById('btnReload').innerHTML =
        '<svg viewBox="0 0 24 24" data-panel-style="panel-1"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    }
  });
  wv.addEventListener('did-navigate', function (e) {
    var u = e.url || '';
    if (u.includes('signin/rejected')) {
      showGoogleLoginInfo(u);
      if (wv.canGoBack()) wv.goBack();
      else showNewTab();
      return;
    }
    tabData[tabId]._lastNav = u;
    updateTabAfterNav(tabId, u);
  });
  wv.addEventListener('did-navigate-in-page', function (e) {
    if (e.isMainFrame) updateTabAfterNav(tabId, e.url);
  });
  wv.addEventListener('page-title-updated', function (e) {
    if (!tabData[tabId]) return;
    tabData[tabId].title = e.title;
    var te = document.querySelector('.tab[data-id="' + tabId + '"]');
    if (te) te.querySelector('.tab-title').textContent = e.title;
    if (activeTabId === tabId) document.title = e.title + ' — TechBrowser';
  });
  wv.addEventListener('page-favicon-updated', function (e) {
    if (e.favicons && e.favicons[0]) {
      var te = document.querySelector('.tab[data-id="' + tabId + '"]');
      if (te) {
        var fav = te.querySelector('.tab-fav');
        var img = document.createElement('img');
        img.src = e.favicons[0];
        img.style.cssText = 'width:14px;height:14px;border-radius:2px;object-fit:cover;';
        img.onerror = function () {
          fav.innerHTML = '<svg class="icon"><use href="#i-globe"/></svg>';
        };
        fav.innerHTML = '';
        fav.appendChild(img);
      }
    }
  });
  wv.addEventListener('did-fail-load', function (e) {
    if (e.errorCode === -3 || e.isMainFrame === false) return;
    clearTimeout(loadDeadline);
    if (tabData[tabId]) tabData[tabId].loading = false;
    lo.classList.remove('on');
    stopProg();
    if (activeTabId === tabId) {
      lo.classList.remove('on');
      ep.classList.add('on');
      document.getElementById('err-msg-' + tabId).textContent = getErrMsg(
        e.errorCode,
        e.errorDescription,
      );
      document.getElementById('err-url-' + tabId).textContent =
        e.validatedURL || tabData[tabId].url;
    }
  });
  wv.addEventListener('new-window', function (e) {
    var u = e.url || '';
    if (isEmbeddedGoogleAuthUrl(u)) {
      showGoogleLoginInfo(u);
    } else {
      newTab(false, u);
    }
  });
  wv.addEventListener('enter-html-full-screen', function () {
    window.electronAPI.fullscreen && window.electronAPI.fullscreen();
  });
  return wv;
}

function isEmbeddedGoogleAuthUrl(value) {
  try {
    var url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') return false;
    return (
      /^\/(?:v\d+\/)?signin(?:\/|$)/i.test(url.pathname) ||
      /^\/o\/oauth2(?:\/|$)/i.test(url.pathname) ||
      /^\/(?:ServiceLogin|AccountChooser)(?:\/|$)/i.test(url.pathname)
    );
  } catch (e) {
    return false;
  }
}

function getErrMsg(code, desc) {
  var m = {
    '-2': 'İnternet bağlantısı yok.',
    '-6': 'Bağlantı zaman aşımı.',
    '-100': 'Bağlantı reddedildi.',
    '-105': 'DNS bulunamadı.',
    '-106': 'İnternet yok.',
    '-200': 'Sertifika hatası.',
  };
  return m[String(code)] || desc || 'Bilinmeyen hata (' + code + ').';
}

function updateTabAfterNav(tabId, url) {
  if (!url || url === 'about:blank') return;
  tabData[tabId].url = url;
  var wv = tabData[tabId].wv;
  if (wv) {
    tabData[tabId].canBack = wv.canGoBack();
    tabData[tabId].canFwd = wv.canGoForward();
  }
  if (activeTabId === tabId) {
    document.getElementById('addr').value = url;
    updateLockIcon(url);
    updateNavButtons();
    if (cfg.saveHistory && !incognito && !tabData[tabId].incognito) {
      var title = tabData[tabId].title || url;
      var n = new Date();
      hist.unshift({
        icon: '◎',
        title,
        url,
        time: String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'),
      });
      if (hist.length > 200) hist.pop();
      saveAllData();
    }
  }
}
function updateLockIcon(url) {
  const lock = document.getElementById('lockIcon');
  if (url.startsWith('techbrowser://')) {
    lock.classList.remove('http');
    lock.title = 'TechBrowser sayfası';
    return;
  }
  const secure = url.startsWith('https://');
  lock.classList.toggle('http', !secure);
  lock.title = secure ? 'HTTPS bağlantısı' : 'HTTP · Şifrelenmemiş bağlantı';
}
function updateNavButtons() {
  var td = tabData[activeTabId];
  document.getElementById('btnBack').disabled = !(td && td.canBack);
  document.getElementById('btnFwd').disabled = !(td && td.canFwd);
}
function retryTab(id) {
  var td = tabData[id];
  if (!td) return;
  td.errPage && td.errPage.classList.remove('on');
  if (td.wv) td.wv.reload();
}

// ══════════════════════════════════════════
//  PROGRESS
// ══════════════════════════════════════════
var _pt;
function startProg() {
  var p = document.getElementById('prog');
  p.style.transition = 'none';
  p.style.width = '0%';
  requestAnimationFrame(() => {
    p.style.transition = 'width 1.5s cubic-bezier(.1,.4,.2,1)';
    p.style.width = '75%';
  });
}
function stopProg() {
  var p = document.getElementById('prog');
  clearTimeout(_pt);
  p.style.transition = 'width .25s ease';
  p.style.width = '100%';
  _pt = setTimeout(() => {
    p.style.transition = 'none';
    p.style.width = '0%';
  }, 300);
}

// ══════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════
var SUGS = [
  'github.com',
  'youtube.com',
  'google.com',
  'claude.ai',
  'figma.com',
  'notion.so',
  'vercel.com',
  'linear.app',
  'stackoverflow.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'openai.com',
  'discord.com',
  'netflix.com',
  'spotify.com',
  'amazon.com',
  'medium.com',
  'twitch.tv',
];

function showSug(v) {
  if (!v || v.length < 2 || v.startsWith('techbrowser://')) {
    hideSug();
    return;
  }
  var m = SUGS.filter((s) => s.includes(v.toLowerCase())).slice(0, 5);
  var el = document.getElementById('suggestions');
  if (!m.length) {
    hideSug();
    return;
  }
  el.innerHTML = m
    .map(
      (s) =>
        '<div class="sug-item" onmousedown="doNavigate(\'https://' +
        s +
        '\')"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        s +
        '</div>',
    )
    .join('');
  el.classList.add('on');
}
function hideSug() {
  document.getElementById('suggestions').classList.remove('on');
}
function updateSeBadge() {
  document.getElementById('seBadge').textContent = (SE[cfg.searchEngine] || SE.google).badge;
}
function handleAddr(e) {
  if (e.key === 'Enter') {
    hideSug();
    doNavigate(e.target.value);
    e.target.blur();
  }
  if (e.key === 'Escape') {
    hideSug();
    e.target.blur();
  }
}
function doSearch() {
  var v = document.getElementById('ntInput').value.trim();
  document.getElementById('ntInput').value = '';
  document.getElementById('ntInput').blur();
  if (v) {
    doNavigate(v);
  }
}

function doNavigate(raw) {
  if (!raw || !raw.trim()) return;
  var url = raw.trim();
  if (typeof showInternalFirstRunPage === 'function' && showInternalFirstRunPage(url)) return;
  if (url === 'techbrowser://newtab') {
    showNewTab();
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    if (url.match(/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/) && !url.includes(' ')) {
      url = 'https://' + url;
    } else {
      url = (SE[cfg.searchEngine] || SE.google).url + encodeInline(url);
    }
  }
  if (isEmbeddedGoogleAuthUrl(url)) {
    showGoogleLoginInfo(url);
    return;
  }
  hideNewTab();
  var td = tabData[activeTabId];
  if (!td) return;
  if (!td.wv) {
    createWebview(activeTabId, url);
    document.getElementById('wvc-' + activeTabId).classList.add('active');
  } else {
    // Yandex için user-agent set et
    if (url.includes('yandex')) {
      try {
        td.wv.setUserAgent(navigator.userAgent);
      } catch (e) {}
    }
    td.wv.src = url;
  }
  td.url = url;
  document.getElementById('addr').value = url;
  updateLockIcon(url);
}

function showNewTab() {
  document.querySelectorAll('.first-run-page').forEach((page) => page.classList.remove('active'));
  document.getElementById('newtab').classList.remove('hidden');
  document.getElementById('addr').value = 'techbrowser://newtab';
  document.getElementById('addr').readOnly = false;
  document.querySelectorAll('.wv-container').forEach((c) => c.classList.remove('active'));
  updateNavButtons();
}
function hideNewTab() {
  document.getElementById('newtab').classList.add('hidden');
  document.querySelectorAll('.first-run-page').forEach((page) => page.classList.remove('active'));
  var c = document.getElementById('wvc-' + activeTabId);
  if (c) c.classList.add('active');
}
function navBack() {
  var td = tabData[activeTabId];
  if (td && td.wv && td.wv.canGoBack()) td.wv.goBack();
}
function navFwd() {
  var td = tabData[activeTabId];
  if (td && td.wv && td.wv.canGoForward()) td.wv.goForward();
}
function reload() {
  var td = tabData[activeTabId];
  if (td && td.wv) {
    if (td.loading) td.wv.stop();
    else td.wv.reload();
  } else toast('Yenileniyor...');
}
function copyUrl() {
  navigator.clipboard
    .writeText(document.getElementById('addr').value)
    .then(() => toast('▤ URL kopyalandı'));
}
function openDevTools() {
  var td = tabData[activeTabId];
  if (td && td.wv) td.wv.openDevTools();
}
function bookmark() {
  var url = document.getElementById('addr').value;
  var title = tabData[activeTabId] ? tabData[activeTabId].title || url : url;
  if (bookmarkList.some((b) => b.url === url)) {
    toast('⚠ Bu sayfa zaten yer imlerinde');
    return;
  }
  bookmarkList.unshift({ url, title, time: new Date().toLocaleString('tr') });
  saveAllData();
  renderBookmarks();
  toast('★ Yer imine eklendi: ' + title.substring(0, 30));
}

// Yer imi çubuğunu render et — kullanıcı yer imleri + önerilen siteler
function renderBookmarks() {
  var bar = document.getElementById('bookmarkBar');
  if (!bar) return;
  var html = '';
  bookmarkList.slice(0, 30).forEach(function (b) {
    var enc = encodeInline(b.url);
    var encT = encodeInline(b.title || b.url);
    html +=
      '<div class="bk-wrap"><button class="bk" data-action="navigate" data-value="' +
      enc +
      '" title="' +
      escHtml(b.title || b.url).replace(/"/g, '&quot;') +
      '">' +
      escHtml(b.title || b.url) +
      '</button><button class="bk-x" data-action="remove-bookmark" data-value="' +
      enc +
      '" title="Yer imini sil"><svg class="icon"><use href="#i-x"/></svg></button></div>';
  });
  if (bookmarkList.length) {
    html += '<span class="bk-sep"></span>';
  }
  var DEF_BOOKMARKS = [
    ['GitHub', 'https://github.com'],
    ['YouTube', 'https://youtube.com'],
    ['Notion', 'https://notion.so'],
    ['Figma', 'https://figma.com'],
    ['Linear', 'https://linear.app'],
    ['Claude', 'https://claude.ai'],
    ['Vercel', 'https://vercel.com'],
    ['Twitter', 'https://x.com'],
  ];
  DEF_BOOKMARKS.forEach(function (d) {
    html +=
      '<button class="bk" data-action="navigate" data-value="' +
      encodeInline(d[1]) +
      '">' +
      d[0] +
      '</button>';
  });
  bar.innerHTML = html;
}
function removeBookmark(url) {
  bookmarkList = bookmarkList.filter(function (b) {
    return b.url !== url;
  });
  saveAllData();
  renderBookmarks();
  toast('Yer imi silindi');
}

// ══════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════
function selectTab(el) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
  if (tabData[activeTabId]) tabData[activeTabId].lastActive = Date.now();
  var id = parseInt(el.dataset.id);
  activeTabId = id;
  document.querySelectorAll('.wv-container').forEach((c) => c.classList.remove('active'));
  var td = tabData[id];
  if (!td) return;
  td.lastActive = Date.now();
  if (td.suspended) {
    td.suspended = false;
    el.classList.remove('sleeping');
    createWebview(id, td.url);
  }
  updateIncognitoUI();
  if (typeof showInternalFirstRunPage === 'function' && showInternalFirstRunPage(td.url)) {
    updateNavButtons();
    return;
  }
  if (td.url === 'techbrowser://newtab' || !td.wv) {
    showNewTab();
  } else {
    document.getElementById('newtab').classList.add('hidden');
    var c = document.getElementById('wvc-' + id);
    if (c) c.classList.add('active');
    document.getElementById('addr').value = td.url;
    document.getElementById('addr').readOnly = false;
    updateLockIcon(td.url);
  }
  updateNavButtons();
}

function closeTab(e, btn) {
  e.stopPropagation();
  var tab = btn.closest('.tab');
  if (tab.classList.contains('first-run-tab')) {
    toast('Başlangıcı sayfadaki düğmeyle tamamlayın veya atlayın.');
    return;
  }
  if (document.querySelectorAll('.tab').length <= 1) {
    toast('Son sekme kapatılamaz');
    return;
  }
  var tabId = parseInt(tab.dataset.id);
  var c = document.getElementById('wvc-' + tabId);
  if (c) c.remove();
  delete tabData[tabId];
  cleanupIncognitoIfEmpty();
  var wasActive = tab.classList.contains('active');
  tab.style.cssText =
    'transition:opacity .12s,min-width .15s,padding .15s;opacity:0;min-width:0;padding:0;overflow:hidden;';
  setTimeout(() => {
    tab.remove();
    if (wasActive) {
      var r = document.querySelectorAll('.tab');
      if (r.length) selectTab(r[r.length - 1]);
    }
  }, 150);
}

function newTab(isIncog, url) {
  var id = tabCnt++;
  var tab = document.createElement('div');
  tab.className = 'tab active';
  tab.dataset.id = id;
  tab.draggable = true;
  tab.onclick = function () {
    selectTab(tab);
  };
  tab.ondragstart = function (e) {
    tabDragStart(e, tab);
  };
  tab.ondragover = function (e) {
    tabDragOver(e, tab);
  };
  tab.ondragleave = function (e) {
    tabDragLeave(e, tab);
  };
  tab.ondrop = function (e) {
    tabDrop(e, tab);
  };
  tab.ondragend = function (e) {
    tabDragEnd(e, tab);
  };
  var label = isIncog ? 'Gizli Sekme' : 'Yeni Sekme';
  tab.innerHTML =
    '<span class="tab-fav"><svg class="icon"><use href="#i-' +
    (isIncog ? 'incog' : 'home') +
    '"/></svg></span><span class="tab-title">' +
    label +
    '</span><button class="tab-x" data-action="close-tab"><svg class="icon"><use href="#i-x"/></svg></button>';
  tab.style.opacity = '0';
  document.querySelector('.tab-new').before(tab);
  document.querySelectorAll('.tab').forEach((t) => {
    if (t !== tab) t.classList.remove('active');
  });
  requestAnimationFrame(() => {
    tab.style.transition = 'opacity .15s';
    tab.style.opacity = '1';
  });
  tabData[id] = {
    wv: null,
    url: 'techbrowser://newtab',
    title: label,
    fav: isIncog ? '◍' : '⌂',
    canBack: false,
    canFwd: false,
    incognito: !!isIncog,
    lastActive: Date.now(),
  };
  activeTabId = id;
  updateIncognitoUI();
  if (url) {
    doNavigate(url);
  } else {
    showNewTab();
    setTimeout(() => document.getElementById('ntInput').focus(), 100);
  }
}
async function newIncogTab() {
  await incognitoCleanup;
  newTab(true);
  toast('Gizli sekme açıldı.');
}

// ══════════════════════════════════════════
//  TAB DRAG & DROP
// ══════════════════════════════════════════
var dragSrcTab = null;
function tabDragStart(e, tab) {
  dragSrcTab = tab;
  tab.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tab.dataset.id);
}
function tabDragOver(e, tab) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (tab !== dragSrcTab) tab.classList.add('drag-over');
  return false;
}
function tabDragLeave(e, tab) {
  tab.classList.remove('drag-over');
}
function tabDrop(e, tab) {
  e.stopPropagation();
  tab.classList.remove('drag-over');
  if (!dragSrcTab || dragSrcTab === tab) return false;
  var tabs = [...document.getElementById('tabs').querySelectorAll('.tab')];
  var si = tabs.indexOf(dragSrcTab),
    di = tabs.indexOf(tab);
  if (si < 0 || di < 0) return false;
  if (si < di) tab.after(dragSrcTab);
  else tab.before(dragSrcTab);
  dragSrcTab.style.opacity = '1';
  return false;
}
function tabDragEnd(e, tab) {
  tab.classList.remove('dragging');
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('drag-over'));
  dragSrcTab = null;
}

// ══════════════════════════════════════════
//  ZOOM + FIND
// ══════════════════════════════════════════
var _zt;
function zoomIn() {
  zoom = Math.min(zoom + 10, 200);
  applyZoom();
}
function zoomOut() {
  zoom = Math.max(zoom - 10, 50);
  applyZoom();
}
function applyZoom() {
  var td = tabData[activeTabId];
  if (td && td.wv)
    try {
      td.wv.setZoomFactor(zoom / 100);
    } catch (e) {}
  var el = document.getElementById('zoomInd');
  el.textContent = zoom + '%';
  el.classList.add('on');
  clearTimeout(_zt);
  _zt = setTimeout(() => el.classList.remove('on'), 1800);
}
var _ft = 0;
function toggleFind() {
  findOpen = !findOpen;
  var fb = document.getElementById('findbar');
  if (findOpen) {
    fb.classList.add('on');
    document.getElementById('fiFind').focus();
  } else {
    fb.classList.remove('on');
    var inp = document.getElementById('fiFind');
    inp.value = '';
    inp.className = 'fi-find';
    document.getElementById('fiInfo').textContent = '';
    var td = tabData[activeTabId];
    if (td && td.wv)
      try {
        td.wv.stopFindInPage('clearSelection');
      } catch (e) {}
  }
}
function doFind(q) {
  var inp = document.getElementById('fiFind');
  if (!q) {
    inp.className = 'fi-find';
    document.getElementById('fiInfo').textContent = '';
    return;
  }
  var td = tabData[activeTabId];
  if (td && td.wv) {
    td.wv.findInPage(q, { findNext: false });
    td.wv.addEventListener('found-in-page', function h(e) {
      td.wv.removeEventListener('found-in-page', h);
      var res = e.result;
      if (!res.matches) {
        inp.className = 'fi-find notfound';
        document.getElementById('fiInfo').textContent = 'Bulunamadı';
      } else {
        inp.className = 'fi-find found';
        document.getElementById('fiInfo').textContent =
          (res.activeMatchOrdinal || 1) + '/' + res.matches;
      }
    });
  }
}
function findInPage(dir) {
  var q = document.getElementById('fiFind').value;
  if (!q) return;
  var td = tabData[activeTabId];
  if (td && td.wv) td.wv.findInPage(q, { findNext: true, forward: dir > 0 });
}

// ══════════════════════════════════════════
//  INCOGNITO
// ══════════════════════════════════════════
// Gizli mod ve okuyucu davranışları features.js içinde.

// ══════════════════════════════════════════
//  VPN
// ══════════════════════════════════════════
var vpnOn = false,
  vpnServer = { id: 'tr', flag: 'TR', name: 'Türkiye', ping: '3ms' };
function toggleVpnPopup() {
  var p = document.getElementById('vpnPopup');
  var wasOn = p.classList.contains('on');
  p.classList.toggle('on');
  if (!wasOn) refreshVpnPings();
}
function selectVpnServer(id, flag, name, ping) {
  if (vpnBusy || vpnOn) {
    toast('Sunucuyu değiştirmeden önce VPN bağlantısını kapatın.');
    return;
  }
  vpnServer = { id, flag, name, ping };
  document.querySelectorAll('.vpn-server').forEach((s) => s.classList.remove('active'));
  var s = document.getElementById('srv-' + id);
  if (s) s.classList.add('active');
  if (vpnOn) updateVpnUI();
}
var vpnBusy = false,
  vpnError = '';
async function toggleVpn() {
  if (vpnBusy) return;
  var api = window.electronAPI;
  if (!api || !api.vpnConnect || !api.vpnDisconnect) {
    toast('VPN hizmeti kullanılamıyor.');
    return;
  }
  vpnBusy = true;
  vpnError = '';
  updateVpnUI();
  try {
    var r = await (vpnOn ? api.vpnDisconnect() : api.vpnConnect(vpnServer.id || 'tr'));
    if (!r || !r.success) {
      vpnError = (r && r.error) || 'VPN işlemi başarısız';
      toast('⚠ ' + vpnError);
      return;
    }
    vpnOn = r.active === true;
    updateVpnUI();
    toast(vpnOn ? '✓ VPN Bağlandı — ' + vpnServer.name : 'Doğrudan bağlantı — VPN kapalı');
    if (r.warning) toast(r.warning);
  } catch (e) {
    vpnError = 'VPN işlemi başarısız: ' + e.message;
    toast(vpnError);
  } finally {
    vpnBusy = false;
    updateVpnUI();
  }
}
function updateVpnUI() {
  var dot = document.getElementById('vpnDot');
  var title = document.getElementById('vpnTitle');
  var sub = document.getElementById('vpnSub');
  var btn = document.getElementById('vpnToggleBtn');
  var vb = document.getElementById('vpnBtn');
  btn.disabled = vpnBusy;
  btn.setAttribute('aria-busy', String(vpnBusy));
  if (vpnBusy) {
    title.textContent = vpnOn ? 'Bağlantı kapatılıyor…' : 'Sunucuya bağlanılıyor…';
    sub.textContent = 'Sunucu kontrol ediliyor; en fazla 16 saniye sürebilir.';
    btn.textContent = 'Lütfen bekleyin…';
    return;
  }
  if (vpnOn) {
    dot.classList.add('connected');
    title.textContent = 'TechVPN — Aktif';
    sub.textContent = vpnServer.flag + ' ' + vpnServer.name + ' · ' + vpnServer.ping;
    btn.innerHTML = '<svg class="icon"><use href="#i-shield"/></svg>VPN\'i Kapat';
    btn.className = 'vpn-toggle on-state';
    vb.style.color = 'var(--gn)';
    vb.title = 'VPN Aktif: ' + vpnServer.name;
  } else {
    dot.classList.remove('connected');
    title.textContent = 'Proxy bağlantısı';
    sub.textContent =
      vpnError ||
      (vpnServer.id === 'tr' ? 'Türkiye seçeneği doğrudan bağlantı kullanır.' : 'Bağlı değil');
    btn.innerHTML = '<svg class="icon"><use href="#i-shield"/></svg>VPN\'i Aç';
    btn.className = 'vpn-toggle off';
    vb.style.color = '';
    vb.title = 'Proxy bağlantısı';
  }
}
document.addEventListener('click', function (e) {
  if (!e.target.closest('.vpn-wrap')) document.getElementById('vpnPopup').classList.remove('on');
});

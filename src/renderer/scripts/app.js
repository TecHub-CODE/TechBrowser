// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
// ══════════════════════════════════════════
//  KULLANICI SÖZLEŞMESİ
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  (async function initTerms() {
    // Daha önce kabul ettiyse gösterme — electronAPI üzerinden kontrol et
    try {
      var result = await window.electronAPI.termsStatus();
      if (result && result.accepted) {
        var ov = document.getElementById('termsOverlay');
        if (ov) ov.remove();
        return;
      }
    } catch (e) {
      toast('Koşul onayı okunamadı. Onayınızı yeniden kaydetmeyi deneyebilirsiniz.');
    }

    // Overlay'i göster
    var overlay = document.getElementById('termsOverlay');
    if (overlay) overlay.style.display = 'flex';

    // Scroll dinle + fallback
    var _termsUnlocked = false;
    function unlockTerms() {
      if (_termsUnlocked) return;
      _termsUnlocked = true;
      var hint = document.getElementById('termsHint');
      var row = document.getElementById('termsCheckRow');
      var cb = document.getElementById('termsCheck');
      if (hint) hint.classList.add('done');
      if (row) row.classList.add('unlocked');
      if (cb) cb.disabled = false;
    }
    var scroll = document.getElementById('termsScroll');
    if (scroll) {
      scroll.addEventListener('scroll', function () {
        var atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40;
        if (atBottom) unlockTerms();
      });
    }
    // 2 saniye sonra her durumda aç
    setTimeout(unlockTerms, 2000);

    // main process'ten show-terms gelebilir
    if (window.electronAPI && window.electronAPI.onShowTerms) {
      window.electronAPI.onShowTerms(function (data) {
        var ov = document.getElementById('termsOverlay');
        if (ov) {
          ov.style.display = 'flex';
          ov.style.opacity = '1';
        }
        if (data && data.updateRequired) {
          var title = document.getElementById('terms-title');
          var sub = document.getElementById('terms-sub');
          var badge = document.getElementById('terms-update-badge');
          if (title) title.textContent = 'Kullanım Koşulları Güncellendi';
          if (sub)
            sub.textContent =
              'Verilerin saklanması ve paylaşılması hakkındaki açıklamalar güncellendi.';
          if (badge) badge.style.display = 'block';
        }
      });
    }
  })();
});

function onTermsCheck() {
  var checked = document.getElementById('termsCheck').checked;
  var btn = document.getElementById('termsAcceptBtn');
  btn.disabled = !checked;
}

async function acceptTerms() {
  if (!document.getElementById('termsCheck').checked) return;
  try {
    var result = await window.electronAPI.acceptTerms();
    if (!result?.success) throw Error(result?.error || 'Onay kaydedilemedi.');
  } catch (error) {
    toast('Onay kaydedilemedi: ' + error.message);
    return;
  }
  var ov = document.getElementById('termsOverlay');
  ov.style.transition = 'opacity .4s';
  ov.style.opacity = '0';
  setTimeout(function () {
    ov.remove();
  }, 400);
}

async function init() {
  window.performanceMode = false;
  window.performanceModeConfigured = false;
  try {
    const performance = await window.electronAPI.invoke('performance-mode-status');
    window.performanceMode = performance?.active === true;
    window.performanceModeConfigured = performance?.configured === true;
    document.body.classList.toggle('performance-mode', window.performanceMode);
  } catch (error) {
    console.warn('Performans Kipi okunamadı.', error);
  }
  initAiKeys();
  try {
    var data = await window.electronAPI.loadData();
    if (data.cfg) cfg = Object.assign(cfg, data.cfg);
    if (Array.isArray(cfg.installedExtensions)) installedExt = new Set(cfg.installedExtensions);
    applyBrowserSettings().catch((e) => toast(e.message));
    if (data.hist) hist = data.hist;
    if (data.bookmarks) bookmarkList = data.bookmarks;
    if (data.users) window._users = data.users;
    try {
      var restored = await window.electronAPI.invoke('auth-profile');
      cu = restored.user;
      if (restored.error) toast(restored.error);
    } catch (e) {
      toast('Hesap oturumu yüklenemedi.');
    }
  } catch (e) {
    window._dataReadFailed = true;
    toast('Veriler okunamadı; üzerine yazma durduruldu. ' + e.message);
  }
  applyTheme(cfg.theme, false);
  if (window.performanceMode) cfg.smoothScroll = false;
  delete cfg.winStyle;
  document.documentElement.style.setProperty('--fs', cfg.fontSize + 'px');
  if (cfg.smoothScroll) document.body.classList.add('smooth-scroll');
  if (cfg.verticalTabs) document.body.classList.add('vertical-tabs');
  updateSeBadge();
  updateAccountUI();
  renderBookmarks();
  loadPasswords();
  window.electronAPI.on('new-tab-request', (p) => newTab(p.incognito, p.url));
  window.electronAPI.on('embedded-google-auth', (payload) => {
    if (payload && payload.url) showGoogleLoginInfo(payload.url);
  });

  window.electronAPI.onDownloadStarted &&
    window.electronAPI.onDownloadStarted(function (info) {
      addDownload({
        id: info.id,
        filename: info.filename,
        received: 0,
        total: info.totalBytes || 0,
        state: 'downloading',
      });
      if (curPanel === 'downloads') renderDownloads();
      // Bildirim toast
      toast('↓ İndiriliyor: ' + info.filename);
    });

  window.electronAPI.onDownloadProgress &&
    window.electronAPI.onDownloadProgress(function (info) {
      addDownload({
        id: info.id,
        filename: info.filename,
        received: info.receivedBytes || 0,
        total: info.totalBytes || 0,
        state: 'downloading',
      });
      if (curPanel === 'downloads') renderDownloads();
    });

  window.electronAPI.onDownloadDone &&
    window.electronAPI.onDownloadDone(function (info) {
      var st = info.state === 'completed' ? 'completed' : 'interrupted';
      addDownload({
        id: info.id,
        filename: info.filename,
        received: info.totalBytes || 0,
        total: info.totalBytes || 0,
        state: st,
        savePath: info.savePath,
      });
      if (curPanel === 'downloads') renderDownloads();
      if (st === 'completed') {
        toast('✓ İndirildi: ' + info.filename);
      } else {
        toast('✕ İndirme hatası: ' + info.filename);
      }
    });

  // Memory saving remains active without the status bar.
  setInterval(async function () {
    if (document.hidden || !window.electronAPI.getMemoryStats) return;
    try {
      const stats = await window.electronAPI.getMemoryStats();
      if (Number.isFinite(stats?.usedMB)) manageMemory(stats.usedMB);
    } catch (error) {
      console.warn('Bellek kullanımı okunamadı.', error);
    }
  }, 5000);

  tabData[0] = {
    wv: null,
    url: 'techbrowser://newtab',
    title: 'Yeni Sekme',
    fav: '⌂',
    canBack: false,
    canFwd: false,
  };
  if (typeof initFirstRunExperience === 'function') await initFirstRunExperience();
}

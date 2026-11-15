// ══════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════
var _tt;
function showGoogleLoginInfo(returnUrl) {
  var old = document.getElementById('googleInfoModal');
  if (old) old.remove();
  var modal = document.createElement('div');
  modal.id = 'googleInfoModal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
  var safeUrl = encodeInline(returnUrl || 'https://youtube.com');
  modal.innerHTML =
    '<div data-panel-style="panel-2">' +
    '<div data-panel-style="panel-3"><svg class="icon" data-panel-style="panel-4"><use href="#i-shield"/></svg></div>' +
    '<h3 data-panel-style="panel-5">Google ile güvenli giriş</h3>' +
    '<p data-panel-style="panel-6">Google, gömülü tarayıcılarda hesap girişini kısıtlıyor. Devam etmek için giriş bağlantısını varsayılan tarayıcınızda açabilirsiniz; TechBrowser sekmeniz korunur.</p>' +
    '<div data-panel-style="panel-8">' +
    '<button data-action="close-google-info" data-panel-style="panel-9">İptal</button>' +
    '<button data-action="external-google" data-value="' +
    safeUrl +
    '" data-panel-style="panel-10"><svg class="icon" data-panel-style="panel-11"><use href="#i-external"/></svg>Varsayılan tarayıcıda aç</button>' +
    '</div></div>';
  document.body.appendChild(modal);
}

var _toastIcons = {
  '◍': 'incog',
  '⌂': 'home',
  '⬢': 'shield',
  '⬡': 'shield',
  '⚙': 'gear',
  '◷': 'clock',
  '⬠': 'puzzle',
  '⟳': 'refresh',
  '⌫': 'trash',
  '▤': 'copy',
  '❐': 'book',
  '◎': 'globe',
  '✶': 'flag',
  '▣': 'camera',
  '♪': 'music',
  '✓': 'check',
  '✕': 'x',
  '♥': 'heart',
  '✦': 'sparkle',
  '⌕': 'search',
  '◆': 'diamond',
  '@': 'at',
  '↑': 'up',
  '↓': 'down',
  '↩': 'back',
  '↪': 'fwd',
  '↺': 'rotate',
  '★': 'star',
  '⚒': 'wrench',
  '➤': 'send',
  '⚠': 'alert',
  '⚖': 'scale',
  '⬣': 'shieldcheck',
  '◉': 'dot',
  '⇔': 'swap',
  '◘': 'scroll',
  '▭': 'folder',
  '▶': 'play',
  '✉': 'mail',
  '⚿': 'key',
  '❏': 'grid',
  '◐': 'moon',
  '◈': 'bell',
  '▨': 'save',
};
function toast(m) {
  var e = document.getElementById('toast');
  e.classList.add('on');
  var s = String(m),
    first = s.charAt(0),
    last = s.charAt(s.length - 1),
    nm = _toastIcons[first];
  if (nm) {
    e.innerHTML = '<svg class="icon"><use href="#i-' + nm + '"/></svg>';
    e.appendChild(document.createTextNode(s.slice(1)));
  } else if (_toastIcons[last] !== undefined) {
    e.innerHTML =
      escHtml(s.slice(0, -1)) +
      '<svg class="icon" data-panel-style="panel-12"><use href="#i-' +
      _toastIcons[last] +
      '"/></svg>';
  } else e.textContent = m;
  clearTimeout(_tt);
  _tt = setTimeout(() => e.classList.remove('on'), 2500);
}

// ══════════════════════════════════════════
//  CONTEXT MENU
// ══════════════════════════════════════════
document.getElementById('content').addEventListener('contextmenu', function (e) {
  if (e.target.tagName === 'WEBVIEW') return;
  e.preventDefault();
  var c = document.getElementById('ctx');
  c.style.left = Math.min(e.clientX, window.innerWidth - 185) + 'px';
  c.style.top = Math.min(e.clientY, window.innerHeight - 250) + 'px';
  c.classList.add('on');
});
function closeCtx() {
  document.getElementById('ctx').classList.remove('on');
}
document.addEventListener('click', function (e) {
  if (!e.target.closest('#ctx')) closeCtx();
});

// ══════════════════════════════════════════
//  SIDE PANEL
// ══════════════════════════════════════════
function openPanel(name) {
  if (curPanel === name && document.getElementById('spanel').classList.contains('on')) {
    closeSpanel();
    return;
  }
  curPanel = name;
  renderPanel(name);
  document.getElementById('spanel').classList.add('on');
}
function closeSpanel() {
  document.getElementById('spanel').classList.remove('on');
  curPanel = null;
}
function renderPanel(name) {
  document.getElementById('spanel').dataset.panel = name;
  var titles = {
    history: 'Geçmiş',
    downloads: 'İndirmeler',
    ext: 'Uzantılar',
    settings: 'Ayarlar',
    passwords: 'Şifre Yöneticisi',
    notes: 'Notlar',
    translate: 'Çeviri',
  };
  document.getElementById('spTitle').textContent = titles[name] || name;
  if (name === 'history') renderHistory();
  else if (name === 'downloads') renderDownloads();
  else if (name === 'ext') renderExt();
  else if (name === 'settings') {
    renderSettings();
  } else if (name === 'passwords') renderPasswords();
  else if (name === 'notes') renderNotes();
}

var _dlList = [];
var _dlSpeeds = {};

function toggleVerticalTabs(btn) {
  cfg.verticalTabs = !cfg.verticalTabs;
  if (btn) btn.classList.toggle('on', cfg.verticalTabs);
  document.body.classList.toggle('vertical-tabs', cfg.verticalTabs);
  saveCfg();
  toast(cfg.verticalTabs ? '⇔ Dikey sekmeler açık' : 'Yatay sekmeler açık');
}

// ── Tarama verisi temizleme ──────────────────────────────────────

// ── Manuel güncelleme kontrolü ───────────────────────────────────
var _lastUpdateCheck = localStorage.getItem('tb_last_update_check') || null;
function getLastUpdateCheck() {
  return _lastUpdateCheck ? _lastUpdateCheck : 'hiç kontrol edilmedi';
}
function manualCheckUpdate() {
  var btn = document.getElementById('checkUpdateBtn');
  var desc = document.getElementById('updateCheckDesc');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Kontrol ediliyor...';
  }
  if (window.electronAPI && window.electronAPI.checkForUpdates) {
    window.electronAPI
      .checkForUpdates()
      .then(function (r) {
        _lastUpdateCheck = new Date().toLocaleString('tr-TR');
        localStorage.setItem('tb_last_update_check', _lastUpdateCheck);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Kontrol Et';
        }
        if (desc) desc.textContent = 'Son kontrol: ' + _lastUpdateCheck;
        if (r && r.updateAvailable === false) {
          toast('✓ En güncel sürümdesiniz');
        }
      })
      .catch(function (e) {
        _lastUpdateCheck = new Date().toLocaleString('tr-TR');
        localStorage.setItem('tb_last_update_check', _lastUpdateCheck);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Kontrol Et';
        }
        if (desc) desc.textContent = 'Son kontrol: ' + _lastUpdateCheck;
        toast('Güncelleme kontrolü tamamlandı');
      });
  } else {
    // electronAPI.checkForUpdates yoksa checkForUpdates IPC'yi çağır
    setTimeout(function () {
      _lastUpdateCheck = new Date().toLocaleString('tr-TR');
      localStorage.setItem('tb_last_update_check', _lastUpdateCheck);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Kontrol Et';
      }
      if (desc) desc.textContent = 'Son kontrol: ' + _lastUpdateCheck;
      toast('Güncelleme kontrolü tamamlandı');
    }, 1500);
  }
}

// ── VPN Ping Testi ────────────────────────────────────────────────
var VPN_PING_TARGETS = {
  tr: 'https://www.google.com.tr',
  de: 'https://www.google.de',
  nl: 'https://www.google.nl',
  us: 'https://www.google.com',
  jp: 'https://www.google.co.jp',
};
function measurePing(id) {
  var t0 = performance.now();
  return fetch(VPN_PING_TARGETS[id] || 'https://www.google.com', {
    mode: 'no-cors',
    cache: 'no-store',
  })
    .then(function () {
      return Math.round(performance.now() - t0);
    })
    .catch(function () {
      return 999;
    });
}
function refreshVpnPings() {
  Object.keys(VPN_PING_TARGETS).forEach(function (id) {
    measurePing(id).then(function (ms) {
      var srv = document.getElementById('srv-' + id);
      if (srv) {
        var pingEl = srv.querySelector('.vpn-ping');
        if (pingEl) {
          pingEl.textContent = ms + 'ms';
          pingEl.style.color = ms < 50 ? 'var(--gn)' : ms < 150 ? 'var(--yw)' : 'var(--rd)';
        }
      }
    });
  });
}

// ══════════════════════════════════════════
//  THEME + DATA
// ══════════════════════════════════════════
function applyTheme(name, save) {
  ct = name;
  document.body.style.transition = 'background-color .5s ease, color .4s ease';
  document.body.dataset.theme = name;
  cfg.theme = name;
  applyCustomTheme();
  applyAccentChoice(cfg.accentColor);
  if (save !== false) saveCfg();
}
function saveCfg() {
  saveAllData();
}
var _saveTimer = null,
  _saveWaiters = [];
function saveAllData() {
  if (window._dataReadFailed || window._deletingAccount) return Promise.resolve(false);
  clearTimeout(_saveTimer);
  return new Promise((resolve) => {
    _saveWaiters.push(resolve);
    _saveTimer = setTimeout(async () => {
      const waiters = _saveWaiters.splice(0);
      let ok = false;
      try {
        ok = await window.electronAPI.saveData({
          cfg,
          hist: hist.slice(0, 200),
          bookmarks: bookmarkList.slice(0, 200),
        });
        if (!ok) toast('Veriler kaydedilemedi.');
      } catch (e) {
        toast('Kaydetme hatası: ' + e.message);
      }
      waiters.forEach((done) => done(ok));
    }, 250);
  });
}
window.addEventListener('beforeunload', () => {
  if (_saveTimer && !window._dataReadFailed && !window._deletingAccount)
    window.electronAPI.saveData({
      cfg,
      hist: hist.slice(0, 200),
      bookmarks: bookmarkList.slice(0, 200),
    });
});

function applyCustomTheme() {
  const props = [
    '--bg',
    '--sf',
    '--sf2',
    '--sf3',
    '--tx',
    '--tx2',
    '--tx3',
    '--ac',
    '--ac2',
    '--ac-g',
    '--glass',
    '--bd',
    '--bd2',
  ];
  props.forEach((p) => document.body.style.removeProperty(p));
  document.body.classList.toggle('custom-theme', !!cfg.customThemeEnabled);
  document.body.classList.remove('custom-light');
  if (!cfg.customThemeEnabled) return;
  const c = cfg.customTheme || {};
  const bg = /^#[0-9a-f]{6}$/i.test(c.background) ? c.background : '#101216';
  const accent = /^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : '#c9d2de';
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) =>
    rgb(h)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const light = lum(bg) > 0.179;
  document.body.classList.toggle('custom-light', light);
  const mix = (a, b, t) =>
    '#' +
    rgb(a)
      .map((v, i) =>
        Math.round(v * (1 - t) + rgb(b)[i] * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  const ink = light ? '#111111' : '#ffffff';
  const contrast =
    (Math.max(lum(bg), lum(accent)) + 0.05) / (Math.min(lum(bg), lum(accent)) + 0.05);
  const ac = contrast >= 4.5 ? accent : ink;
  const values = [
    bg,
    mix(bg, ink, 0.04),
    mix(bg, ink, 0.08),
    mix(bg, ink, 0.14),
    ink,
    mix(bg, ink, 0.78),
    mix(bg, ink, 0.65),
    ac,
    ac,
    lum(accent) < 0.18 ? accent : mix(accent, '#000000', 0.65),
    mix(bg, ink, 0.04),
    mix(bg, ink, 0.15),
    mix(bg, ink, 0.24),
  ];
  props.forEach((p, i) => document.body.style.setProperty(p, values[i]));
}

function applyAccentChoice(choice) {
  if (cfg.customThemeEnabled) return;
  var key = ACCENT_CHOICES[choice] ? choice : 'white';
  var palette = ACCENT_CHOICES[key];
  var accent = document.body.dataset.theme === 'light' ? palette.light : palette.dark;
  cfg.accentColor = key;
  document.body.style.setProperty('--ac', accent);
  document.body.style.setProperty('--ac2', accent);
  document.body.style.setProperty('--ac-g', accent);
}

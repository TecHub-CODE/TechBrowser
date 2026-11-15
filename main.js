const { app, BrowserWindow, ipcMain, session, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { browserSessions, installPermissions, setBrowserProxy } = require('./src/session-policy');
const { importBrowserData } = require('./src/browser-import');

const PERFORMANCE_MODE_PATH = path.join(app.getPath('userData'), 'performance-mode.json');
function readPerformanceMode() {
  try {
    return JSON.parse(fs.readFileSync(PERFORMANCE_MODE_PATH, 'utf8')).enabled === true;
  } catch {
    return false;
  }
}
function writePerformanceMode(enabled) {
  fs.mkdirSync(path.dirname(PERFORMANCE_MODE_PATH), { recursive: true });
  const temp = PERFORMANCE_MODE_PATH + '.tmp';
  fs.writeFileSync(
    temp,
    JSON.stringify({ enabled: enabled === true, updatedAt: new Date().toISOString() }),
  );
  fs.renameSync(temp, PERFORMANCE_MODE_PATH);
}
const performanceModeActive = readPerformanceMode();
if (performanceModeActive) {
  // Measured on the same machine: idle private memory 462 MB -> 138 MB.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

// Auto-updater (electron-updater paketi gerekli: npm install electron-updater)
let autoUpdater;
try {
  const windowsKernelMajor = process.platform === 'win32' ? Number(os.release().split('.')[0]) : 10;
  const legacyWindows = process.platform === 'win32' && windowsKernelMajor < 10;
  if (app.isPackaged && !legacyWindows) autoUpdater = require('electron-updater').autoUpdater;
  if (legacyWindows) {
    console.warn('[AutoUpdater] Windows 8.1 legacy sürümünde otomatik güncelleme kapalı.');
  }
  if (autoUpdater) {
    autoUpdater.autoDownload = false; // Manuel indirme — kullanıcı onaylar
    autoUpdater.autoInstallOnAppQuit = true;
  }
} catch (e) {
  console.warn('[AutoUpdater] electron-updater yüklü değil:', e.message);
}

// ══════════════════════════════════════════
//  ORTAM DEĞİŞKENLERİ — İlk satırda yükle
// ══════════════════════════════════════════
const envPath = app.isPackaged
  ? path.join(app.getPath('userData'), '.env')
  : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

// ══════════════════════════════════════════
//  SMTP & SABITLER — .env'den al
// ══════════════════════════════════════════
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};
const MAIL_FROM = process.env.MAIL_FROM || '"TechBrowser" <noreply@techbrowser.app>';
// 🔒 DÜZELTİLDİ: Secret artık .env'den geliyor, kaynak kodda yok
const publicServices = require('./src/service-config.json');
const hostedService = require('./src/hosted-service').createHostedService({
  baseUrl: process.env.TECHBROWSER_API_URL || publicServices.apiBaseUrl,
});
const hostedAiService =
  require('./src/hosted-service').createHostedService({
    baseUrl: process.env.TECHBROWSER_AI_API_URL || publicServices.aiBaseUrl,
  }) || hostedService;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || publicServices.googleClientId || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.warn('[UYARI] .env: SMTP_USER veya SMTP_PASS eksik!');
}
if (!GOOGLE_CLIENT_ID || (!hostedService && !GOOGLE_CLIENT_SECRET)) {
  console.warn('[UYARI] .env: GOOGLE_CLIENT_ID veya GOOGLE_CLIENT_SECRET eksik!');
}

// ══════════════════════════════════════════
//  CHROMİUM FLAGS — Sadece gerekli olanlar
//  🔒 DÜZELTİLDİ: disable-web-security, ignore-certificate-errors,
//                  allow-running-insecure-content KALDIRILDI
// ══════════════════════════════════════════
// 🔒 v2.9.0: SameSite cookie koruması geri açıldı — CSRF saldırılarına karşı
// Eski: disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure KALDIRILDI
// 🔒 v2.8.0: no-sandbox KALDIRILDI — güvenlik iyileştirmesi
// 🔒 v2.8.0: disable-site-isolation KALDIRILDI — siteler arası izolasyon aktif
// Prefer compact V8 code/heap decisions without imposing a heap limit on pages.
app.commandLine.appendSwitch('js-flags', '--optimize-for-size');
app.commandLine.appendSwitch(
  'user-agent',
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
);

// ══════════════════════════════════════════
//  TEK PENCERE
// ══════════════════════════════════════════
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.setName('TechBrowser02');

// ══════════════════════════════════════════
//  IPC RATE LIMITING — Global scope
// ══════════════════════════════════════════
const ipcRateLimit = new Map();
function checkRateLimit(channel, key, maxPerMinute = 10) {
  const mapKey = `${channel}:${key}`;
  const now = Date.now();
  const entry = ipcRateLimit.get(mapKey);
  if (!entry || now > entry.resetAt) {
    ipcRateLimit.set(mapKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  if (entry.count > maxPerMinute) return false;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipcRateLimit.entries()) {
    if (now > v.resetAt) ipcRateLimit.delete(k);
  }
}, 5 * 60_000);

// ══════════════════════════════════════════
//  İZİN YÖNETİMİ
// ══════════════════════════════════════════
// ══════════════════════════════════════════
//  NAVİGASYON GÜVENLİĞİ — Harici linkleri filtrele
//  🔒 YENİ: Renderer'dan gelen navigate isteklerini kısıtla
// ══════════════════════════════════════════
const APP_URL = require('url').pathToFileURL(
  path.join(__dirname, 'src', 'renderer', 'index.html'),
).href;
const ALLOWED_INTERNAL = { test: (url) => url === APP_URL };
const { TERMS_VERSION, ONBOARDING_VERSION } = require('./src/app-config');
const { isEmbeddedGoogleAuthUrl } = require('./src/navigation-policy');

function applyNavigationGuard(webContents) {
  webContents.on('will-navigate', (event, url) => {
    // Ana renderer sadece kendi dosyalarına navigate edebilir
    if (!ALLOWED_INTERNAL.test(url)) {
      event.preventDefault();
    }
  });
  // Yeni pencere açma isteklerini yakala
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

let mainWindow;
const guestContents = new Map();
let siteSettings = { adBlock: true, spellcheck: true, notifications: false };
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) =>
  originalHandle(channel, (event, ...args) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      event.senderFrame.url !== APP_URL
    )
      throw new Error('Yetkisiz uygulama isteği.');
    return handler(event, ...args);
  });
const originalOn = ipcMain.on.bind(ipcMain);
ipcMain.on = (channel, handler) =>
  originalOn(channel, (event, ...args) => {
    if (
      mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      event.senderFrame.url === APP_URL
    )
      handler(event, ...args);
  });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // ✅ açık
      nodeIntegration: false, // ✅ kapalı
      webviewTag: true,
      webSecurity: true, // 🔒 true
      allowRunningInsecureContent: false, // 🔒 false
      sandbox: true, // Guest pages remain isolated from Node.js.
      // 🔒 YENİ: ek güvenlik
      navigateOnDragDrop: false,
      autoplayPolicy: 'user-gesture-required', // intro videosu sesli otomatik oynasın
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  applyNavigationGuard(mainWindow.webContents);
  mainWindow.webContents.on('will-attach-webview', (event, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    if (!/^https?:\/\//i.test(params.src || '')) event.preventDefault();
  });
  mainWindow.webContents.on('did-attach-webview', (_, guest) => {
    guestContents.set(guest.id, guest);
    guest.once('destroyed', () => guestContents.delete(guest.id));
    const routeGoogleAuth = (event, url, _isInPlace, isMainFrame) => {
      if (isMainFrame === false || !isEmbeddedGoogleAuthUrl(url)) return;
      event.preventDefault();
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('embedded-google-auth', { url });
    };
    guest.on('will-navigate', routeGoogleAuth);
    guest.on('will-redirect', routeGoogleAuth);
    guest.setWindowOpenHandler(({ url }) => {
      if (isEmbeddedGoogleAuthUrl(url)) {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('embedded-google-auth', { url });
      } else if (/^https?:\/\//i.test(url))
        mainWindow.webContents.send('new-tab-request', {
          url,
          incognito: !guest.session.isPersistent(),
        });
      return { action: 'deny' };
    });
  });

  mainWindow.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
  );

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!global.termsAccepted) {
      mainWindow.webContents.send('show-terms', {
        updateRequired: global.termsUpdateRequired === true,
      });
    }
  });
}

// ══════════════════════════════════════════
//  HEADER YÖNETİMİ — Sadece gerekli headerları kaldır
//  🔒 DÜZELTİLDİ: CSP ve X-Content-Type-Options artık
//     silinmiyor, sadece X-Frame-Options kaldırılıyor
// ══════════════════════════════════════════
function applySessionHeaders(targetSession, isYandex = false) {
  const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url || '';
    details.requestHeaders['User-Agent'] = CHROME_UA;

    if (
      url.includes('google.com') ||
      url.includes('youtube.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      url.includes('accounts.google')
    ) {
      details.requestHeaders['sec-ch-ua'] =
        `"Chromium";v="${process.versions.chrome.split('.')[0]}", "Not A(Brand";v="99", "Google Chrome";v="${process.versions.chrome.split('.')[0]}"`;
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
      details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
      // Electron izlerini sil
      delete details.requestHeaders['X-Electron-Version'];
      delete details.requestHeaders['Electron-Version'];
      delete details.requestHeaders['x-electron-version'];
    }

    if (isYandex) {
      details.requestHeaders['Accept-Language'] = 'tr-TR,tr;q=0.9,en;q=0.8';
    }

    callback({ requestHeaders: details.requestHeaders });
  });
}

app.whenReady().then(async () => {
  // ── Settings yükle ──────────────────────────────────────────────────────
  const storePath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
  const settingsExisted = fs.existsSync(storePath);
  let appSettings = {};
  try {
    appSettings = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (e) {}

  global.termsAccepted = appSettings.termsAccepted === true;
  if (!settingsExisted) appSettings.onboardingPending = true;
  global.onboardingRequired =
    appSettings.onboardingPending === true && appSettings.onboardingVersion !== ONBOARDING_VERSION;

  // ── v2.8.0: Kullanım koşulları güncellendi — tek seferlik yeniden kabul ──
  // Sadece v2.8.0'a özel, sonraki sürümlerde tekrar açılmaz
  const TERMS_UPDATE_VERSION = TERMS_VERSION;
  if (global.termsAccepted && appSettings.termsAcceptedVersion !== TERMS_UPDATE_VERSION) {
    // Eski kullanıcı var ama yeni koşulları kabul etmemiş
    global.termsAccepted = false;
    global.termsUpdateRequired = true; // UI'da "güncellendi" mesajı göster
  }

  // ── Varsayılan tarayıcı sorusu ──────────────────────────────────────────
  if (!appSettings.defaultBrowserAsked && app.isPackaged && !global.onboardingRequired) {
    appSettings.defaultBrowserAsked = true;
    try {
      fs.writeFileSync(storePath, JSON.stringify(appSettings));
    } catch (e) {}

    setTimeout(() => {
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        title: 'TechBrowser02',
        message: "TechBrowser02'yi varsayılan tarayıcı olarak ayarlamak ister misiniz?",
        buttons: ['Evet, ayarla', 'Hayır, şimdi değil'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice === 0) {
        app.setAsDefaultProtocolClient('http');
        app.setAsDefaultProtocolClient('https');
        if (process.platform === 'win32') {
          require('child_process').exec('start ms-settings:defaultapps');
          setTimeout(() => {
            dialog.showMessageBoxSync({
              type: 'info',
              title: 'TechBrowser02',
              message: 'Nasıl ayarlanır?',
              detail:
                '1. Açılan Ayarlar sayfasında "TechBrowser" yaz\n2. TechBrowser02\'ye tıkla\n3. Varsayılan olarak ayarla butonuna bas',
              buttons: ['Anladım'],
            });
          }, 800);
        }
      }
    }, 2000);
  }

  // ── Session ayarları ────────────────────────────────────────────────────
  const ses = session.defaultSession;

  browserSessions(session).forEach((s) => {
    s.webRequest.onBeforeRequest((details, callback) => {
      const embeddedGoogleAuth =
        details.resourceType === 'mainFrame' &&
        guestContents.has(details.webContentsId) &&
        isEmbeddedGoogleAuthUrl(details.url);
      if (embeddedGoogleAuth && mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('embedded-google-auth', { url: details.url });
      callback({
        cancel:
          embeddedGoogleAuth ||
          require('./src/site-rules').shouldBlock(
            details.url,
            siteSettings.adBlock,
            details.resourceType,
          ),
      });
    });
  });

  applySessionHeaders(ses);

  const yandexSes = session.fromPartition('persist:yandex');
  applySessionHeaders(yandexSes, true);

  ['persist:default', 'persist:google', 'persist:youtube'].forEach((p) => {
    applySessionHeaders(session.fromPartition(p));
  });

  // VPN proxy kalıntısı kalmasın — uygulama her açılışta direkt bağlantıyla başlar
  await setBrowserProxy(session, { mode: 'direct' });

  createWindow();

  browserSessions(session).forEach((s) =>
    installPermissions(
      s,
      () => mainWindow,
      dialog,
      () => siteSettings,
    ),
  );

  // Tüm webview session'larına indirme handler'ı ekle
  const allSessions = browserSessions(session);
  const downloads = require('./src/downloads').createDownloads(
    app.getPath('downloads'),
    (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
    },
  );
  allSessions.forEach((s) => s.on('will-download', (_, item) => downloads.attach(item)));
  ipcMain.handle('cancel-download', (_, id) => ({ success: downloads.cancel(id) }));
  ipcMain.handle('site-settings', (_, value = {}) => {
    siteSettings = {
      adBlock: value.adBlock !== false,
      spellcheck: value.spellcheck !== false,
      notifications: value.notifications === true,
    };
    browserSessions(session).forEach((s) => s.setSpellCheckerEnabled(siteSettings.spellcheck));
    return { success: true };
  });
  ipcMain.handle('can-suspend-tab', (_, id) => {
    const guest = guestContents.get(id);
    return (
      !!guest &&
      !guest.isDestroyed() &&
      !guest.isCurrentlyAudible() &&
      !guest.__capturePermissionGranted &&
      downloads.size === 0
    );
  });
  ipcMain.handle('capture-page', async (_, id) => {
    const guest = guestContents.get(id);
    if (!guest || guest.isDestroyed()) return { success: false, error: 'Sekme bulunamadı.' };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(app.getPath('pictures'), 'TechBrowser.png'),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled) return { success: false };
    try {
      const image = await guest.capturePage();
      fs.writeFileSync(result.filePath, image.toPNG());
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── GROQ AI QUERY — Main process üzerinden güvenli sorgulama ──────────
  const groqQuery = require('./src/groq').createGroq({ apiKey: GROQ_API_KEY });
  ipcMain.handle('groq-query', async (_, messages) => {
    try {
      return { success: true, reply: await groqQuery(messages) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── VARSAYILAN TARAYICI SORGULA & AYARLA ─────────────────────────────────
  ipcMain.handle('is-default-browser', () => {
    try {
      return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https');
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('set-default-browser', () => {
    try {
      const res1 = app.setAsDefaultProtocolClient('http');
      const res2 = app.setAsDefaultProtocolClient('https');
      if (process.platform === 'win32') {
        require('child_process').exec('start ms-settings:defaultapps');
      }
      return { success: res1 && res2 };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── UYGULAMA SÜRÜMÜ — v2.7.0 ─────────────────────────────────
  // package.json'dan dinamik olarak okur, UI'da her zaman doğru sürüm görünür
  ipcMain.handle('get-app-version', () => app.getVersion());

  // ── SPEEDtest — v2.7.0 ───────────────────────────────────────
  // Cloudflare CDN üzerinden 25 MB indirerek gerçek hız ölçer
  ipcMain.handle('speedtest-run', async (event) => {
    const { net } = require('electron');
    const TEST_URL = 'https://speed.cloudflare.com/__down?bytes=25000000';
    const TIMEOUT_MS = 20_000;

    return new Promise((resolve) => {
      let startTime = null;
      let received = 0;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          request.abort();
        } catch (e) {}
        const elapsed = startTime ? (Date.now() - startTime) / 1000 : 1;
        const mbps = (received * 8) / 1_000_000 / elapsed;
        resolve({ success: true, mbps: parseFloat(mbps.toFixed(2)), partial: true });
      }, TIMEOUT_MS);

      const request = net.request({ url: TEST_URL, method: 'GET' });

      request.on('response', (response) => {
        startTime = Date.now();
        let lastSend = 0;

        response.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          // Her 300ms'de bir anlık hızı renderer'a gönder
          if (elapsed > 0 && now - lastSend > 300) {
            lastSend = now;
            const mbps = (received * 8) / 1_000_000 / elapsed;
            if (!timedOut && event.sender && !event.sender.isDestroyed()) {
              event.sender.send('speedtest-progress', { mbps: parseFloat(mbps.toFixed(2)) });
            }
          }
        });

        response.on('end', () => {
          clearTimeout(timer);
          if (timedOut) return;
          const elapsed = (Date.now() - startTime) / 1000;
          const mbps = elapsed > 0 ? (received * 8) / 1_000_000 / elapsed : 0;
          resolve({ success: true, mbps: parseFloat(mbps.toFixed(2)), partial: false });
        });

        response.on('error', (err) => {
          clearTimeout(timer);
          if (!timedOut) resolve({ success: false, error: err.message });
        });
      });

      request.on('error', (err) => {
        clearTimeout(timer);
        if (!timedOut) resolve({ success: false, error: err.message });
      });

      request.end();
    });
  });

  // ── AUTO-UPDATER ─────────────────────────────────────────────
  if (autoUpdater && app.isPackaged) {
    // Önceki sürümden güncelleme geldi mi? Yenilikler penceresini göster
    const settingsPath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {}

    const currentVersion = app.getVersion();
    if (settings.lastVersion && settings.lastVersion !== currentVersion) {
      // Sürüm değişmiş → yenilikler penceresini göster
      const showChangelog = () => {
        setTimeout(() => {
          mainWindow.webContents.send('show-changelog', {
            version: currentVersion,
            releaseNotes: settings.pendingReleaseNotes || null,
          });
          settings.lastVersion = currentVersion;
          settings.pendingReleaseNotes = null;
          try {
            fs.writeFileSync(settingsPath, JSON.stringify(settings));
          } catch (e) {}
        }, 2000);
      };
      // ready-to-show henüz çalışmadıysa bekle, çalıştıysa direkt çağır
      if (mainWindow.isVisible()) {
        showChangelog();
      } else {
        mainWindow.once('ready-to-show', showChangelog);
      }
    } else if (!settings.lastVersion) {
      settings.lastVersion = currentVersion;
      try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings));
      } catch (e) {}
    }

    autoUpdater.on('update-available', (info) => {
      mainWindow.webContents.send('update-available', info);
    });
    autoUpdater.on('download-progress', (prog) => {
      mainWindow.webContents.send('update-progress', prog);
    });
    autoUpdater.on('update-downloaded', (info) => {
      // Release notes'u kaydet — sonraki açılışta gösterilecek
      let s = {};
      try {
        s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {}
      s.pendingReleaseNotes = info.releaseNotes;
      try {
        fs.writeFileSync(settingsPath, JSON.stringify(s));
      } catch (e) {}
      mainWindow.webContents.send('update-downloaded', info);
    });
    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater Hata]', err.message);
      mainWindow.webContents.send('update-error', { message: err.message });
    });

    // Güncelleme kontrolü — 5 sn sonra başlat, sonra her 2 saatte bir
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => console.warn('[AutoUpdater]', e.message));
    }, 5000);
    setInterval(
      () => {
        autoUpdater.checkForUpdates().catch((e) => console.warn('[AutoUpdater]', e.message));
      },
      2 * 60 * 60 * 1000,
    );
  }
});

// ══════════════════════════════════════════
//  GOOGLE AUTH — OAuth2 PKCE (sistem tarayıcısı)
//  🔒 DÜZELTİLDİ: Client secret artık .env'den geliyor
// ══════════════════════════════════════════
const googleSignIn = require('./src/google-auth').createGoogleSignIn({
  clientId: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  hostedService,
  openExternal: (url) => shell.openExternal(url),
  authenticate: (token, remember) => auth.google(token, remember),
});
ipcMain.handle('open-google-auth', async (_, options = {}) => {
  if (deletingAccount || activeAccountRequests || authRestorePending)
    return { success: false, error: 'Devam eden hesap işleminin tamamlanmasını bekleyin.' };
  activeAccountRequests++;
  try {
    const result = await googleSignIn(options.remember);
    if (result.user) {
      saveAuth();
      result.user = profiles.withAvatar(result.user);
    }
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    activeAccountRequests--;
  }
});

// ══════════════════════════════════════════
//  TERMS
// ══════════════════════════════════════════
ipcMain.handle('accept-terms', () => {
  try {
    const storePath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
    let s = {};
    try {
      s = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (e) {}
    s.termsAccepted = true;
    s.termsAcceptedVersion = TERMS_VERSION; // hangi sürümde kabul edildi
    if (global.onboardingRequired) s.onboardingPending = true;
    fs.writeFileSync(storePath, JSON.stringify(s));
    global.termsAccepted = true;
    global.termsUpdateRequired = false;
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('terms-status', () => ({
  accepted: global.termsAccepted === true,
  updateRequired: global.termsUpdateRequired === true,
}));

ipcMain.handle('onboarding-status', () => ({
  required: global.onboardingRequired === true,
  version: ONBOARDING_VERSION,
}));

ipcMain.handle('import-browser-data', () => {
  try {
    const imported = importBrowserData();
    return { success: true, ...imported };
  } catch (error) {
    return { success: false, error: 'Tarayıcı verileri okunamadı.' };
  }
});

ipcMain.handle('complete-onboarding', (_, payload = {}) => {
  try {
    const allowedSources = new Set([
      'youtube-tiktok',
      'instagram',
      'github',
      'community',
      'friend-family',
      'search',
      'article',
      'other',
      'skipped',
    ]);
    const source = allowedSources.has(payload.source) ? payload.source : 'skipped';
    const sourceDetail =
      source === 'other'
        ? String(payload.sourceDetail || '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, 160)
        : '';
    const storePath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (error) {}
    settings.onboardingPending = false;
    settings.onboardingVersion = ONBOARDING_VERSION;
    settings.onboardingCompletedAt = new Date().toISOString();
    settings.discoverySource = source;
    if (sourceDetail) settings.discoverySourceDetail = sourceDetail;
    else delete settings.discoverySourceDetail;
    settings.defaultBrowserAsked = true;
    fs.writeFileSync(storePath, JSON.stringify(settings));
    global.onboardingRequired = false;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ── UPDATE IPC ────────────────────────────────────────────────
ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'AutoUpdater yüklü değil.' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e) {
    console.error('[AutoUpdater] İndirme hatası:', e.message);
    return { success: false, error: e.message };
  }
});
ipcMain.handle('install-update', () => {
  if (!autoUpdater) return;
  try {
    const settingsPath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
    let s = {};
    try {
      s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {}
    s.lastVersion = app.getVersion();
    fs.writeFileSync(settingsPath, JSON.stringify(s));
  } catch (e) {}
  autoUpdater.quitAndInstall(false, true);
});
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater || !app.isPackaged) return { updateAvailable: false };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: result?.isUpdateAvailable === true };
  } catch (e) {
    console.warn('[AutoUpdater] Manuel kontrol hatası:', e.message);
    return { updateAvailable: false, error: e.message };
  }
});

// ── TARAMA VERİSİ TEMİZLEME ──────────────────────────────────
ipcMain.handle('clear-browsing-data', async () => {
  try {
    if (deletingAccount) throw new Error('Hesap silme işleminin tamamlanmasını bekleyin.');
    await require('./src/browsing-data').clearBrowsingData(session, APP_URL);
    return { success: true };
  } catch (e) {
    console.error('[clearBrowsingData]', e.message);
    return { success: false, error: e.message };
  }
});

// ── GİZLİ MOD VERİSİNİ TEMİZLE ───────────────────────────────
// Gizli mod, kalıcı olmayan in-memory partition kullanır.
// Mod kapatıldığında bu partition'ın verisi temizlenir.
ipcMain.handle('clear-incognito-data', async () => {
  try {
    const s = session.fromPartition('incognito');
    await s.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'websql',
        'serviceworkers',
        'cachestorage',
      ],
    });
    await s.clearCache();
    await s.clearAuthCache();
    return { success: true };
  } catch (e) {
    console.error('[clearIncognitoData]', e.message);
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════
//  PENCERE KONTROLLERİ
// ══════════════════════════════════════════
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow?.close());
ipcMain.on('fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// ══════════════════════════════════════════
//  VPN — Proxy Sistemi
//  🔒 NOT: Bu sunucular açık proxy'ler. Kullanıcı
//     trafiği üçüncü taraflara geçebilir.
// ══════════════════════════════════════════
// ── v2.8.0: VPN — Güvenilir ücretsiz SOCKS5 proxy listesi ──────
// NOT: Ücretsiz proxy'ler değişkendir. Bağlantı kurulamazsa farklı
// sunucu devreye girer. Kullanıcıya tam anonimlik garantisi verilmez.
// Gerçek anonimlik için ücretli VPN servisi önerilir.
const VPN_SERVERS = {
  tr: null, // Direkt bağlantı
  de: 'socks5://104.234.106.89:1080',
  nl: 'socks5://51.158.172.163:16379',
  us: 'socks5://67.43.228.253:26509',
  uk: 'socks5://51.89.73.159:3128',
  fr: 'socks5://163.172.182.88:3128',
  jp: 'socks5://91.218.228.35:1080',
  // Yedek sunucular
  de2: 'socks5://85.195.105.28:1080',
  us2: 'socks5://72.10.164.178:12725',
};

// VPN durumu main process'te tutulur — renderer uydurmaz
let vpnConnecting = false;
let _vpnState = { active: false, country: null, proxy: null, timestamp: null };

// Gerçek proxy testi: istek gerçekten proxy üzerinden yönlendirilir.
// Önceki sürümdeki test proxy'yi hiç kullanmıyordu — bu düzeltildi.
async function testProxy(proxyUrl) {
  const testSession = session.fromPartition('test-proxy');
  try {
    await testSession.setProxy({ proxyRules: proxyUrl });
  } catch (e) {
    return false;
  }
  return new Promise((resolve) => {
    const { net } = require('electron');
    const req = net.request({
      url: 'https://www.gstatic.com/generate_204',
      method: 'GET',
      session: testSession,
    });
    const timeout = setTimeout(() => {
      try {
        req.abort();
      } catch (e) {}
      resolve(false);
    }, 8000);
    req.on('response', (res) => {
      clearTimeout(timeout);
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    req.end();
  });
}

ipcMain.handle('vpn-connect', async (event, countryCode) => {
  if (vpnConnecting) return { success: false, error: 'Bağlantı denemesi sürüyor.' };
  vpnConnecting = true;
  try {
    // 🔒 v2.9.0: Sadece bilinen ülke kodlarını kabul et
    const VALID_CODES = Object.keys(VPN_SERVERS).filter((k) => !k.endsWith('2'));
    if (!VALID_CODES.includes(countryCode)) {
      return { success: false, error: 'Geçersiz ülke kodu.' };
    }

    const primary =
      process.env['VPN_' + countryCode.toUpperCase() + '_PROXY'] ||
      VPN_SERVERS[countryCode] ||
      null;
    const backup = VPN_SERVERS[countryCode + '2'] || null;
    let chosen = primary;

    // Proxy gerçekten çalışıyor mu — yedek sunucu mantığı
    if (primary) {
      const ok = await testProxy(primary);
      if (!ok) {
        console.warn(`[VPN] Birincil sunucu yanıt vermedi, yedek deneniyor: ${backup}`);
        chosen = backup && (await testProxy(backup)) ? backup : null;
      }
    }

    // Türkiye (direct) dışında sunucu bulunamazsa dürüstçe hata dön
    if (countryCode !== 'tr' && !chosen) {
      return {
        success: false,
        error:
          'Bu ülkenin proxy sunucuları yanıt vermedi. Bağlantı kurulmadı; farklı ülke seçin veya çalışan bir proxy yapılandırın.',
      };
    }

    const proxyConfig = chosen ? { proxyRules: chosen } : { mode: 'direct' };
    await setBrowserProxy(session, proxyConfig);

    _vpnState = { active: !!chosen, country: countryCode, proxy: chosen, timestamp: Date.now() };

    return {
      success: true,
      active: !!chosen,
      proxy: chosen || 'direct',
      country: countryCode,
      warning: chosen
        ? 'Trafiğiniz üçüncü taraf bir proxy sunucusundan geçmektedir. Tam anonimlik garantisi verilmez.'
        : null,
    };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    vpnConnecting = false;
  }
});

ipcMain.handle('vpn-disconnect', async () => {
  try {
    await setBrowserProxy(session, { mode: 'direct' });
    _vpnState = { active: false, country: null, proxy: null, timestamp: null };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vpn-status', () => ({ ..._vpnState }));

// Gerçek bellek kullanımı — tüm Electron process'lerinin çalışma seti toplamı
ipcMain.handle('get-memory-stats', () =>
  require('./src/memory').summarizeMemory(app.getAppMetrics()),
);
ipcMain.handle('performance-mode-status', () => ({
  active: performanceModeActive,
  configured: readPerformanceMode(),
  restartRequired: performanceModeActive !== readPerformanceMode(),
}));
ipcMain.handle('performance-mode-set', (_, enabled) => {
  if (typeof enabled !== 'boolean') return { success: false, error: 'Geçersiz kip değeri.' };
  try {
    writePerformanceMode(enabled);
    return { success: true, enabled, restartRequired: enabled !== performanceModeActive };
  } catch (error) {
    return { success: false, error: 'Performans Kipi kaydedilemedi: ' + error.message };
  }
});

// ── v2.8.0: Hesap Silme — KVKK Madde 7 — v2.9.0: Komple veri silme
ipcMain.handle('auth-delete-account', async (_, payload) => {
  if (deletingAccount) return { success: false, error: 'Hesap silme işlemi zaten sürüyor.' };
  if (activeAccountRequests || authRestorePending)
    return { success: false, error: 'Devam eden hesap işleminin tamamlanmasını bekleyin.' };
  deletingAccount = true;
  try {
    await auth.remove(payload);
    // Account deletion succeeded remotely. Only then clear local data.
    const failures = [];
    for (const name of [
      'techbrowser-data.json',
      'techbrowser-passwords.json',
      'techbrowser-users.json',
      'techbrowser-otp.json',
      'techbrowser-auth.json',
      'techbrowser-ai-keys.json',
      'techbrowser-profiles.json',
    ]) {
      try {
        const file = path.join(app.getPath('userData'), name);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (e) {
        failures.push(name);
      }
    }
    try {
      await Promise.all(
        browserSessions(session).map(async (s) => {
          await s.clearStorageData();
          await s.clearCache();
          await s.clearAuthCache();
        }),
      );
    } catch (e) {
      failures.push('site verileri');
    }
    authRestored = true;
    // The old document must not recreate deleted records during beforeunload.
    // A freshly loaded document can save again without restarting Electron.
    mainWindow.webContents.once('dom-ready', () => {
      deletingAccount = false;
    });
    return {
      success: true,
      cleanupComplete: failures.length === 0,
      error: failures.length
        ? 'Hesap silindi; temizlenemeyen yerel veriler: ' + failures.join(', ')
        : null,
    };
  } catch (e) {
    deletingAccount = false;
    return { success: false, error: e.message };
  }
});

// ── v2.8.0: Sorun Bildir — 🔒 v2.9.0: Rate limiting eklendi
ipcMain.handle(
  'submit-report',
  async (event, { category, subject, description, userEmail, appVersion }) => {
    try {
      if (!description || description.trim().length < 10) {
        return { success: false, error: 'Açıklama en az 10 karakter olmalıdır.' };
      }

      if (hostedService) {
        await authenticatedServiceCall((token) =>
          hostedService.report(
            { category, subject, description, appVersion: app.getVersion() },
            token,
          ),
        );
        return { success: true };
      }

      // Rate limit: aynı kullanıcıdan dakikada max 2 bildirim
      const limitKey = userEmail || 'anonymous';
      if (!checkRateLimit('submit-report', limitKey, 2)) {
        return { success: false, error: 'Çok fazla bildirim gönderdiniz. 1 dakika bekleyin.' };
      }

      const categoryLabels = {
        bug: '✶ Hata / Bug',
        crash: '✱ Çökme',
        ui: '✦ Arayüz Sorunu',
        vpn: '◎ VPN Sorunu',
        update: '⟳ Güncelleme Sorunu',
        security: '⬢ Güvenlik Açığı',
        suggestion: '✺ Öneri',
        other: '▤ Diğer',
      };

      const catLabel = categoryLabels[category] || '▤ Diğer';
      const version = appVersion || app.getVersion();
      const date = new Date().toLocaleString('tr-TR');

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a3e,#0d0d2e);padding:28px 36px;border-bottom:1px solid #2a2a4a;">
            <div style="display:inline-block;background:#fff;border-radius:10px;padding:6px 12px;margin-bottom:12px;">
              <span style="font-size:20px;font-weight:900;color:#0a0a0f;">TB</span>
            </div>
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">TechBrowser02 — Sorun Bildirimi</h1>
            <p style="margin:4px 0 0;color:#8888aa;font-size:13px;">${catLabel}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.8px;">Kategori</span>
                  <div style="color:#fff;font-size:14px;font-weight:600;margin-top:4px;">${catLabel}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.8px;">Konu</span>
                  <div style="color:#fff;font-size:14px;font-weight:600;margin-top:4px;">${subject || '(belirtilmedi)'}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.8px;">Kullanıcı E-postası</span>
                  <div style="color:#fff;font-size:14px;font-weight:600;margin-top:4px;">${userEmail || 'Anonim'}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.8px;">Uygulama Sürümü</span>
                  <div style="color:#4f8cff;font-size:14px;font-weight:600;margin-top:4px;">v${version}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.8px;">Tarih</span>
                  <div style="color:#fff;font-size:14px;margin-top:4px;">${date}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0 0;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.8px;">Açıklama</span>
                  <div style="color:#ccccdd;font-size:14px;line-height:1.7;margin-top:8px;background:#0a0a1e;border-radius:10px;padding:16px;border:1px solid #1e1e2e;">${description.replace(/\n/g, '<br>')}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#0d0d1a;padding:16px 36px;border-top:1px solid #1e1e2e;text-align:center;">
            <p style="margin:0;color:#555566;font-size:11px;">TechBrowser02 Otomatik Bildirim Sistemi · v${version}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await sendMail(
        'techub.st@gmail.com',
        `[TechBrowser02] ${catLabel} — ${subject || 'Sorun Bildirimi'}`,
        html,
      );

      return { success: true };
    } catch (e) {
      console.error('[submit-report]', e.message);
      return { success: false, error: 'Mail gönderilemedi: ' + e.message };
    }
  },
);

// ══════════════════════════════════════════
//  DOSYA İŞLEMLERİ
// ══════════════════════════════════════════
ipcMain.handle('open-external', (event, url) => {
  // 🔒 Sadece http/https protokolüne izin ver
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: 'Sadece http/https URL açılabilir.' };
    }
    shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Geçersiz URL.' };
  }
});

ipcMain.on('open-download', (event, filePath) => shell.openPath(filePath));
ipcMain.on('open-downloads-folder', () => shell.openPath(app.getPath('downloads')));

// ══════════════════════════════════════════
//  DATA KAYDET / YÜKLE — 🔒 v2.9.0: Şifrelenmiş
// ══════════════════════════════════════════
let deletingAccount = false;
let activeAccountRequests = 0;
async function authenticatedServiceCall(call) {
  if (deletingAccount || activeAccountRequests || authRestorePending)
    throw Error('Devam eden hesap işleminin tamamlanmasını bekleyin.');
  activeAccountRequests++;
  try {
    const token = await auth.accessToken();
    saveAuth();
    return await call(token);
  } finally {
    activeAccountRequests--;
  }
}
const store = require('./src/secure-store').createStore(
  app.getPath('userData'),
  safeStorage,
  process.env.DATA_ENC_KEY,
);
const profiles = require('./src/profile-store').createProfileStore({
  directory: app.getPath('userData'),
  store,
  nativeImage: require('electron').nativeImage,
});
const DATA_PATH = path.join(app.getPath('userData'), 'techbrowser-data.json');

const aiService = require('./src/ai-service').createAiService({
  directory: app.getPath('userData'),
  store,
  groqApiKey: GROQ_API_KEY,
  hostedChat: hostedAiService
    ? (messages) => authenticatedServiceCall((token) => hostedAiService.chat(messages, token))
    : undefined,
  models: {
    chatgpt: process.env.OPENAI_MODEL,
    claude: process.env.CLAUDE_MODEL,
    gemini: process.env.GEMINI_MODEL,
  },
});
const aiCall = (fn) => async (_, payload) => {
  try {
    if (deletingAccount) throw Error('Hesap silme işleminin tamamlanmasını bekleyin.');
    return { success: true, ...(await fn(payload)) };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
ipcMain.handle(
  'ai-status',
  aiCall(() => ({ configured: aiService.status(), hosted: !!hostedAiService })),
);
ipcMain.handle(
  'ai-save-key',
  aiCall((payload) => ({ configured: aiService.saveKey(payload), hosted: !!hostedAiService })),
);
ipcMain.handle(
  'ai-migrate-keys',
  aiCall((payload) => ({ configured: aiService.migrate(payload), hosted: !!hostedAiService })),
);
let aiRequestPending = false;
ipcMain.handle(
  'ai-query',
  aiCall(async (payload) => {
    if (aiRequestPending) throw Error('Önceki AI yanıtının tamamlanmasını bekleyin.');
    if (!checkRateLimit('ai-query', 'app', 20))
      throw Error('Çok fazla AI isteği gönderildi. Bir dakika bekleyin.');
    aiRequestPending = true;
    try {
      return { reply: await aiService.query(payload) };
    } finally {
      aiRequestPending = false;
    }
  }),
);

ipcMain.handle('save-data', (event, data) => {
  try {
    if (deletingAccount) throw new Error('Hesap silinirken kayıt yapılamaz.');
    store.write(DATA_PATH, data);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('load-data', () => {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return decryptData(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
});

// ── ŞİFRE YÖNETİCİSİ — AES-256-GCM ile şifrelenerek saklanır ──────────
// Düz metin localStorage kullanımı kaldırıldı.
const PASSWORDS_PATH = path.join(app.getPath('userData'), 'techbrowser-passwords.json');

ipcMain.handle('passwords-save', (event, list) => {
  try {
    const safe = Array.isArray(list) ? list : [];
    if (deletingAccount) throw new Error('Hesap silinirken kayıt yapılamaz.');
    store.write(PASSWORDS_PATH, safe);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('passwords-load', () => {
  try {
    const raw = fs.readFileSync(PASSWORDS_PATH, 'utf8');
    const data = decryptData(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
});

// ══════════════════════════════════════════
//  E-POSTA — yalnızca "Sorun Bildir" için kullanılır
// ══════════════════════════════════════════
async function sendMail(to, subject, html) {
  const transporter = require('nodemailer').createTransport(SMTP_CONFIG);
  await transporter.sendMail({ from: MAIL_FROM, to, subject, html });
}

// ══════════════════════════════════════════
//  E-POSTA 2FA — kod main process'te üretilir ve doğrulanır.
//  Renderer koda asla erişemez; yalnızca gönderim ve doğrulama ister.
// ══════════════════════════════════════════
const _twoFactorCodes = new Map(); // email -> { code, expires, attempts }
const _TFA_TTL = 5 * 60 * 1000; // 5 dakika
const _TFA_MAX_ATTEMPTS = 5;

function build2FaMailHtml(code) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e;">
        <tr><td style="background:linear-gradient(135deg,#1a1a3e 0%,#0d0d2e 100%);padding:32px 40px;text-align:center;border-bottom:1px solid #2a2a4a;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">TechBrowser</h1>
          <p style="margin:6px 0 0;color:#8888aa;font-size:13px;">İki Adımlı Doğrulama</p>
        </td></tr>
        <tr><td style="padding:36px 40px;text-align:center;">
          <p style="margin:0 0 20px;color:#ccccdd;font-size:14px;">Giriş doğrulama kodun:</p>
          <div style="background:#0a0a1e;border:2px solid #4f8cff;border-radius:12px;padding:24px;font-family:'Courier New',monospace;font-size:40px;font-weight:900;letter-spacing:16px;color:#4f8cff;">${code}</div>
          <p style="margin:20px 0 0;color:#8888aa;font-size:12px;">Bu kod 5 dakika geçerlidir.</p>
          <p style="margin:8px 0 0;color:#f59e0b;font-size:12px;">Bu işlemi sen yapmadıysan e-postayı güvenle yoksayabilirsin.</p>
        </td></tr>
        <tr><td style="background:#0d0d1a;padding:20px 40px;border-top:1px solid #1e1e2e;text-align:center;">
          <p style="margin:0;color:#555566;font-size:11px;">TechBrowser © 2025 · Tüm hakları saklıdır</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const auth = require('./src/auth-service').createAuthService({
  hostedService,
  cloudSyncEnabled:
    process.env.FIREBASE_SYNC_ENABLED === 'true' || publicServices.firebaseSyncEnabled === true,
  apiKey: 'AIzaSyCZ2u0VEot46d1LzyTYmEX8GO-HWuDCp6w',
  sendMail: (email, code) =>
    sendMail(email, 'TechBrowser — Giriş Doğrulama Kodun', build2FaMailHtml(code)),
});
const authCall = (fn) => async (_, payload) => {
  if (deletingAccount || activeAccountRequests || authRestorePending)
    return { success: false, error: 'Devam eden hesap işleminin tamamlanmasını bekleyin.' };
  activeAccountRequests++;
  try {
    return { success: true, ...(await fn(payload)) };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    activeAccountRequests--;
  }
};
ipcMain.handle(
  'profile-save-avatar',
  authCall(async (payload) => {
    const user = auth.profile();
    if (!user || payload?.uid !== user.uid) throw Error('Hesap değişti; fotoğrafı yeniden seçin.');
    return { user: profiles.saveAvatar(user, payload.avatar, payload.misket) };
  }),
);
ipcMain.handle(
  'auth-begin',
  authCall(async (p) => auth.begin(p)),
);
const AUTH_PATH = path.join(app.getPath('userData'), 'techbrowser-auth.json');
function saveAuth() {
  if (deletingAccount) throw Error('Hesap silinirken oturum kaydedilemez.');
  const remembered = auth.remembered();
  if (remembered) store.write(AUTH_PATH, remembered);
  else if (fs.existsSync(AUTH_PATH)) fs.unlinkSync(AUTH_PATH);
}
ipcMain.handle(
  'auth-finish',
  authCall(async (p) => {
    const user = await auth.finish(p);
    saveAuth();
    return { user: profiles.withAvatar(user) };
  }),
);
ipcMain.handle(
  'auth-register',
  authCall(async (p) => ({ registered: await auth.register(p) })),
);
ipcMain.handle(
  'auth-reset',
  authCall(async (p) => ({ sent: await auth.reset(p.email) })),
);
let authRestored = false,
  authRestorePending = null;
ipcMain.handle('auth-profile', async () => {
  if (deletingAccount) return { user: null };
  if (auth.profile()) return { user: profiles.withAvatar(auth.profile()) };
  if (authRestored) return { user: null };
  if (authRestorePending) return authRestorePending;
  authRestorePending = (async () => {
    if (!fs.existsSync(AUTH_PATH)) {
      authRestored = true;
      return { user: null };
    }
    try {
      await auth.refresh(store.decrypt(fs.readFileSync(AUTH_PATH, 'utf8')));
      saveAuth();
      authRestored = true;
      return { user: profiles.withAvatar(auth.profile()) };
    } catch (e) {
      const invalid = /TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED|USER_NOT_FOUND/.test(
        e.message,
      );
      return {
        user: null,
        error: invalid
          ? 'Kaydedilmiş oturum Firebase tarafından geçersiz sayıldı; yeniden giriş yapın.'
          : 'Kaydedilmiş oturum yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin; oturum kaydınız korundu.',
      };
    }
  })();
  try {
    return await authRestorePending;
  } finally {
    authRestorePending = null;
  }
});
ipcMain.handle(
  'auth-logout',
  authCall(async () => {
    if (fs.existsSync(AUTH_PATH)) fs.unlinkSync(AUTH_PATH);
    auth.logout();
    authRestored = true;
    return {};
  }),
);
ipcMain.handle(
  'auth-resend-verification',
  authCall(async (p) => ({ sent: await auth.resend(p) })),
);
ipcMain.handle(
  'auth-mfa-enroll-start',
  authCall(async () => {
    const setup = await auth.enrollStart();
    const params = new URLSearchParams({
      secret: setup.secret,
      issuer: 'TechBrowser',
      algorithm: setup.algorithm || 'SHA1',
      digits: String(setup.digits || 6),
      period: String(setup.period || 30),
    });
    const uri =
      'otpauth://totp/' + encodeURIComponent('TechBrowser:' + auth.profile().email) + '?' + params;
    const qr = await require('qrcode').toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 256,
    });
    return { ...setup, qr };
  }),
);
ipcMain.handle(
  'auth-mfa-enroll-finish',
  authCall(async (p) => {
    const user = await auth.enrollFinish(p);
    saveAuth();
    return { user: profiles.withAvatar(user) };
  }),
);
ipcMain.handle(
  'sync-data',
  authCall(async (p) => {
    const bookmarks = await auth.sync(p);
    saveAuth();
    return { bookmarks };
  }),
);

// ══════════════════════════════════════════
//  AUTH — Kullanıcı veritabanı
//  Legacy file paths retained only for account cleanup.
// ══════════════════════════════════════════
const USERS_PATH = path.join(app.getPath('userData'), 'techbrowser-users.json');
const OTP_STORE_PATH = path.join(app.getPath('userData'), 'techbrowser-otp.json');

// ── v2.8.0: Kullanıcı verileri AES-256-GCM ile şifreleniyor ──────
const crypto = require('crypto');

// ── v2.9.0: Şifreleme anahtarı — kalıcı rastgele anahtar ──────────────────
// .env'de DATA_ENC_KEY varsa onu kullan.
// Otherwise protect the random key with the operating system credential store.
// Hostname'den türetme KALDIRILDI — güvenlik açığıydı.
function encryptData(obj) {
  return store.encrypt(obj);
}
function decryptData(raw) {
  return store.decrypt(raw);
}

// ══════════════════════════════════════════
//  UYGULAMA OLAYLARI
// ══════════════════════════════════════════
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

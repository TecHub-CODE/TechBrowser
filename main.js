const { app, BrowserWindow, ipcMain, session, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

// Auto-updater (electron-updater paketi gerekli: npm install electron-updater)
let autoUpdater;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false; // Manuel indirme — kullanıcı onaylar
  autoUpdater.autoInstallOnAppQuit = true;
} catch(e) {
  console.warn('[AutoUpdater] electron-updater yüklü değil:', e.message);
}

// ══════════════════════════════════════════
//  ORTAM DEĞİŞKENLERİ — İlk satırda yükle
// ══════════════════════════════════════════
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

const nodemailer   = require('nodemailer');
const bcrypt       = require('bcrypt');

// ══════════════════════════════════════════
//  SMTP & SABITLER — .env'den al
// ══════════════════════════════════════════
const SMTP_CONFIG = {
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};
const MAIL_FROM        = process.env.MAIL_FROM    || '"TechBrowser" <noreply@techbrowser.app>';
const BCRYPT_ROUNDS    = parseInt(process.env.BCRYPT_ROUNDS) || 12;
// 🔒 DÜZELTİLDİ: Secret artık .env'den geliyor, kaynak kodda yok
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GROQ_API_KEY         = process.env.GROQ_API_KEY         || '';

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.warn('[UYARI] .env: SMTP_USER veya SMTP_PASS eksik!');
}
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('[UYARI] .env: GOOGLE_CLIENT_ID veya GOOGLE_CLIENT_SECRET eksik!');
}

// ══════════════════════════════════════════
//  CHROMİUM FLAGS — Sadece gerekli olanlar
//  🔒 DÜZELTİLDİ: disable-web-security, ignore-certificate-errors,
//                  allow-running-insecure-content KALDIRILDI
// ══════════════════════════════════════════
app.commandLine.appendSwitch(
  'disable-features',
  'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure'
);
// no-sandbox: Electron'un webview özelliği için minimum gereksinim
// Tam sandbox için ayrı bir renderer process mimarisi gerekir
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch(
  'user-agent',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
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
//  İZİN YÖNETİMİ
// ══════════════════════════════════════════
const SILENT_DENY = ['notifications', 'push', 'backgroundSync', 'periodicBackgroundSync'];
const ASK_USER    = ['camera', 'microphone', 'geolocation', 'midi', 'midiSysex'];

function buildPermissionHandler(win) {
  return (webContents, permission, callback, details) => {
    if (SILENT_DENY.includes(permission)) return callback(false);
    if (ASK_USER.includes(permission)) {
      const origin = (() => {
        try { return new URL(details.requestingUrl || 'about:blank').origin; } catch { return 'Bilinmeyen'; }
      })();
      const label = { camera: 'Kamera', microphone: 'Mikrofon', geolocation: 'Konum' }[permission] || permission;
      dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['İzin Ver', 'Reddet'],
        defaultId: 1,
        cancelId: 1,
        title: 'İzin İsteği',
        message: `"${origin}" sitesi ${label} erişimi istiyor.`,
      }).then(({ response }) => callback(response === 0));
      return;
    }
    callback(true);
  };
}

// ══════════════════════════════════════════
//  NAVİGASYON GÜVENLİĞİ — Harici linkleri filtrele
//  🔒 YENİ: Renderer'dan gelen navigate isteklerini kısıtla
// ══════════════════════════════════════════
const ALLOWED_INTERNAL = /^(file:|about:blank)/;

function applyNavigationGuard(webContents) {
  webContents.on('will-navigate', (event, url) => {
    // Ana renderer sadece kendi dosyalarına navigate edebilir
    if (!ALLOWED_INTERNAL.test(url)) {
      event.preventDefault();
    }
  });
  // Yeni pencere açma isteklerini yakala
  webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

let mainWindow;

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
      contextIsolation: true,              // ✅ açık
      nodeIntegration: false,              // ✅ kapalı
      webviewTag: true,
      webSecurity: true,                   // 🔒 true
      allowRunningInsecureContent: false,  // 🔒 false
      sandbox: false,                      // webview için gerekli
      // 🔒 YENİ: ek güvenlik
      navigateOnDragDrop: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  applyNavigationGuard(mainWindow.webContents);

  mainWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  );

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!global.termsAccepted) {
      mainWindow.webContents.send('show-terms');
    }
  });

  // İndirme yönetimi
  mainWindow.webContents.session.on('will-download', (event, item) => {
    const savePath = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(savePath);
    mainWindow.webContents.send('download-started', {
      filename: item.getFilename(),
      totalBytes: item.getTotalBytes(),
      url: item.getURL(),
    });
    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        mainWindow.webContents.send('download-progress', {
          filename: item.getFilename(),
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
        });
      }
    });
    item.once('done', (event, state) => {
      mainWindow.webContents.send('download-done', {
        filename: item.getFilename(),
        state,
        savePath,
      });
    });
  });
}

// ══════════════════════════════════════════
//  HEADER YÖNETİMİ — Sadece gerekli headerları kaldır
//  🔒 DÜZELTİLDİ: CSP ve X-Content-Type-Options artık
//     silinmiyor, sadece X-Frame-Options kaldırılıyor
// ══════════════════════════════════════════
function applySessionHeaders(targetSession, isYandex = false) {
  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

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
      details.requestHeaders['sec-ch-ua'] = '"Chromium";v="121", "Not A(Brand";v="99", "Google Chrome";v="121"';
      details.requestHeaders['sec-ch-ua-mobile']   = '?0';
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

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    // 🔒 Sadece iframe engelini kaldır (webview'da her site açılsın)
    // CSP ve X-Content-Type-Options artık silinmiyor
    delete headers['x-frame-options'];
    delete headers['X-Frame-Options'];
    callback({ responseHeaders: headers });
  });
}

app.whenReady().then(() => {
  // ── Settings yükle ──────────────────────────────────────────────────────
  const storePath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
  let appSettings = {};
  try { appSettings = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch(e) {}

  global.termsAccepted = appSettings.termsAccepted === true;

  // ── Varsayılan tarayıcı sorusu ──────────────────────────────────────────
  if (!appSettings.defaultBrowserAsked && app.isPackaged) {
    appSettings.defaultBrowserAsked = true;
    try { fs.writeFileSync(storePath, JSON.stringify(appSettings)); } catch(e) {}

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
              detail: '1. Açılan Ayarlar sayfasında "TechBrowser" yaz\n2. TechBrowser02\'ye tıkla\n3. Varsayılan olarak ayarla butonuna bas',
              buttons: ['Anladım'],
            });
          }, 800);
        }
      }
    }, 2000);
  }

  // ── Session ayarları ────────────────────────────────────────────────────
  const ses = session.defaultSession;

  // Google rejected sayfasını yakala
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    if (
      url.includes('accounts.google.com/v3/signin/rejected') ||
      url.includes('accounts.google.com/signin/rejected')
    ) {
      const target = details.referrer || 'https://www.google.com';
      shell.openExternal(target);
      callback({ cancel: true });
      return;
    }
    callback({});
  });

  applySessionHeaders(ses);

  const yandexSes = session.fromPartition('persist:yandex');
  applySessionHeaders(yandexSes, true);

  ['persist:default', 'persist:google', 'persist:youtube'].forEach(p => {
    applySessionHeaders(session.fromPartition(p));
  });

  createWindow();

  ses.setPermissionRequestHandler(buildPermissionHandler(mainWindow));
  yandexSes.setPermissionRequestHandler(buildPermissionHandler(mainWindow));

  // ── Groq Key IPC ─────────────────────────────────────────────
  ipcMain.handle('get-groq-key', () => GROQ_API_KEY || '');

  // ── AUTO-UPDATER ─────────────────────────────────────────────
  if (autoUpdater && app.isPackaged) {
    // Önceki sürümden güncelleme geldi mi? Yenilikler penceresini göster
    const settingsPath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch(e) {}

    const currentVersion = app.getVersion();
    if (settings.lastVersion && settings.lastVersion !== currentVersion) {
      // Sürüm değişmiş → yenilikler penceresini göster
      mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
          mainWindow.webContents.send('show-changelog', {
            version: currentVersion,
            releaseNotes: settings.pendingReleaseNotes || null,
          });
          settings.lastVersion = currentVersion;
          settings.pendingReleaseNotes = null;
          try { fs.writeFileSync(settingsPath, JSON.stringify(settings)); } catch(e) {}
        }, 1500);
      });
    } else if (!settings.lastVersion) {
      settings.lastVersion = currentVersion;
      try { fs.writeFileSync(settingsPath, JSON.stringify(settings)); } catch(e) {}
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
      try { s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch(e) {}
      s.pendingReleaseNotes = info.releaseNotes;
      try { fs.writeFileSync(settingsPath, JSON.stringify(s)); } catch(e) {}
      mainWindow.webContents.send('update-downloaded', info);
    });
    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater Hata]', err.message);
    });

    // Güncelleme kontrolü — 5 sn sonra başlat, sonra her 2 saatte bir
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(e => console.warn('[AutoUpdater]', e.message));
    }, 5000);
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(e => console.warn('[AutoUpdater]', e.message));
    }, 2 * 60 * 60 * 1000);
  }
});

// ══════════════════════════════════════════
//  GOOGLE AUTH — OAuth2 PKCE (sistem tarayıcısı)
//  🔒 DÜZELTİLDİ: Client secret artık .env'den geliyor
// ══════════════════════════════════════════
let _googleAuthServer = null;

ipcMain.handle('open-google-auth', async () => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return { success: false, error: '.env dosyasında GOOGLE_CLIENT_ID veya GOOGLE_CLIENT_SECRET eksik.' };
  }

  const crypto = require('crypto');
  const http   = require('http');

  if (_googleAuthServer) {
    try { _googleAuthServer.close(); } catch(e) {}
    _googleAuthServer = null;
  }

  const verifier  = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state     = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve) => {
    const tryListen = (p) => {
      const server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, `http://localhost:${p}`);
        if (reqUrl.pathname !== '/callback') { res.end(); return; }

        const code     = reqUrl.searchParams.get('code');
        const retState = reqUrl.searchParams.get('state');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TechBrowser02</title>
          <style>body{background:#0a0a0f;color:#fff;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
          .box{text-align:center;}</style></head>
          <body><div class="box"><div style="font-size:64px">✅</div>
          <div style="font-size:24px;font-weight:700;margin:16px 0 8px">Giriş Başarılı!</div>
          <div style="color:#888;font-size:14px">TechBrowser02'ye dönebilirsin.</div></div></body></html>`);

        server.close();
        _googleAuthServer = null;

        if (!code || retState !== state) {
          resolve({ success: false, error: 'Geçersiz callback' }); return;
        }

        try {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              redirect_uri:  `http://localhost:${p}/callback`,
              grant_type:    'authorization_code',
              code,
              code_verifier: verifier,
            }),
          });
          const tokenData = await tokenRes.json();
          if (tokenData.id_token) {
            resolve({ success: true, idToken: tokenData.id_token });
          } else {
            resolve({ success: false, error: JSON.stringify(tokenData) });
          }
        } catch(e) {
          resolve({ success: false, error: e.message });
        }
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') tryListen(p + 1);
        else resolve({ success: false, error: err.message });
      });

      server.listen(p, '127.0.0.1', () => {
        _googleAuthServer = server;
        const redirectUri = `http://localhost:${p}/callback`;
        const params = new URLSearchParams({
          client_id:             GOOGLE_CLIENT_ID,
          redirect_uri:          redirectUri,
          response_type:         'code',
          scope:                 'openid email profile',
          code_challenge:        challenge,
          code_challenge_method: 'S256',
          state,
          prompt:                'select_account',
        });
        shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
      });

      // 5 dk timeout
      setTimeout(() => {
        try { server.close(); } catch(e) {}
        _googleAuthServer = null;
        resolve({ success: false, error: 'Timeout' });
      }, 300_000);
    };

    tryListen(3742);
  });
});

// ══════════════════════════════════════════
//  TERMS
// ══════════════════════════════════════════
ipcMain.handle('accept-terms', () => {
  try {
    const storePath = path.join(app.getPath('userData'), 'techbrowser-settings.json');
    let s = {};
    try { s = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch(e) {}
    s.termsAccepted = true;
    fs.writeFileSync(storePath, JSON.stringify(s));
    global.termsAccepted = true;
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('terms-status', () => ({ accepted: global.termsAccepted === true }));

// ── UPDATE IPC ────────────────────────────────────────────────
ipcMain.handle('download-update', () => {
  if (autoUpdater) autoUpdater.downloadUpdate();
});
ipcMain.handle('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

// ══════════════════════════════════════════
//  PENCERE KONTROLLERİ
// ══════════════════════════════════════════
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win-close',  () => mainWindow?.close());
ipcMain.on('fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// ══════════════════════════════════════════
//  VPN — Proxy Sistemi
//  🔒 NOT: Bu sunucular açık proxy'ler. Kullanıcı
//     trafiği üçüncü taraflara geçebilir.
// ══════════════════════════════════════════
const VPN_SERVERS = {
  tr: null,
  de: 'socks5://51.75.126.222:1080',
  nl: 'socks5://185.220.101.45:10965',
  us: 'socks5://198.199.116.78:1080',
  uk: 'socks5://51.79.52.80:3080',
  fr: 'socks5://51.158.119.88:1234',
};

ipcMain.handle('vpn-connect', async (event, countryCode) => {
  try {
    const proxyRules = VPN_SERVERS[countryCode] || null;
    const proxyConfig = proxyRules ? { proxyRules } : { mode: 'direct' };
    await session.defaultSession.setProxy(proxyConfig);
    await session.fromPartition('persist:yandex').setProxy(proxyConfig);
    return { success: true, proxy: proxyRules || 'direct' };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vpn-disconnect', async () => {
  try {
    await session.defaultSession.setProxy({ mode: 'direct' });
    await session.fromPartition('persist:yandex').setProxy({ mode: 'direct' });
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

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
  } catch(e) {
    return { success: false, error: 'Geçersiz URL.' };
  }
});

ipcMain.on('open-download',         (event, filePath) => shell.openPath(filePath));
ipcMain.on('open-downloads-folder', ()                => shell.openPath(app.getPath('downloads')));

// ══════════════════════════════════════════
//  DATA KAYDET / YÜKLE
// ══════════════════════════════════════════
const DATA_PATH = path.join(app.getPath('userData'), 'techbrowser-data.json');

ipcMain.handle('save-data', (event, data) => {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch(e) { return false; }
});

ipcMain.handle('load-data', () => {
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); }
  catch(e) { return {}; }
});

// ══════════════════════════════════════════
//  E-POSTA
// ══════════════════════════════════════════
async function sendMail(to, subject, html) {
  const transporter = nodemailer.createTransport(SMTP_CONFIG);
  await transporter.sendMail({ from: MAIL_FROM, to, subject, html });
}

ipcMain.handle('send-email', async (event, { to, subject, html, code, type }) => {
  try {
    let finalHtml = html;
    if (code && type === '2fa') {
      finalHtml = buildMailHtml({
        title:     'İki Adımlı Doğrulama',
        subtitle:  'Giriş işlemini onaylamak için kodunu gir.',
        bodyText:  'TechBrowser hesabına giriş için aşağıdaki 6 haneli doğrulama kodunu kullan.',
        code,
        footerText: 'Bu kod 5 dakika geçerlidir · Eğer giriş yapmadıysan hesabın güvende.',
      });
    }
    await sendMail(to, subject, finalHtml);
    return { success: true };
  } catch(e) {
    console.error('[SMTP Hata]', e.message);
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════
//  MAİL ŞABLONU
// ══════════════════════════════════════════
function buildMailHtml({ title, subtitle, bodyText, code, footerText }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a3e 0%,#0d0d2e 100%);padding:32px 40px;text-align:center;border-bottom:1px solid #2a2a4a;">
            <div style="display:inline-block;background:#fff;border-radius:12px;padding:8px 14px;margin-bottom:16px;">
              <span style="font-size:22px;font-weight:900;color:#0a0a0f;letter-spacing:-1px;">TB</span>
            </div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">TechBrowser</h1>
            <p style="margin:6px 0 0;color:#8888aa;font-size:13px;">Modern Masaüstü Tarayıcı</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;">${title}</h2>
            <p style="margin:0 0 24px;color:#8888aa;font-size:14px;">${subtitle}</p>
            <p style="margin:0 0 28px;color:#ccccdd;font-size:14px;line-height:1.6;">${bodyText}</p>
            ${code ? `
            <div style="background:#0a0a1e;border:2px solid #4f8cff;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <p style="margin:0 0 8px;color:#8888aa;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Doğrulama Kodu</p>
              <div style="font-family:'Courier New',monospace;font-size:40px;font-weight:900;letter-spacing:16px;color:#4f8cff;text-shadow:0 0 20px rgba(79,140,255,0.4);">${code}</div>
            </div>` : ''}
            <div style="background:#1a1a0a;border-left:3px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
              <p style="margin:0;color:#f59e0b;font-size:12px;">⚠️ Bu işlemi sen yapmadıysan bu e-postayı güvenle yoksayabilirsin.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#0d0d1a;padding:20px 40px;border-top:1px solid #1e1e2e;text-align:center;">
            <p style="margin:0;color:#555566;font-size:12px;">${footerText}</p>
            <p style="margin:8px 0 0;color:#333344;font-size:11px;">TechBrowser © 2025 · Tüm hakları saklıdır</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ══════════════════════════════════════════
//  AUTH — Kullanıcı veritabanı
//  🔒 DÜZELTİLDİ: OTP store dosyaya persist ediliyor
// ══════════════════════════════════════════
const USERS_PATH    = path.join(app.getPath('userData'), 'techbrowser-users.json');
const OTP_STORE_PATH = path.join(app.getPath('userData'), 'techbrowser-otp.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); }
  catch(e) { return {}; }
}
function saveUsers(users) {
  try { fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2)); return true; }
  catch(e) { return false; }
}

// OTP'leri dosyaya kaydet — uygulama yeniden başlasa bile kalmaya devam eder
function loadOtpStore() {
  try { return JSON.parse(fs.readFileSync(OTP_STORE_PATH, 'utf8')); }
  catch(e) { return {}; }
}
function saveOtpStore(store) {
  try { fs.writeFileSync(OTP_STORE_PATH, JSON.stringify(store)); }
  catch(e) { console.error('[OTP Store Hata]', e.message); }
}
function getOtp(key) {
  const store = loadOtpStore();
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    delete store[key];
    saveOtpStore(store);
    return null;
  }
  return entry;
}
function setOtp(key, value) {
  const store = loadOtpStore();
  store[key] = value;
  saveOtpStore(store);
}
function deleteOtp(key) {
  const store = loadOtpStore();
  delete store[key];
  saveOtpStore(store);
}

async function hashPassword(pass) {
  return bcrypt.hash(pass, BCRYPT_ROUNDS);
}
async function verifyPassword(pass, hash) {
  return bcrypt.compare(pass, hash);
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// KAYIT OL
ipcMain.handle('auth-register', async (event, { name, email, password }) => {
  try {
    // 🔒 Input validasyonu
    if (!name || !email || !password) return { success: false, error: 'Tüm alanlar zorunludur.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'Geçersiz e-posta.' };
    if (password.length < 8) return { success: false, error: 'Şifre en az 8 karakter olmalı.' };

    const users = loadUsers();
    if (users[email]) return { success: false, error: 'Bu e-posta zaten kayıtlı.' };

    const otp    = generateOTP();
    const hashed = await hashPassword(password);

    setOtp(email, {
      code:        otp,
      expires:     Date.now() + 10 * 60 * 1000,
      pendingUser: { name, email, password: hashed },
    });

    await sendMail(email, '🔐 TechBrowser — E-posta Doğrulama', buildMailHtml({
      title:     'E-postanı Doğrula',
      subtitle:  `Merhaba ${name}, aramıza hoş geldin!`,
      bodyText:  'Hesabını aktifleştirmek için aşağıdaki 6 haneli doğrulama kodunu TechBrowser uygulamasına gir.',
      code:      otp,
      footerText: 'Bu kod 10 dakika geçerlidir · techbrowser://verify',
    }));
    return { success: true, step: 'verify' };
  } catch(e) {
    return { success: false, error: 'E-posta gönderilemedi: ' + e.message };
  }
});

// OTP DOĞRULA
ipcMain.handle('auth-verify-otp', async (event, { email, code }) => {
  const entry = getOtp(email);
  if (!entry) return { success: false, error: 'Kod bulunamadı veya süresi doldu. Tekrar kayıt ol.' };
  if (entry.code !== code.trim()) return { success: false, error: 'Yanlış kod.' };

  const users = loadUsers();
  users[email] = { ...entry.pendingUser, createdAt: new Date().toISOString() };
  saveUsers(users);
  deleteOtp(email);
  return { success: true, user: { name: users[email].name, email } };
});

// GİRİŞ YAP
ipcMain.handle('auth-login', async (event, { email, password }) => {
  if (!email || !password) return { success: false, error: 'E-posta ve şifre zorunludur.' };
  const users = loadUsers();
  const user  = users[email];
  if (!user) return { success: false, error: 'Bu e-posta ile kayıtlı hesap bulunamadı.' };
  const ok = await verifyPassword(password, user.password);
  if (!ok) return { success: false, error: 'Şifre yanlış.' };
  return { success: true, user: { name: user.name, email } };
});

// ŞİFRE SIFIRLA — Kod Gönder
ipcMain.handle('auth-forgot', async (event, { email }) => {
  try {
    if (!email) return { success: false, error: 'E-posta zorunludur.' };
    const users = loadUsers();
    if (!users[email]) return { success: false, error: 'Bu e-posta ile kayıtlı hesap bulunamadı.' };

    const otp = generateOTP();
    setOtp('reset_' + email, { code: otp, expires: Date.now() + 10 * 60 * 1000 });

    await sendMail(email, '🔑 TechBrowser — Şifre Sıfırlama', buildMailHtml({
      title:     'Şifreni Sıfırla',
      subtitle:  'Hesabına erişimi geri kazanmak için kodu kullan.',
      bodyText:  'Aşağıdaki 6 haneli kodu TechBrowser uygulamasındaki şifre sıfırlama ekranına gir.',
      code:      otp,
      footerText: 'Bu kod 10 dakika geçerlidir · Eğer şifreni sıfırlamak istemediysen hesabın güvende.',
    }));
    return { success: true };
  } catch(e) {
    return { success: false, error: 'E-posta gönderilemedi: ' + e.message };
  }
});

// ŞİFRE SIFIRLA — Yeni Şifre Kaydet
ipcMain.handle('auth-reset-password', async (event, { email, code, newPassword }) => {
  if (!newPassword || newPassword.length < 8)
    return { success: false, error: 'Yeni şifre en az 8 karakter olmalı.' };

  const entry = getOtp('reset_' + email);
  if (!entry) return { success: false, error: 'Kod bulunamadı veya süresi doldu.' };
  if (entry.code !== code.trim()) return { success: false, error: 'Yanlış kod.' };

  const users = loadUsers();
  if (!users[email]) return { success: false, error: 'Hesap bulunamadı.' };
  users[email].password = await hashPassword(newPassword);
  saveUsers(users);
  deleteOtp('reset_' + email);
  return { success: true };
});

// ══════════════════════════════════════════
//  UYGULAMA OLAYLARI
// ══════════════════════════════════════════
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Pencere kontrolleri
  minimize:   () => ipcRenderer.send('win-minimize'),
  maximize:   () => ipcRenderer.send('win-maximize'),
  close:      () => ipcRenderer.send('win-close'),
  fullscreen: () => ipcRenderer.send('fullscreen'),

  // İndirme
  onDownloadStarted:   (cb) => ipcRenderer.on('download-started',  (_e, d) => cb(d)),
  onDownloadProgress:  (cb) => ipcRenderer.on('download-progress', (_e, d) => cb(d)),
  onDownloadDone:      (cb) => ipcRenderer.on('download-done',     (_e, d) => cb(d)),
  openDownload:        (p)  => ipcRenderer.send('open-download', p),
  openDownloadsFolder: ()   => ipcRenderer.send('open-downloads-folder'),

  // Veri kaydet/yükle
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  loadData: ()     => ipcRenderer.invoke('load-data'),

  // Pencere durumu
  onWindowState: (cb) => ipcRenderer.on('win-state', (_e, s) => cb(s)),

  // VPN
  vpnConnect:    (country) => ipcRenderer.invoke('vpn-connect', country),
  vpnDisconnect: ()        => ipcRenderer.invoke('vpn-disconnect'),

  // ── AUTH ──────────────────────────────────────────────
  authRegister:      (data) => ipcRenderer.invoke('auth-register', data),
  authVerifyOtp:     (data) => ipcRenderer.invoke('auth-verify-otp', data),
  authLogin:         (data) => ipcRenderer.invoke('auth-login', data),
  authForgot:        (data) => ipcRenderer.invoke('auth-forgot', data),
  authResetPassword: (data) => ipcRenderer.invoke('auth-reset-password', data),
  sendEmail:         (data) => ipcRenderer.invoke('send-email', data),

  // Google Auth popup
  openGoogleAuth: (url) => ipcRenderer.invoke('open-google-auth', url),

  // Sistem tarayıcısında aç
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ── TERMS ────────────────────────────────────────────────────────────────
  onShowTerms:  (cb) => ipcRenderer.on('show-terms', () => cb()),
  acceptTerms:  ()   => ipcRenderer.invoke('accept-terms'),
  termsStatus:  ()   => ipcRenderer.invoke('terms-status'),

  // ── GROQ KEY ─────────────────────────────────────────────────────────────
  getGroqKey: () => ipcRenderer.invoke('get-groq-key'),

  // ── AUTO-UPDATE ───────────────────────────────────────────────────────────
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_e, d) => cb(d)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded',  (_e, d) => cb(d)),
  onShowChangelog:    (cb) => ipcRenderer.on('show-changelog',    (_e, d) => cb(d)),
  downloadUpdate:     ()   => ipcRenderer.invoke('download-update'),
  installUpdate:      ()   => ipcRenderer.invoke('install-update'),
});

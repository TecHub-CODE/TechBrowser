'use strict';

const { contextBridge, ipcRenderer, webFrame } = require('electron');

// ══════════════════════════════════════════
//  TECHBROWSER02 PRELOAD — v2.8.0
//  contextIsolation: true — nodeIntegration: false
// ══════════════════════════════════════════

const ALLOWED_INVOKE = [
  'win-minimize',
  'win-maximize',
  'win-close',
  'fullscreen',
  'save-data',
  'load-data',
  'passwords-save',
  'passwords-load',
  'accept-terms',
  'terms-status',
  'onboarding-status',
  'import-browser-data',
  'complete-onboarding',
  'open-google-auth',
  'auth-begin',
  'auth-finish',
  'auth-register',
  'auth-reset',
  'auth-profile',
  'auth-logout',
  'auth-resend-verification',
  'auth-mfa-enroll-start',
  'auth-mfa-enroll-finish',
  'profile-save-avatar',
  'site-settings',
  'cancel-download',
  'can-suspend-tab',
  'capture-page',
  'sync-data',
  'open-external',
  'open-download',
  'open-downloads-folder',
  'vpn-connect',
  'vpn-disconnect',
  'is-default-browser',
  'set-default-browser',
  'groq-query',
  'ai-status',
  'ai-save-key',
  'ai-migrate-keys',
  'ai-query',
  'download-update',
  'install-update',
  'check-for-updates',
  'clear-browsing-data',
  'clear-incognito-data',
  'search-spelling-suggestions',
  // ── v2.7.0 ──
  'get-app-version',
  'speedtest-run',
  // ── v2.8.0 ──
  'vpn-status',
  'get-memory-stats',
  'performance-mode-status',
  'performance-mode-set',
  'auth-delete-account',
  'submit-report',
];

const ALLOWED_ON = [
  'new-tab-request',
  'embedded-google-auth',
  'download-started',
  'download-progress',
  'download-done',
  'update-available',
  'update-progress',
  'update-downloaded',
  'update-error',
  'show-changelog',
  'show-terms',
  // ── v2.7.0 ──
  'speedtest-progress',
];

contextBridge.exposeInMainWorld('electronAPI', {
  // Pencere
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close: () => ipcRenderer.send('win-close'),
  fullscreen: () => ipcRenderer.send('fullscreen'),

  // Genel invoke
  invoke: (channel, ...args) => {
    if (ALLOWED_INVOKE.includes(channel)) return ipcRenderer.invoke(channel, ...args);
    return Promise.reject(new Error('Kanal izni yok: ' + channel));
  },

  // Genel on
  on: (channel, callback) => {
    if (ALLOWED_ON.includes(channel)) {
      const sub = (_, ...args) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
  },

  // Veri
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  loadData: () => ipcRenderer.invoke('load-data'),

  // Chromium'un yerel sözlüğü; yazılan metin veya öneriler dışarı gönderilmez.
  spellingSuggestions: (word) => {
    if (typeof word !== 'string' || word.length < 2 || word.length > 64) return [];
    if (!webFrame.isWordMisspelled(word)) return [];
    return webFrame.getWordSuggestions(word).slice(0, 3);
  },
  searchSpellingSuggestions: (payload) =>
    ipcRenderer.invoke('search-spelling-suggestions', payload),

  // Şifre yöneticisi (main'de şifreli saklanır)
  savePasswords: (list) => ipcRenderer.invoke('passwords-save', list),
  loadPasswords: () => ipcRenderer.invoke('passwords-load'),

  // Auth — Firebase oturumu main process içinde yönetilir
  acceptTerms: () => ipcRenderer.invoke('accept-terms'),
  termsStatus: () => ipcRenderer.invoke('terms-status'),

  // Google Auth
  openGoogleAuth: (options) => ipcRenderer.invoke('open-google-auth', options),

  // E-posta 2FA — kod main process'te üretilir/doğrulanır
  send2FACode: (p) => ipcRenderer.invoke('auth-begin', p),
  verify2FACode: (p) => ipcRenderer.invoke('auth-finish', p),

  // Dosya & indirme
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openDownload: (fp) => ipcRenderer.send('open-download', fp),
  openDownloadsFolder: () => ipcRenderer.send('open-downloads-folder'),

  // VPN — v2.8.0
  vpnConnect: (code) => ipcRenderer.invoke('vpn-connect', code),
  vpnDisconnect: () => ipcRenderer.invoke('vpn-disconnect'),
  vpnStatus: () => ipcRenderer.invoke('vpn-status'),

  // Bellek
  getMemoryStats: () => ipcRenderer.invoke('get-memory-stats'),

  // Varsayılan tarayıcı
  isDefaultBrowser: () => ipcRenderer.invoke('is-default-browser'),
  setDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),

  // AI — Anahtar renderer'a hiçbir zaman gönderilmez
  groqQuery: (messages) => ipcRenderer.invoke('groq-query', messages),

  // Güncelleme
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Gizlilik
  clearBrowsingData: () => ipcRenderer.invoke('clear-browsing-data'),
  clearIncognitoData: () => ipcRenderer.invoke('clear-incognito-data'),

  // Hesap & Destek — v2.8.0
  deleteAccount: (p) => ipcRenderer.invoke('auth-delete-account', p),
  submitReport: (p) => ipcRenderer.invoke('submit-report', p),

  // ── v2.7.0 ──────────────────────────────────────────────────
  // Sürüm — her zaman package.json'dan dinamik okur
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Speedtest
  runSpeedtest: () => ipcRenderer.invoke('speedtest-run'),
  onSpeedtestProgress: (cb) => {
    const sub = (_, data) => cb(data);
    ipcRenderer.on('speedtest-progress', sub);
    return () => ipcRenderer.removeListener('speedtest-progress', sub);
  },
  // ────────────────────────────────────────────────────────────

  // Event listener'lar
  onDownloadStarted: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('download-started', s);
    return () => ipcRenderer.removeListener('download-started', s);
  },
  onDownloadProgress: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('download-progress', s);
    return () => ipcRenderer.removeListener('download-progress', s);
  },
  onDownloadDone: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('download-done', s);
    return () => ipcRenderer.removeListener('download-done', s);
  },
  onUpdateAvailable: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('update-available', s);
    return () => ipcRenderer.removeListener('update-available', s);
  },
  onUpdateProgress: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('update-progress', s);
    return () => ipcRenderer.removeListener('update-progress', s);
  },
  onUpdateDownloaded: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('update-downloaded', s);
    return () => ipcRenderer.removeListener('update-downloaded', s);
  },
  onUpdateError: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('update-error', s);
    return () => ipcRenderer.removeListener('update-error', s);
  },
  onShowChangelog: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('show-changelog', s);
    return () => ipcRenderer.removeListener('show-changelog', s);
  },
  onShowTerms: (cb) => {
    const s = (_, ...a) => cb(...a);
    ipcRenderer.on('show-terms', s);
    return () => ipcRenderer.removeListener('show-terms', s);
  },
});

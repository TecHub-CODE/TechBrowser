// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
function readLocalJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
var cu = null,
  ct = 'default',
  readerOn = false,
  findOpen = false;
var incognito = false,
  zoom = 100;
var tabCnt = 1,
  activeTabId = 0,
  curPanel = null;
var hist = [],
  bookmarkList = [],
  dlList = [];
var installedExt = new Set(['adblock', 'darkmode', 'notif', 'scroll']);

// OTP state
var _otpPending = null; // {type:'register'|'login'|'reset', data:{...}, code:str, email:str}

function ico(n) {
  return '<svg class="icon"><use href="#i-' + n + '"/></svg>';
}
var SE = {
  google: {
    name: 'Google',
    url: 'https://www.google.com/search?q=',
    badge: 'G',
    ic: ico('search'),
  },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', badge: 'B', ic: ico('diamond') },
  duck: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', badge: 'D', ic: ico('search') },
  yandex: { name: 'Yandex', url: 'https://yandex.com/search/?text=', badge: 'Y', ic: ico('dot') },
};
var THEMES = {
  default: { name: 'Grafit', bg: '#0a0b0d', s: '#13161b', ac: '#e7ecf3' },
  light: { name: 'Açık', bg: '#f5f6f8', s: '#ffffff', ac: '#414852' },
  midnight: { name: 'Gece', bg: '#171c23', s: '#1e2630', ac: '#a1b8cd' },
  stone: { name: 'Taş', bg: '#1b1a17', s: '#23221e', ac: '#c1b188' },
  rose: { name: 'Mürdüm', bg: '#201a1b', s: '#282022', ac: '#c7a1a5' },
};
var ACCENT_CHOICES = {
  white: { name: 'Beyaz', dark: '#e7ecf3', light: '#414852' },
  blue: { name: 'Mavi', dark: '#73a9ff', light: '#2563eb' },
  purple: { name: 'Mor', dark: '#b197fc', light: '#7c3aed' },
  green: { name: 'Yeşil', dark: '#63d7a0', light: '#16865a' },
  orange: { name: 'Turuncu', dark: '#ff9d66', light: '#c85a17' },
};
var EXT_STORE = [
  {
    id: 'adblock',
    ic: ico('shieldcheck'),
    name: 'Reklam engelleme',
    cat: 'Gizlilik',
    desc: 'Bilinen reklam ve takip alan adlarını engeller.',
    key: 'adBlock',
  },
  {
    id: 'darkmode',
    ic: ico('moon'),
    name: 'Koyu sayfalar',
    cat: 'Görünüm',
    desc: 'Sayfalara koyu görünüm uygular.',
    key: 'darkMode',
  },
  {
    id: 'notif',
    ic: ico('bell'),
    name: 'Site bildirimleri',
    cat: 'Verimlilik',
    desc: 'Bildirim göndermek isteyen siteler için izin sorar.',
    key: 'notifications',
  },
  {
    id: 'scroll',
    ic: ico('scroll'),
    name: 'Akıcı kaydırma',
    cat: 'Navigasyon',
    desc: 'Akıcı kaydırma.',
    key: 'smoothScroll',
  },
  {
    id: 'vpn',
    ic: ico('shield'),
    name: 'Proxy bağlantısı',
    cat: 'Gizlilik',
    desc: 'Seçilen proxy üzerinden bağlantı kurar.',
    key: null,
  },
  {
    id: 'tabgroup',
    ic: ico('grid'),
    name: 'Sekme gruplama',
    cat: 'Verimlilik',
    desc: 'Sekmeleri gruplar.',
    key: null,
  },
  {
    id: 'password',
    ic: ico('key'),
    name: 'Şifreler',
    cat: 'Güvenlik',
    desc: 'Şifre yöneticisi.',
    key: null,
  },
  {
    id: 'translate',
    ic: ico('globe'),
    name: 'Sayfa çevirisi',
    cat: 'Araçlar',
    desc: 'Sayfaları Türkçeye çevirir.',
    key: null,
  },
  {
    id: 'screenshot',
    ic: ico('camera'),
    name: 'Ekran görüntüsü',
    cat: 'Araçlar',
    desc: 'Görünen sayfanın ekran görüntüsü.',
    key: null,
  },
  {
    id: 'grammar',
    ic: ico('check'),
    name: 'Yazım Kontrolü',
    cat: 'Verimlilik',
    desc: 'Türkçe yazım denetçisi.',
    key: 'spellcheck',
  },
];
var cfg = {
  darkMode: false,
  spellcheck: true,
  adBlock: true,
  smoothScroll: true,
  notifications: false,
  saveHistory: true,
  serifFont: false,
  fontSize: 15,
  theme: 'default',
  accentColor: 'white',
  searchEngine: 'google',
  ramLimit: 512,
  verticalTabs: false,
};
var tabData = {};

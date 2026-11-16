'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// node:sqlite is only available in newer Node/Electron releases. Electron 22,
// which is used by the Windows 8.1 compatibility build, does not provide it.
// Load it lazily so an optional history import never prevents the browser from
// starting. Bookmark import remains available on legacy systems.
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {}

const MAX_ITEMS = 200;

function safeWebUrl(value) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      return null;
    return parsed.href.slice(0, 4096);
  } catch {
    return null;
  }
}

function collectBookmarkNodes(node, output) {
  if (!node || output.length >= MAX_ITEMS) return;
  if (Array.isArray(node)) {
    for (const item of node) collectBookmarkNodes(item, output);
    return;
  }
  const url = safeWebUrl(node.url);
  if (url) {
    output.push({
      url,
      title: String(node.name || url).slice(0, 300),
      time: 'İçe aktarıldı',
    });
  }
  if (Array.isArray(node.children)) collectBookmarkNodes(node.children, output);
}

function readBookmarks(profilePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(path.join(profilePath, 'Bookmarks'), 'utf8'));
    const result = [];
    collectBookmarkNodes(Object.values(payload.roots || {}), result);
    return result;
  } catch {
    return [];
  }
}

function chromiumTime(value) {
  const millis = Number(value) / 1000 - 11644473600000;
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('tr-TR') : 'İçe aktarıldı';
}

function readHistory(profilePath) {
  if (!DatabaseSync) return [];
  const source = path.join(profilePath, 'History');
  if (!fs.existsSync(source)) return [];
  const temporary = path.join(
    os.tmpdir(),
    `techbrowser-history-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
  let database;
  try {
    fs.copyFileSync(source, temporary);
    database = new DatabaseSync(temporary);
    const statement = database.prepare(
      'SELECT url, title, last_visit_time FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 200',
    );
    statement.setReadBigInts(true);
    return statement
      .all()
      .map((row) => {
        const url = safeWebUrl(row.url);
        if (!url) return null;
        return {
          url,
          title: String(row.title || url).slice(0, 300),
          time: chromiumTime(row.last_visit_time),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    try {
      database?.close();
    } catch {}
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
}

function browserProfiles(localAppData = process.env.LOCALAPPDATA, appData = process.env.APPDATA) {
  return [
    ['Chrome', localAppData && path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default')],
    ['Edge', localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default')],
    [
      'Brave',
      localAppData &&
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default'),
    ],
    ['Opera', appData && path.join(appData, 'Opera Software', 'Opera Stable')],
    ['Opera GX', appData && path.join(appData, 'Opera Software', 'Opera GX Stable')],
  ].filter(([, profilePath]) => profilePath && fs.existsSync(profilePath));
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function importBrowserData(options = {}) {
  const profiles = browserProfiles(options.localAppData, options.appData);
  const bookmarks = [];
  const history = [];
  const sources = [];
  for (const [name, profilePath] of profiles) {
    const sourceBookmarks = readBookmarks(profilePath);
    const sourceHistory = readHistory(profilePath);
    if (sourceBookmarks.length || sourceHistory.length) sources.push(name);
    bookmarks.push(...sourceBookmarks);
    history.push(...sourceHistory);
  }
  return {
    bookmarks: uniqueByUrl(bookmarks).slice(0, MAX_ITEMS),
    history: uniqueByUrl(history).slice(0, MAX_ITEMS),
    sources,
  };
}

module.exports = { importBrowserData, safeWebUrl };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { importBrowserData, safeWebUrl } = require('../src/browser-import');

test('browser import reads Chromium bookmarks and history without accepting unsafe URLs', () => {
  const runtime = path.join(__dirname, '.runtime');
  fs.mkdirSync(runtime, { recursive: true });
  const root = fs.mkdtempSync(path.join(runtime, 'browser-import-'));
  try {
    const local = path.join(root, 'local');
    const roaming = path.join(root, 'roaming');
    const profile = path.join(local, 'Google', 'Chrome', 'User Data', 'Default');
    fs.mkdirSync(profile, { recursive: true });
    fs.mkdirSync(roaming, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bookmark_bar: {
            children: [
              { name: 'TechBrowser', url: 'https://techbrowser.site/' },
              { name: 'Unsafe', url: 'file:///C:/secret.txt' },
            ],
          },
        },
      }),
    );
    const database = new DatabaseSync(path.join(profile, 'History'));
    database.exec(
      'CREATE TABLE urls (url TEXT, title TEXT, last_visit_time INTEGER, hidden INTEGER)',
    );
    database
      .prepare('INSERT INTO urls VALUES (?, ?, ?, ?)')
      .run('https://example.test/', 'Example', 13380163200000000, 0);
    database.close();

    const result = importBrowserData({ localAppData: local, appData: roaming });
    assert.deepEqual(result.sources, ['Chrome']);
    assert.equal(result.bookmarks.length, 1);
    assert.equal(result.bookmarks[0].url, 'https://techbrowser.site/');
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].url, 'https://example.test/');
    assert.equal(safeWebUrl('https://user:pass@example.test/'), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

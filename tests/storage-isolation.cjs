'use strict';
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { clearBrowsingData } = require('../src/browsing-data');

const profile = path.join(__dirname, '.runtime', 'storage-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
const fixture = path.join(profile, 'app.html');
fs.writeFileSync(fixture, '<!doctype html><title>Storage regression test</title>');

app.whenReady().then(async () => {
  const server = http.createServer((req, res) => res.end('<!doctype html><title>Website</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const ui = new BrowserWindow({ show: false });
  const site = new BrowserWindow({ show: false });
  try {
    await ui.loadFile(fixture);
    await site.loadURL(url);
    await ui.webContents.executeJavaScript("localStorage.setItem('tb_notes', 'keep'); localStorage.setItem('tb_ai_keys', 'legacy-key')");
    await site.webContents.executeJavaScript("localStorage.setItem('website-data', 'remove'); document.cookie='site=value'");
    await clearBrowsingData(session, ui.webContents.getURL());
    assert.equal(await ui.webContents.executeJavaScript("localStorage.getItem('tb_notes')"), 'keep');
    assert.equal(await ui.webContents.executeJavaScript("localStorage.getItem('tb_ai_keys')"), 'legacy-key');
    assert.equal(await site.webContents.executeJavaScript("localStorage.getItem('website-data')"), null);
    assert.equal((await session.defaultSession.cookies.get({ url })).length, 0);
    await ui.reload();
    await new Promise(resolve => ui.webContents.once('did-finish-load', resolve));
    assert.equal(await ui.webContents.executeJavaScript("localStorage.getItem('tb_notes')"), 'keep');
    console.log('PASS browsing cleanup removes website data and preserves app data after reload');
    app.exit(0);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => app.exit(2), 30000).unref();

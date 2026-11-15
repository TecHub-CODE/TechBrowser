// Runs the actual source app using a separate disposable profile, never the user's data.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const label = process.argv[2] || 'baseline';
const root = path.join(__dirname, '.runtime', label + '-' + Date.now());
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', root);
fs.writeFileSync(path.join(root, 'techbrowser-settings.json'), JSON.stringify({ termsAccepted: true, termsAcceptedVersion: require('../src/app-config').TERMS_VERSION }));
require('../main');
app.whenReady().then(async () => {
  await new Promise(resolve => setTimeout(resolve, 20000));
  const win = BrowserWindow.getAllWindows()[0];
  const samples = [];
  for (let i = 0; i < 3; i++) {
    samples.push(app.getAppMetrics().map(m => ({ pid: m.pid, type: m.type, memory: m.memory })));
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  const ui = await win.webContents.executeJavaScript(`({webviews:document.querySelectorAll('webview').length,video:document.querySelectorAll('video').length})`);
  const report = { label, ui, samples };
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'results', label + '.json'), JSON.stringify(report, null, 2));
  console.log('BENCHMARK', JSON.stringify(report));
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });

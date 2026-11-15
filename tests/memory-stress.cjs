const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const label = process.argv[2] || 'memory-stress';
const profile = path.join(__dirname, '.runtime', label + '-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
fs.writeFileSync(
  path.join(profile, 'techbrowser-settings.json'),
  JSON.stringify({
    termsAccepted: true,
    termsAcceptedVersion: require('../src/app-config').TERMS_VERSION,
  }),
);
if (label.includes('performance')) {
  fs.writeFileSync(path.join(profile, 'performance-mode.json'), JSON.stringify({ enabled: true }));
}

const server = http.createServer((_, response) => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`<!doctype html><meta charset="utf-8"><title>Bellek baskı testi</title>
    <canvas width="1280" height="720"></canvas><main></main><script>
    const heap=[];for(let i=0;i<6;i++){const block=new Uint8Array(1024*1024);block.fill(i+1);heap.push(block)}
    const main=document.querySelector('main');for(let i=0;i<1400;i++){const el=document.createElement('span');el.textContent='TechBrowser '+i;main.appendChild(el)}
    const ctx=document.querySelector('canvas').getContext('2d');for(let i=0;i<1200;i++){ctx.fillStyle='hsl('+i%360+' 70% 55%)';ctx.fillRect(i%1280,(i*13)%720,18,18)}
    setInterval(()=>document.title='Bellek baskı testi '+Date.now(),1000);
    </script>`);
});

function snapshot(name) {
  const metrics = app.getAppMetrics().map((item) => ({
    pid: item.pid,
    type: item.type,
    privateKB: item.memory.privateBytes,
    workingSetKB: item.memory.workingSetSize,
  }));
  return {
    name,
    privateMB: Math.round(metrics.reduce((sum, item) => sum + item.privateKB, 0) / 1024),
    workingSetMB: Math.round(metrics.reduce((sum, item) => sum + item.workingSetKB, 0) / 1024),
    processCount: metrics.length,
    metrics,
  };
}

async function until(win, expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression).catch(() => false)) return;
    await delay(100);
  }
  throw Error('Stress condition timed out: ' + expression);
}

require('../main');
app
  .whenReady()
  .then(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await delay(3500);
    const win = BrowserWindow.getAllWindows()[0];
    assert.ok(win, 'Main window opened');
    const url = `http://127.0.0.1:${server.address().port}/stress`;
    await win.webContents.executeJavaScript('skipIntro()');
    await delay(2500);
    const performanceUI = await win.webContents.executeJavaScript(
      `({active:window.performanceMode===true,bodyClass:document.body.classList.contains('performance-mode')})`,
    );
    if (label.includes('performance')) {
      assert.deepEqual(performanceUI, { active: true, bodyClass: true });
    }
    const report = {
      label,
      tabCount: 8,
      cycles: 3,
      performanceUI,
      samples: [snapshot('baseline')],
    };

    for (let cycle = 1; cycle <= report.cycles; cycle++) {
      await win.webContents.executeJavaScript(
        `for(let i=0;i<${report.tabCount};i++)newTab(false,${JSON.stringify(url)}+'?cycle=${cycle}&tab='+i)`,
      );
      await until(win, `document.querySelectorAll('webview').length===${report.tabCount}`, 20000);
      await delay(5000);
      report.samples.push(snapshot('cycle-' + cycle + '-loaded'));
      await win.webContents.executeJavaScript(
        `(()=>{for(const id of Object.keys(tabData)){const tab=tabData[id];if(!String(tab.url||'').startsWith(${JSON.stringify(url)}))continue;const close=document.querySelector('.tab[data-id="'+id+'"] .tab-x');if(close)closeTab({stopPropagation(){}},close)}})()`,
      );
      await until(win, `document.querySelectorAll('webview').length===0`, 15000);
      await delay(7000);
      report.samples.push(snapshot('cycle-' + cycle + '-recovered'));
    }

    report.finalUI = await win.webContents.executeJavaScript(
      `({webviews:document.querySelectorAll('webview').length,canvases:document.querySelectorAll('canvas').length,tabs:Object.keys(tabData).length})`,
    );
    const baseline = report.samples[0].privateMB;
    const final = report.samples[report.samples.length - 1].privateMB;
    report.peakPrivateMB = Math.max(...report.samples.map((sample) => sample.privateMB));
    report.recoveredDeltaMB = final - baseline;
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, 'results', label + '.json'),
      JSON.stringify(report, null, 2),
    );
    assert.equal(report.finalUI.webviews, 0, 'All stress webviews must be destroyed');
    assert.ok(report.recoveredDeltaMB < 140, 'Closed tabs retained too much private memory');
    console.log('STRESS', JSON.stringify(report));
    server.close();
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    server.close();
    app.exit(1);
  });

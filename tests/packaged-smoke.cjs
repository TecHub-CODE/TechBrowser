const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const profile = path.join(__dirname, '.runtime', 'packaged-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  const packagedExecutable = process.env.TECHBROWSER_PACKAGED_EXE
    ? path.resolve(process.env.TECHBROWSER_PACKAGED_EXE)
    : path.resolve('dist/win-unpacked/TechBrowser02.exe');
  const child = spawn(
    packagedExecutable,
    ['--user-data-dir=' + path.resolve(profile), '--remote-debugging-port=0'],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      await delay(200);
      const file = path.join(profile, 'DevToolsActivePort');
      if (fs.existsSync(file)) {
        port = fs.readFileSync(file, 'utf8').split('\n')[0];
        break;
      }
      if (child.exitCode !== null) throw Error('App exited ' + child.exitCode);
    }
    assert.ok(port, 'Isolated packaged app exposes ready window');
    let page;
    for (let i = 0; i < 50 && !page; i++) {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      page = pages.find((item) => item.url.includes('index.html'));
      if (!page) await delay(100);
    }
    assert.ok(page);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const evaluate = (expression) =>
      new Promise((resolve, reject) => {
        const callId = ++id;
        const timer = setTimeout(() => {
          socket.removeEventListener('message', receive);
          reject(Error('Renderer evaluation timed out'));
        }, 5000);
        function receive(event) {
          const message = JSON.parse(event.data);
          if (message.id !== callId) return;
          clearTimeout(timer);
          socket.removeEventListener('message', receive);
          if (message.error || message.result.exceptionDetails)
            reject(Error('Renderer evaluation failed'));
          else resolve(message.result.result.value);
        }
        socket.addEventListener('message', receive);
        socket.send(
          JSON.stringify({
            id: callId,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true },
          }),
        );
      });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      ready = await evaluate(
        "typeof tabData !== 'undefined' && !!tabData[0] && !!window.electronAPI",
      );
      if (ready) break;
      await delay(100);
    }
    assert.equal(ready, true, 'Packaged renderer initialized');
    assert.equal(
      await evaluate('window.electronAPI.getAppVersion()'),
      require('../package.json').version,
    );
    assert.equal(
      await evaluate('document.querySelector(\'link[href="styles/layout.css"]\').sheet !== null'),
      true,
    );
    assert.equal(
      await evaluate("getComputedStyle(document.querySelector('body > svg')).display"),
      'none',
    );
    assert.deepEqual(
      await evaluate(`({
        tabs: Object.values(tabData).map(tab => tab.title),
        page: document.querySelector('.first-run-page.active')?.id
      })`),
      { tabs: ['Başlangıç', 'Kısa Anket'], page: 'firstRunSetup' },
      'Clean packaged profile opens both first-run tabs with setup active',
    );
    assert.equal(
      await evaluate(
        "(()=>{const before=Object.keys(tabData).length;document.querySelector('[data-ui=ui-12]').click();return Object.keys(tabData).length===before+1})()",
      ),
      true,
    );
    console.log(
      'PASS packaged renderer initializes, exposes expected version, loads styles and binds buttons',
    );
  } finally {
    socket?.close();
    child.kill();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

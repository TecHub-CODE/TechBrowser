const { app, BrowserWindow, session, dialog, net } = require('electron');
const fs = require('fs'),
  path = require('path'),
  http = require('http'),
  assert = require('assert/strict');
const root = path.join(__dirname, '.runtime', 'integration-' + Date.now());
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', root);
app.setPath('downloads', root);
fs.writeFileSync(
  path.join(root, 'techbrowser-settings.json'),
  JSON.stringify({
    termsAccepted: true,
    termsAcceptedVersion: require('../src/app-config').TERMS_VERSION,
  }),
);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
let permissionDecision = 1;
dialog.showMessageBox = async () => ({ response: permissionDecision });
const results = [],
  errors = [];
app.on('web-contents-created', (_, wc) =>
  wc.on('console-message', (details) => {
    if (details.level === 'error' && !details.message.includes('Content Security Policy'))
      errors.push({ message: details.message, source: details.sourceId, line: details.lineNumber });
  }),
);
let lastOtp = '',
  rejectDeletion = false;
const authModule = require('../src/auth-service'),
  realAuthFactory = authModule.createAuthService;
authModule.createAuthService = (options) =>
  realAuthFactory({
    ...options,
    cloudSyncEnabled: false,
    sendMail: async (email, code) => {
      lastOtp = code;
    },
    request: async (url, options) => ({
      ok: !(rejectDeletion && url.includes('accounts:delete')),
      json: async () =>
        url.includes('accounts:delete') && rejectDeletion
          ? { error: { message: 'NETWORK_TEST_FAILURE' } }
          : url.includes('signInWithPassword')
            ? { idToken: 'test-token', refreshToken: 'test-refresh' }
            : url.includes('mfaEnrollment:start')
              ? {
                  totpSessionInfo: {
                    sharedSecretKey: 'JBSWY3DPEHPK3PXP',
                    sessionInfo: 'test-session',
                    hashingAlgorithm: 'SHA1',
                    verificationCodeLength: 6,
                    periodSec: 30,
                  },
                }
              : url.includes('lookup')
                ? {
                    users: [
                      { localId: 'test-uid', email: 'test@example.test', emailVerified: true },
                    ],
                  }
                : {},
    }),
  });
require('../main');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win;
const evaluate = (code) => win.webContents.executeJavaScript(code, true);
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, passed: false, error: e.stack });
    console.error('FAIL', name, e.message);
  }
}
async function until(code) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(code)) return;
    await sleep(100);
  }
  throw Error('Timed out: ' + code);
}
app
  .whenReady()
  .then(async () => {
    await sleep(2500);
    win = BrowserWindow.getAllWindows()[0];
    await until("typeof tabData!=='undefined' && !!tabData[0]");
    await evaluate(
      "window.addEventListener('error',event=>console.error('Runtime stack: '+event.error?.stack))",
    );
    const server = http.createServer((req, res) => {
      if (req.url === '/slow') {
        res.writeHead(200, {
          'Content-Disposition': 'attachment; filename=test.bin',
          'Content-Type': 'application/octet-stream',
          'Content-Length': 10000000,
        });
        const timer = setInterval(() => res.write(Buffer.alloc(4096)), 50);
        req.on('close', () => clearInterval(timer));
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><title>Test article</title><article><h1>Reader test</h1><p>This is the test article content.</p><input id="draft" value=""></article>',
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port;
    await test('startup animation plays and releases its video after ending', async () => {
      await until(
        "!!document.getElementById('introVideo') && document.getElementById('introVideo').currentTime>0",
      );
      await until("document.getElementById('introVideo')===null");
      assert.equal(await evaluate("document.getElementById('introOverlay')===null"), true);
    });
    await test('clean startup and all required channels wired', async () => {
      assert.equal(await evaluate('!!window._dataReadFailed'), false);
      assert.equal(await evaluate("document.querySelectorAll('video').length"), 0);
      assert.equal(
        await evaluate(
          "window.electronAPI.invoke('site-settings',{adBlock:true}).then(r=>r.success)",
        ),
        true,
      );
    });
    await test('extracted static bindings keep new-tab and account buttons working', async () => {
      const before = await evaluate('Object.keys(tabData).length');
      await evaluate("document.querySelector('[data-ui=ui-12]').click();true;");
      assert.equal(await evaluate('Object.keys(tabData).length'), before + 1);
      await evaluate("document.querySelector('[data-ui=ui-6]').click();true;");
      assert.equal(
        await evaluate("document.getElementById('authModal').classList.contains('on')"),
        true,
      );
      await evaluate('closeAllModals()');
    });
    await test('search typo hint appears below the field and Tab accepts the correction', async () => {
      await evaluate(
        "showNewTab();var input=document.getElementById('ntInput');input.value='yanlıs';input.dispatchEvent(new Event('input',{bubbles:true}));true;",
      );
      assert.equal(await evaluate("document.getElementById('ntSpellHint').hidden"), false);
      assert.equal(await evaluate("document.getElementById('ntSpellText').textContent"), 'yanlış');
      assert.match(await evaluate("document.getElementById('ntSpellHint').textContent"), /Tab/);
      await evaluate(
        "document.getElementById('ntInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));true;",
      );
      assert.equal(await evaluate("document.getElementById('ntInput').value"), 'yanlış');

      await evaluate(
        "var address=document.getElementById('addr');address.value='yanlıs';address.dispatchEvent(new Event('input',{bubbles:true}));true;",
      );
      assert.match(await evaluate("document.getElementById('suggestions').textContent"), /yanlış/);
      await evaluate(
        "document.getElementById('addr').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));true;",
      );
      assert.equal(await evaluate("document.getElementById('addr').value"), 'yanlış');
    });
    await test('settings toggles reach browser sessions and persist', async () => {
      await evaluate(
        "openPanel('settings');window.__testToggle=document.createElement('button');toggleCfg('spellcheck',window.__testToggle,'Yazım denetimi')",
      );
      assert.equal(session.defaultSession.isSpellCheckerEnabled(), false);
      assert.equal((await evaluate('window.electronAPI.loadData()')).cfg.spellcheck, false);
      assert.equal(await evaluate("!!document.getElementById('performanceModeToggle')"), true);
      await evaluate("togglePerformanceMode(document.getElementById('performanceModeToggle'))");
      assert.deepEqual(await evaluate("window.electronAPI.invoke('performance-mode-status')"), {
        active: false,
        configured: true,
        restartRequired: true,
      });
      await evaluate("togglePerformanceMode(document.getElementById('performanceModeToggle'))");
      assert.equal(
        (await evaluate("window.electronAPI.invoke('performance-mode-status')")).configured,
        false,
      );
      await evaluate("toggleCfg('spellcheck',window.__testToggle,'Yazım denetimi');closeSpanel()");
      assert.equal(session.defaultSession.isSpellCheckerEnabled(), true);
    });
    await test('download rows remove by id when filenames match', async () => {
      await evaluate(
        "_dlList=[{id:'first',filename:'same.zip',state:'completed',size:10},{id:'second',filename:'same.zip',state:'completed',size:10}];openPanel('downloads');document.querySelector('.dl-row .dl-btn.danger').click();true;",
      );
      assert.deepEqual(await evaluate('_dlList.map(d=>d.id)'), ['second']);
      await evaluate('_dlList=[];closeSpanel()');
    });
    await test('dynamic notes save, escape content and delete without opening the editor', async () => {
      await evaluate(
        "notes=[];editingNote=null;openPanel('notes');document.querySelector('[data-action=new-note]').click();document.getElementById('noteTitleInp').value='<img src=x onerror=alert(1)>';document.getElementById('noteBodyInp').value='saved body';document.querySelector('[data-action=save-note]').click();true;",
      );
      assert.equal(await evaluate('notes.length'), 1);
      assert.equal(await evaluate('editingNote'), null);
      assert.equal(await evaluate("document.querySelector('#spBody img')===null"), true);
      await evaluate("notes[0].date='<img src=x onerror=alert(1)>';renderNotes();true;");
      assert.equal(await evaluate("document.querySelector('#spBody img')===null"), true);
      await evaluate("document.querySelector('[data-action=delete-note]').click();true;");
      assert.equal(await evaluate('notes.length'), 0);
      assert.equal(await evaluate('editingNote'), null);
      await evaluate('closeSpanel()');
    });
    await test('failed note storage preserves the editor and does not duplicate on retry', async () => {
      await evaluate(
        "notes=[];newNote();document.getElementById('noteTitleInp').value='Retry';document.getElementById('noteBodyInp').value='Keep this';window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('test full')};saveNote();true;",
      );
      assert.equal(await evaluate('notes.length'), 0);
      assert.equal(await evaluate('editingNote.isNew'), true);
      assert.equal(await evaluate("document.getElementById('noteBodyInp').value"), 'Keep this');
      await evaluate('Storage.prototype.setItem=window.__originalSetItem;saveNote();true;');
      assert.equal(await evaluate('notes.length'), 1);
      assert.equal(await evaluate('editingNote'), null);
    });
    await test('settings range and dynamic tab-close use external event handlers', async () => {
      await evaluate(
        "openPanel('settings');var input=document.querySelector('[data-input=font-size]');input.value='17';input.dispatchEvent(new Event('input',{bubbles:true}));true;",
      );
      assert.equal(await evaluate('cfg.fontSize'), 17);
      const count = await evaluate('Object.keys(tabData).length');
      await evaluate("newTab();document.querySelector('.tab.active .tab-x').click();true;");
      assert.equal(await evaluate('Object.keys(tabData).length'), count);
      await evaluate('closeSpanel()');
    });
    await test('AI legacy keys migrate once and are not returned to the page', async () => {
      await evaluate(
        "localStorage.setItem('tb_ai_keys',JSON.stringify({chatgpt:'synthetic-integration-key'}));initAiKeys()",
      );
      assert.equal(await evaluate("localStorage.getItem('tb_ai_keys')"), null);
      assert.equal(await evaluate('aiKeys.chatgpt'), true);
      assert.equal(
        fs
          .readFileSync(path.join(root, 'techbrowser-ai-keys.json'), 'utf8')
          .includes('synthetic-integration-key'),
        false,
      );
      const status = await evaluate("window.electronAPI.invoke('ai-status')");
      assert.equal(JSON.stringify(status).includes('synthetic-integration-key'), false);
    });
    await test('browsing cleanup retains notes, keys and settings in the actual app', async () => {
      await evaluate(
        "notes=[{title:'Keep',body:'test note',date:'today'}];saveNotes();cfg.fontSize=16;saveAllData()",
      );
      await session.defaultSession.cookies.set({ url, name: 'cleanup', value: 'remove' });
      assert.equal((await evaluate('window.electronAPI.clearBrowsingData()')).success, true);
      assert.equal((await session.defaultSession.cookies.get({ url })).length, 0);
      assert.match(await evaluate("localStorage.getItem('tb_notes')"), /test note/);
      assert.equal((await evaluate('window.electronAPI.loadData()')).cfg.fontSize, 16);
      assert.equal(
        (await evaluate("window.electronAPI.invoke('ai-status')")).configured.chatgpt,
        true,
      );
    });
    await test('history and bookmark URL injection is inert', async () => {
      const injected = "https://example.test/'-alert(1)-'";
      await evaluate(
        `window.__xss=0;window.alert=()=>window.__xss++;hist=[{url:${JSON.stringify(injected)},title:'<img src=x onerror=alert(1)>',time:'00:00'}];renderHistory();window.__savedNavigate=doNavigate;doNavigate=()=>{};document.querySelector('.hi').click();doNavigate=window.__savedNavigate;true;`,
      );
      assert.equal(await evaluate('window.__xss'), 0);
      assert.equal(await evaluate("document.querySelector('#spBody img')===null"), true);
    });
    await test('clipboard write allowed for app UI', async () => {
      assert.equal(
        await evaluate(
          "navigator.clipboard.writeText('TechBrowser test').then(()=>true).catch(e=>e.name)",
        ),
        true,
      );
    });
    await test('real guest page loads with Node isolated', async () => {
      await evaluate(`doNavigate(${JSON.stringify(url)});`);
      await until('tabData[activeTabId].wv && !tabData[activeTabId].loading');
      assert.equal(
        await evaluate("tabData[activeTabId].wv.executeJavaScript('typeof require')"),
        'undefined',
      );
    });
    await test('embedded Google sign-in is intercepted before the rejection page', async () => {
      await evaluate(
        'tabData[activeTabId].wv.executeJavaScript("location.href=\'https://accounts.google.com/v3/signin/identifier?continue=https%253A%252F%252Fexample.test\'")',
      );
      await until("document.getElementById('googleInfoModal')!==null");
      assert.equal(
        await evaluate("document.querySelector('#googleInfoModal h3').textContent"),
        'Google ile güvenli giriş',
      );
      assert.match(
        await evaluate(
          'document.querySelector(\'#googleInfoModal [data-action="external-google"]\').textContent',
        ),
        /Varsayılan tarayıcıda aç/,
      );
      assert.doesNotMatch(await evaluate('tabData[activeTabId].wv.getURL()'), /signin\/rejected/);
      await evaluate("document.getElementById('googleInfoModal').remove()");
    });
    await test('Misket prepares real page and selected text without sending', async () => {
      const count = await evaluate('aiHistory.length');
      await evaluate("misketContext('summary')");
      assert.match(
        await evaluate("document.getElementById('aiInput').value"),
        /test article content/,
      );
      await evaluate(
        `tabData[activeTabId].wv.executeJavaScript("(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('p'));const s=getSelection();s.removeAllRanges();s.addRange(r)})()")`,
      );
      await evaluate("misketContext('selection')");
      assert.match(
        await evaluate("document.getElementById('aiInput').value"),
        /test article content/,
      );
      assert.equal(await evaluate('aiHistory.length'), count);
      await evaluate("document.getElementById('aiInput').value=''");
    });
    await test('reader extracts actual article as text', async () => {
      await evaluate('toggleReader()');
      assert.match(
        await evaluate("document.querySelector('#readerView .rv-body').textContent"),
        /test article content/,
      );
      await evaluate('toggleReader()');
    });
    await test('media permission denial uses real Electron request', async () => {
      permissionDecision = 1;
      assert.equal(
        await evaluate(
          'tabData[activeTabId].wv.executeJavaScript("navigator.mediaDevices.getUserMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return \'allowed\'}).catch(e=>e.name)")',
        ),
        'NotAllowedError',
      );
    });
    await test('media permission acceptance works with synthetic camera', async () => {
      permissionDecision = 0;
      assert.equal(
        await evaluate(
          'tabData[activeTabId].wv.executeJavaScript("navigator.mediaDevices.getUserMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return \'allowed\'}).catch(e=>e.name)")',
        ),
        'allowed',
      );
    });
    await test('incognito toggle creates isolated guest; last close clears cookies', async () => {
      await session.defaultSession.cookies.set({ url, name: 'normal', value: 'yes' });
      await evaluate('toggleIncognito()');
      await evaluate(`doNavigate(${JSON.stringify(url)});`);
      await until('tabData[activeTabId].wv && !tabData[activeTabId].loading');
      assert.equal(
        await evaluate("tabData[activeTabId].wv.getAttribute('partition')"),
        'incognito',
      );
      assert.equal((await session.fromPartition('incognito').cookies.get({ url })).length, 0);
      await session.fromPartition('incognito').cookies.set({ url, name: 'private', value: 'yes' });
      await evaluate(
        "closeTab({stopPropagation(){}},document.querySelector('.tab.active .tab-x'));incognitoCleanup",
      );
      await sleep(300);
      assert.equal((await session.fromPartition('incognito').cookies.get({ url })).length, 0);
    });
    await test('inactive clean page sleeps, active or edited page stays alive', async () => {
      await evaluate(`newTab(false,${JSON.stringify(url)});`);
      await until('tabData[activeTabId].wv && !tabData[activeTabId].loading');
      const id = await evaluate('activeTabId');
      assert.equal(await evaluate(`suspendTab(${id})`), false);
      await evaluate(
        "tabData[activeTabId].wv.executeJavaScript(\"document.getElementById('draft').value='unsaved'\")",
      );
      await evaluate('newTab(false)');
      assert.equal(await evaluate(`suspendTab(${id})`), false);
      await evaluate(
        `tabData[${id}].wv.executeJavaScript("document.getElementById('draft').value=''")`,
      );
      await evaluate(
        `tabData[${id}].wv.executeJavaScript("document.getElementById('draft').defaultValue='original';document.getElementById('draft').value=''")`,
      );
      assert.equal(await evaluate(`suspendTab(${id})`), false);
      await evaluate(
        `tabData[${id}].wv.executeJavaScript("document.getElementById('draft').defaultValue=''")`,
      );
      assert.equal(await evaluate(`suspendTab(${id})`), true);
      assert.equal(await evaluate(`tabData[${id}].wv===null`), true);
      await evaluate(`selectTab(document.querySelector('.tab[data-id="${id}"]'))`);
      await until('tabData[activeTabId].wv && !tabData[activeTabId].loading');
    });
    await test('real download item cancels and does not finish downloading', async () => {
      win.webContents.downloadURL(url + '/slow');
      await until("_dlList.some(d=>d.state==='downloading')");
      const id = await evaluate("_dlList.find(d=>d.state==='downloading').id");
      assert.equal(
        await evaluate(
          `window.electronAPI.invoke('cancel-download',${JSON.stringify(id)}).then(r=>r.success)`,
        ),
        true,
      );
      await until(`_dlList.find(d=>d.id===${JSON.stringify(id)}).state==='interrupted'`);
    });
    await test('extension choices persist in encrypted app data', async () => {
      await evaluate("installExt('grammar','Yazım Kontrolü');saveAllData()");
      assert.ok(
        (await evaluate('window.electronAPI.loadData()')).cfg.installedExtensions.includes(
          'grammar',
        ),
      );
    });
    await test('accepted terms version matches next startup requirement', async () => {
      await evaluate('window.electronAPI.acceptTerms()');
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(root, 'techbrowser-settings.json'), 'utf8'))
          .termsAcceptedVersion,
        require('../src/app-config').TERMS_VERSION,
      );
    });
    await test('forged account deletion cannot remove local data', async () => {
      const before = fs.readFileSync(path.join(root, 'techbrowser-data.json'), 'utf8');
      const result = await evaluate(
        "window.electronAPI.deleteAccount({email:'test@example.test',password:'__email_user__'})",
      );
      assert.equal(result.success, false);
      assert.equal(fs.readFileSync(path.join(root, 'techbrowser-data.json'), 'utf8'), before);
    });
    await test('dark mode applies to actual web page', async () => {
      await evaluate('cfg.darkMode=true;applyPageFeatures(tabData[activeTabId])');
      assert.equal(
        await evaluate(
          'tabData[activeTabId].wv.executeJavaScript("getComputedStyle(document.body).backgroundColor")',
        ),
        'rgb(18, 18, 18)',
      );
    });
    await test('command palette preserves tab closure', async () => {
      await evaluate(
        "filterCmd('Test article');document.querySelector('[data-command]').click();true;",
      );
      assert.match(await evaluate('tabData[activeTabId].url'), /127.0.0.1/);
    });
    await test('real encrypted password write and read roundtrip', async () => {
      await evaluate(
        "openPanel('passwords');document.getElementById('pwSite').value='example.test';document.getElementById('pwUser').value='test';document.getElementById('pwPass').value='synthetic-secret';addPassword()",
      );
      assert.equal(
        (await evaluate('window.electronAPI.loadPasswords()'))[0].pass,
        'synthetic-secret',
      );
      assert.equal(
        fs
          .readFileSync(path.join(root, 'techbrowser-passwords.json'), 'utf8')
          .includes('synthetic-secret'),
        false,
      );
    });
    await test('proxy routes normal and incognito requests and disconnects all partitions', async () => {
      const { setBrowserProxy, browserSessions } = require('../src/session-policy');
      let requests = 0;
      const proxy = http.createServer((req, res) => {
        requests++;
        res.end('controlled-proxy');
      });
      await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
      try {
        await setBrowserProxy(session, { proxyRules: 'http://127.0.0.1:' + proxy.address().port });
        for (const target of browserSessions(session)) {
          assert.match(await target.resolveProxy('http://example.test/'), /PROXY 127.0.0.1/);
        }
        for (const target of [session.defaultSession, session.fromPartition('incognito')]) {
          const body = await new Promise((resolve, reject) => {
            const req = net.request({ session: target, url: 'http://example.test/proxy-test' });
            req.on('response', (res) => {
              let text = '';
              res.on('data', (b) => (text += b));
              res.on('end', () => resolve(text));
            });
            req.on('error', reject);
            req.end();
          });
          assert.equal(body, 'controlled-proxy');
        }
        assert.equal(requests, 2);
      } finally {
        await setBrowserProxy(session, { mode: 'direct' });
        proxy.closeAllConnections();
        proxy.close();
      }
      for (const target of browserSessions(session))
        assert.equal(await target.resolveProxy('http://example.test/'), 'DIRECT');
    });
    await test('page capture writes a real PNG from the owned guest', async () => {
      const file = path.join(root, 'capture.png');
      const old = dialog.showSaveDialog;
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      try {
        assert.equal(
          await evaluate(
            "window.electronAPI.invoke('capture-page',tabData[activeTabId].wv.getWebContentsId()).then(r=>r.success)",
          ),
          true,
        );
        assert.equal(fs.readFileSync(file).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      } finally {
        dialog.showSaveDialog = old;
      }
    });
    await test('QR enrollment renders locally and closes without leaving a secret in the page', async () => {
      const challenge = await evaluate(
        "window.electronAPI.invoke('auth-begin',{email:'test@example.test',password:'synthetic-password'})",
      );
      await evaluate(
        `window.electronAPI.invoke('auth-finish',{challengeId:${JSON.stringify(challenge.challengeId)},code:${JSON.stringify(lastOtp)}}).then(r=>{cu=r.user;})`,
      );
      await evaluate('openMfaSetup()');
      await until("document.querySelector('#mfaSetup img')?.naturalWidth>0");
      assert.equal(
        await evaluate(
          "document.querySelector('#mfaSetup img').src.startsWith('data:image/png;base64,')",
        ),
        true,
      );
      assert.equal(await evaluate("document.querySelector('#mfaSetup details').open"), false);
      const dataUrl = await evaluate("document.querySelector('#mfaSetup img').src");
      const png = require('pngjs').PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
      const decoded = require('jsqr')(new Uint8ClampedArray(png.data), png.width, png.height);
      assert.ok(decoded);
      const uri = new URL(decoded.data);
      assert.equal(uri.protocol, 'otpauth:');
      assert.equal(uri.hostname, 'totp');
      assert.equal(uri.searchParams.get('secret'), 'JBSWY3DPEHPK3PXP');
      assert.equal(uri.searchParams.get('issuer'), 'TechBrowser');
      assert.match(decodeURIComponent(uri.pathname), /test@example.test/);

      await sleep(300);
      fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, 'results', 'mfa-preview.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await evaluate('closeAllModals()');
      assert.equal(await evaluate("document.querySelector('#mfaSetup')===null"), true);
    });
    await test('VPN direct selection reports its state through the actual button', async () => {
      await evaluate(
        "vpnServer={id:'tr',name:'Türkiye',flag:'TR',ping:''};vpnOn=false;updateVpnUI();document.getElementById('vpnToggleBtn').click();true;",
      );
      await until('!vpnBusy');
      assert.equal(await evaluate('vpnOn'), false);
      assert.equal(await evaluate("document.getElementById('vpnToggleBtn').disabled"), false);
    });
    await test('account remote failure preserves local data; success cannot recreate it', async () => {
      const challenge = await evaluate(
        "window.electronAPI.invoke('auth-begin',{email:'test@example.test',password:'synthetic-password'})",
      );
      assert.equal(challenge.success, true);
      const login = await evaluate(
        `window.electronAPI.invoke('auth-finish',{challengeId:${JSON.stringify(challenge.challengeId)},code:${JSON.stringify(lastOtp)}})`,
      );
      assert.equal(login.success, true);
      rejectDeletion = true;
      await evaluate("confirmDeleteAccount(false,'test@example.test','synthetic-password')");
      assert.equal(fs.existsSync(path.join(root, 'techbrowser-data.json')), true);
      assert.equal(await evaluate("document.getElementById('deleteConfirmBtn').disabled"), false);
      assert.equal(await evaluate('window._deletingAccount'), false);
      rejectDeletion = false;
      await evaluate("confirmDeleteAccount(false,'test@example.test','synthetic-password')");
      await sleep(400);
      assert.equal(fs.existsSync(path.join(root, 'techbrowser-data.json')), false);
      assert.equal(await evaluate('window.electronAPI.saveData({hist:[1]})'), false);
      assert.equal(fs.existsSync(path.join(root, 'techbrowser-ai-keys.json')), false);
      await sleep(2000);
      await until("typeof tabData!=='undefined' && !!tabData[0]");
      assert.equal(await evaluate('window.electronAPI.saveData({hist:[],bookmarks:[]})'), true);
      assert.equal((await evaluate('window.electronAPI.loadData()')).hist.length, 0);
      assert.equal(await evaluate("localStorage.getItem('tb_notes')"), null);
    });
    await test('no uncaught runtime errors while closing, suspending or reloading tabs', async () => {
      assert.deepEqual(errors, []);
    });
    server.closeAllConnections();
    server.close();
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, 'results', 'integration.json'),
      JSON.stringify({ results, errors }, null, 2),
    );
    console.log('INTEGRATION', results.filter((r) => r.passed).length + '/' + results.length);
    app.exit(results.some((r) => !r.passed) ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
setTimeout(() => {
  console.error('integration timeout');
  app.exit(2);
}, 120000).unref();

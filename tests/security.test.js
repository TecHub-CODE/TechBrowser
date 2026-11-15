const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { browserSessions, installPermissions, setBrowserProxy } = require('../src/session-policy');

function harness(response = 0, settings = {}) {
  const prompts = [];
  const session = {
    setPermissionCheckHandler(fn) {
      this.check = fn;
    },
    setPermissionRequestHandler(fn) {
      this.request = fn;
    },
  };
  const contents = { isDestroyed: () => false, getURL: () => 'https://example.com/' };
  installPermissions(
    session,
    () => ({ isDestroyed: () => false }),
    {
      async showMessageBox(win, options) {
        prompts.push(options);
        if (response instanceof Error) throw response;
        return { response: typeof response === 'function' ? response() : response };
      },
    },
    () => settings,
  );
  return {
    session,
    prompts,
    contents,
    async request(
      permission,
      details = { requestingUrl: 'https://example.com/', mediaTypes: ['video', 'audio'] },
    ) {
      let result;
      await session.request(
        contents,
        permission,
        (value) => {
          result = value;
        },
        details,
      );
      return result;
    },
  };
}

test('camera and microphone require explicit consent and show the requesting origin', async () => {
  const h = harness();
  assert.equal(h.session.check(h.contents, 'media'), false);
  assert.equal(await h.request('media'), true);
  assert.match(h.prompts[0].message, /example.com.*Kamera.*Mikrofon/);
  assert.equal(h.prompts[0].defaultId, 1);
});
test('denial, dialog errors, unknown permissions and invalid origins fail closed', async () => {
  assert.equal(await harness(1).request('media'), false);
  assert.equal(await harness(new Error('closed')).request('media'), false);
  for (const permission of ['unknown', 'notifications', 'geolocation', 'usb']) {
    const h = harness();
    assert.equal(await h.request(permission), false);
    assert.equal(h.prompts.length, 0);
  }
  assert.equal(await harness().request('media', { requestingUrl: 'file:///tmp/test' }), false);
});
test('navigation while a permission dialog is open invalidates consent', async () => {
  const h = harness();
  let reads = 0;
  h.contents.getURL = () => (++reads === 1 ? 'https://example.com' : 'https://other.test');
  assert.equal(await h.request('media'), false);
});

test('notifications need both enabled settings and origin consent, including while dialog is open', async () => {
  const settings = { notifications: true };
  const h = harness(0, settings);
  assert.equal(h.session.check(h.contents, 'notifications', 'https://example.com'), false);
  assert.equal(await h.request('notifications'), true);
  assert.equal(h.session.check(h.contents, 'notifications', 'https://example.com'), true);
  assert.equal(h.session.check(h.contents, 'notifications', 'https://other.test'), false);
  settings.notifications = false;
  assert.equal(h.session.check(h.contents, 'notifications', 'https://example.com'), false);
  settings.notifications = true;
  const racing = harness(() => {
    settings.notifications = false;
    return 0;
  }, settings);
  assert.equal(await racing.request('notifications'), false);
});
test('connect and disconnect cover all sessions including incognito and close old connections', async () => {
  const records = new Map();
  const get = (name) => {
    if (!records.has(name))
      records.set(name, {
        configs: [],
        closed: 0,
        async setProxy(config) {
          this.configs.push(config);
        },
        async closeAllConnections() {
          this.closed++;
        },
      });
    return records.get(name);
  };
  const session = { defaultSession: get('default'), fromPartition: get };
  assert.equal(browserSessions(session).length, 6);
  await setBrowserProxy(session, { proxyRules: 'socks5://localhost:1234' });
  await setBrowserProxy(session, { mode: 'direct' });
  assert.ok(records.has('incognito'));
  for (const record of records.values()) {
    assert.equal(record.configs[0].proxyRules, 'socks5://localhost:1234');
    assert.equal(record.configs[1].mode, 'direct');
    assert.equal(record.closed, 2);
  }
});
test('package excludes environment secrets and contains no extra resource copy', () => {
  const config = require('../package.json').build;
  const { minimatch } = require('minimatch');
  for (const name of [
    '.env',
    '.env.production',
    'src/.env',
    'src/test.env',
    'tests/security.test.js',
  ]) {
    const included = config.files
      .filter((p) => !p.startsWith('!'))
      .some((p) => minimatch(name, p, { dot: true }));
    const excluded = config.files
      .filter((p) => p.startsWith('!'))
      .some((p) => minimatch(name, p.slice(1), { dot: true }));
    assert.equal(included && !excluded, false, name);
  }
  assert.equal(config.extraResources, undefined);
});
test('application scripts parse and removed session helpers are not referenced', () => {
  for (const file of ['main.js', 'preload.js', 'webview-preload.js'])
    new vm.Script(fs.readFileSync(file, 'utf8'));
  const main = fs.readFileSync('main.js', 'utf8');
  assert.doesNotMatch(main, /vpnSessions\(|buildPermissionHandler\(/);
  assert.match(main, /browserSessions\(session\)\.forEach\([\s\S]{0,60}installPermissions/);
  for (const script of require('./renderer-source.cjs').rendererScripts())
    new vm.Script(script.code, { filename: script.file });
});

test('renderer blocks inline scripts and dynamic markup contains no executable attributes', () => {
  const html = fs.readFileSync('src/renderer/index.html', 'utf8');
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(html, /\son(?:click|change|input|keydown|error|load)\s*=/i);
  for (const { code, file } of require('./renderer-source.cjs').rendererScripts())
    assert.doesNotMatch(
      code,
      /\son(?:click|change|input|keydown|error|mouseover|mouseout)\s*=/i,
      file,
    );
});

test('VPN UI reports direct connection, failures and missing bridge honestly', async () => {
  const html = require('./renderer-source.cjs').rendererSource();
  const code = html.slice(
    html.search(/var vpnBusy\s*=\s*false/),
    html.indexOf('function updateVpnUI()'),
  );
  const context = {
    window: {},
    vpnOn: false,
    vpnServer: { id: 'tr', name: 'Türkiye' },
    toast() {},
    updateVpnUI() {},
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  await context.toggleVpn();
  assert.equal(context.vpnOn, false);
  context.window.electronAPI = {
    async vpnConnect() {
      return { success: true, active: false };
    },
    async vpnDisconnect() {
      return { success: true };
    },
  };
  await context.toggleVpn();
  assert.equal(context.vpnOn, false);
  context.window.electronAPI.vpnConnect = async () => ({ success: true, active: true });
  await context.toggleVpn();
  assert.equal(context.vpnOn, true);
  context.window.electronAPI.vpnDisconnect = async () => ({ success: false });
  await context.toggleVpn();
  assert.equal(context.vpnOn, true);
  context.window.electronAPI.vpnDisconnect = async () => ({ success: true });
  await context.toggleVpn();
  assert.equal(context.vpnOn, false);
});

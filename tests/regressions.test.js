const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  crypto = require('crypto');
const { EventEmitter } = require('events');
const { createStore } = require('../src/secure-store');
const { createDownloads } = require('../src/downloads');
const { createAuthService } = require('../src/auth-service');
const { summarizeMemory } = require('../src/memory');
const { shouldBlock } = require('../src/site-rules');
const secure = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
};
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techbrowser-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('encrypted store roundtrip, legacy migration and corruption protection', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'techbrowser-data.json');
  fs.writeFileSync(path.join(dir, '.techbrowser_enc_key'), crypto.randomBytes(32));
  const store = createStore(dir, secure);
  store.write(file, { hist: ['private'] });
  assert.equal(fs.existsSync(path.join(dir, '.techbrowser_enc_key')), false);
  assert.deepEqual(createStore(dir, secure).decrypt(fs.readFileSync(file, 'utf8')), {
    hist: ['private'],
  });
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.tag = '00'.repeat(16);
  fs.writeFileSync(file, JSON.stringify(raw));
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => store.write(file, { hist: [] }));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('missing key and unavailable OS key store never create unreadable records', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'techbrowser-data.json');
  const store = createStore(dir, { isEncryptionAvailable: () => false });
  assert.throws(() => store.write(file, {}));
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, JSON.stringify({ v: 2, data: 'ff' }));
  assert.throws(() => createStore(dir, secure).encrypt({}));
});
test('cancel invokes real download item; equal names get unique destinations and ids', (t) => {
  const dir = temp(t),
    events = [];
  const manager = createDownloads(dir, (...e) => events.push(e));
  const item = () =>
    Object.assign(new EventEmitter(), {
      getFilename: () => 'file.bin',
      getTotalBytes: () => 100,
      getReceivedBytes: () => 23,
      setSavePath(p) {
        this.destination = p;
      },
      cancel() {
        this.cancelled = true;
        this.emit('done', {}, 'cancelled');
      },
    });
  const a = item(),
    b = item(),
    id = manager.attach(a),
    id2 = manager.attach(b);
  assert.notEqual(id, id2);
  assert.notEqual(a.destination, b.destination);
  assert.equal(manager.cancel(id), true);
  assert.equal(a.cancelled, true);
  assert.equal(manager.cancel(id), false);
  assert.equal(events.at(-1)[1].receivedBytes, 23);
});
function fixture() {
  let clock = 10000,
    sent = [],
    calls = [],
    failDelete = false;
  const req = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body });
    let data = {};
    if (url.includes('signInWithPassword')) data = { idToken: 'token', refreshToken: 'refresh' };
    if (url.includes('lookup'))
      data = {
        users: [
          { localId: 'uid', email: 'test@example.test', emailVerified: true, displayName: 'Test' },
        ],
      };
    if (url.includes(':delete') && failDelete)
      return { ok: false, json: async () => ({ error: { message: 'offline' } }) };
    return { ok: true, json: async () => data };
  };
  return {
    service: createAuthService({
      apiKey: 'public',
      request: req,
      now: () => clock,
      sendMail: async (email, code) => sent.push({ email, code }),
    }),
    calls,
    sent,
    setClock: (v) => (clock = v),
    failDelete: () => (failDelete = true),
  };
}
test('tokens stay in main until OTP; wrong, expired and replayed challenges rejected', async () => {
  const f = fixture(),
    c = await f.service.begin({ email: 'test@example.test', password: 'secret' });
  assert.equal(f.service.profile(), null);
  assert.deepEqual(Object.keys(c).sort(), ['challengeId', 'email', 'method']);
  await assert.rejects(f.service.finish({ challengeId: c.challengeId, code: 'wrong' }));
  const user = await f.service.finish({ challengeId: c.challengeId, code: f.sent[0].code });
  assert.equal(user.email, 'test@example.test');
  assert.equal('token' in user, false);
  await assert.rejects(f.service.finish({ challengeId: c.challengeId, code: f.sent[0].code }));
  const c2 = await f.service.begin({ email: 'test@example.test', password: 'secret' });
  f.setClock(400000);
  await assert.rejects(f.service.finish({ challengeId: c2.challengeId, code: f.sent[1].code }));
});
test('OTP resend cannot bypass global send limit; failed deletion retains session', async () => {
  const f = fixture();
  const c = await f.service.begin({ email: 'test@example.test', password: 'secret' });
  await f.service.finish({ challengeId: c.challengeId, code: f.sent[0].code });
  f.failDelete();
  await assert.rejects(f.service.remove({ password: 'secret' }), /offline/);
  assert.ok(f.service.profile());
  for (let i = 0; i < 4; i++)
    await f.service.begin({ email: 'test@example.test', password: 'secret' });
  await assert.rejects(
    f.service.begin({ email: 'test@example.test', password: 'secret' }),
    /Çok fazla/,
  );
  assert.equal(f.sent.length, 5);
});
test('unknown/delete sentinel cannot delete without authenticated session', async () => {
  const f = fixture();
  await assert.rejects(f.service.remove({ password: '__email_user__' }));
  assert.equal(f.calls.length, 0);
});
test('native Firebase TOTP never exposes session until server verifies second factor', async () => {
  let valid = false;
  const s = createAuthService({
    apiKey: 'public',
    sendMail: async () => {
      throw Error('should not email');
    },
    request: async (url) => ({
      ok: true,
      json: async () =>
        url.includes('signInWithPassword')
          ? {
              mfaPendingCredential: 'pending',
              mfaInfo: [{ totpInfo: {}, mfaEnrollmentId: 'factor' }],
            }
          : url.includes('mfaSignIn:finalize')
            ? valid
              ? { idToken: 'token', refreshToken: 'refresh' }
              : { error: { message: 'INVALID_CODE' } }
            : { users: [{ localId: 'u', email: 'a@b.test', emailVerified: true, mfaInfo: [{}] }] },
    }),
  });
  const c = await s.begin({ email: 'a@b.test', password: 'secret' });
  assert.equal(c.method, 'totp');
  assert.equal(s.profile(), null);
  await assert.rejects(s.finish({ challengeId: c.challengeId, code: '000000' }));
  valid = true;
  await s.finish({ challengeId: c.challengeId, code: '123456' });
  assert.ok(s.profile());
});
test('memory report uses private process memory and identifies working set separately', () => {
  assert.deepEqual(
    summarizeMemory([
      { memory: { privateBytes: 100 * 1024, workingSetSize: 200 * 1024 } },
      { memory: { privateBytes: 50 * 1024, workingSetSize: 200 * 1024 } },
    ]),
    { usedMB: 150, metric: 'private', workingSetMB: 400, processCount: 2 },
  );
});
test('ad filter blocks subdomain trackers, preserves navigation and lookalike domains', () => {
  assert.equal(shouldBlock('https://ad.doubleclick.net/a', true, 'script'), true);
  assert.equal(shouldBlock('https://doubleclick.net.evil.test/a', true, 'script'), false);
  assert.equal(shouldBlock('https://doubleclick.net/a', true, 'mainFrame'), false);
  assert.equal(shouldBlock('https://doubleclick.net/a', false, 'script'), false);
});

function cloudFixture() {
  const calls = [];
  let otp = '',
    denied = false,
    enrolled = false;
  const service = createAuthService({
    apiKey: 'public',
    cloudSyncEnabled: true,
    sendMail: async (_, code) => (otp = code),
    request: async (url, options = {}) => {
      let body;
      try {
        body = JSON.parse(options.body);
      } catch {
        body = options.body;
      }
      calls.push({ url, ...options, body });
      if (url.includes('firestore.googleapis.com') && denied)
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { message: 'PERMISSION_DENIED' } }),
        };
      let data = {};
      if (url.includes('signInWithPassword'))
        data = { idToken: 'first-token', refreshToken: 'first-refresh' };
      if (url.includes('securetoken'))
        data = { id_token: 'renewed-token', refresh_token: 'renewed-refresh' };
      if (url.includes('lookup'))
        data = {
          users: [
            {
              localId: 'uid',
              email: 'test@example.test',
              emailVerified: true,
              ...(enrolled ? { mfaInfo: [{ totpInfo: {} }] } : {}),
            },
          ],
        };
      if (url.includes('mfaEnrollment:start'))
        data = {
          totpSessionInfo: {
            sharedSecretKey: 'TESTSECRET',
            sessionInfo: 'enroll-session',
            hashingAlgorithm: 'SHA1',
            verificationCodeLength: 6,
            periodSec: 30,
          },
        };
      if (url.includes('mfaEnrollment:finalize')) {
        enrolled = true;
        data = { idToken: 'mfa-token', refreshToken: 'mfa-refresh' };
      }
      if (url.includes('firestore.googleapis.com') && !options.method)
        data = {
          updateTime: '2026-09-08T00:00:00Z',
          fields: {
            bookmarks: {
              stringValue: JSON.stringify([{ url: 'https://remote.test', title: 'Remote' }]),
            },
          },
        };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  return {
    service,
    calls,
    deny: () => (denied = true),
    login: async (remember = false) => {
      const c = await service.begin({ email: 'test@example.test', password: 'secret', remember });
      return service.finish({ challengeId: c.challengeId, code: otp });
    },
  };
}
test('remembered session refresh stays private and logout clears it', async () => {
  const f = cloudFixture();
  await f.login();
  assert.equal(f.service.remembered(), null);
  await f.login(true);
  assert.deepEqual(f.service.remembered(), { refreshToken: 'first-refresh' });
  await f.service.refresh();
  assert.deepEqual(f.service.remembered(), { refreshToken: 'renewed-refresh' });
  assert.equal('token' in f.service.profile(), false);
  f.service.logout();
  assert.equal(f.service.remembered(), null);
  assert.equal(f.service.profile(), null);
});
test('TOTP enrollment sends challenge session and reports only server-confirmed profile', async () => {
  const f = cloudFixture();
  await assert.rejects(f.service.enrollStart());
  await f.login();
  assert.equal((await f.service.enrollStart()).secret, 'TESTSECRET');
  assert.equal(f.service.profile().mfaEnabled, false);
  assert.equal((await f.service.enrollFinish({ code: '123456' })).mfaEnabled, true);
  const finalize = f.calls.find((c) => c.url.includes('mfaEnrollment:finalize'));
  assert.deepEqual(finalize.body.totpVerificationInfo, {
    sessionInfo: 'enroll-session',
    verificationCode: '123456',
  });
  await assert.rejects(f.service.enrollFinish({ code: '123456' }));
});
test('cloud bookmark merge authenticates requests and uses a concurrency precondition', async () => {
  const f = cloudFixture();
  await assert.rejects(f.service.sync({ bookmarks: [] }));
  await f.login();
  const result = await f.service.sync({
    bookmarks: [
      { url: 'https://local.test', title: 'Local' },
      { url: 'javascript:alert(1)', title: 'Unsafe' },
    ],
  });
  assert.deepEqual(
    result.map((x) => x.url),
    ['https://remote.test', 'https://local.test'],
  );
  const patch = f.calls.find((c) => c.url.endsWith('documents:commit'));
  assert.equal(patch.headers.Authorization, 'Bearer renewed-token');
  assert.equal(patch.body.writes[0].currentDocument.updateTime, '2026-09-08T00:00:00Z');
  f.deny();
  await assert.rejects(f.service.sync({ bookmarks: [] }), /PERMISSION_DENIED/);
});
test('cloud cleanup failure blocks Firebase account deletion and preserves session', async () => {
  const f = cloudFixture();
  await f.login();
  f.deny();
  await assert.rejects(f.service.remove({ password: 'secret' }), /Bulut yer imleri/);
  assert.equal(
    f.calls.some((c) => c.url.includes('accounts:delete')),
    false,
  );
  assert.ok(f.service.profile());
});

test('exhausted TOTP enrollment is discarded and cannot be submitted again', async () => {
  let otp = '',
    finalizeCalls = 0;
  const service = createAuthService({
    apiKey: 'public',
    sendMail: async (_, code) => (otp = code),
    request: async (url) => {
      let data = {};
      if (url.includes('signInWithPassword')) data = { idToken: 'token', refreshToken: 'refresh' };
      if (url.includes('lookup'))
        data = { users: [{ localId: 'u', email: 'a@b.test', emailVerified: true }] };
      if (url.includes('mfaEnrollment:start'))
        data = { totpSessionInfo: { sharedSecretKey: 'TEST', sessionInfo: 'session' } };
      if (url.includes('mfaEnrollment:finalize')) {
        finalizeCalls++;
        data = { error: { message: 'TOO_MANY_ENROLLMENT_ATTEMPTS : restart enrollment' } };
      }
      return { ok: !data.error, json: async () => data };
    },
  });
  const c = await service.begin({ email: 'a@b.test', password: 'secret' });
  await service.finish({ challengeId: c.challengeId, code: otp });
  await service.enrollStart();
  await assert.rejects(service.enrollFinish({ code: 'abc' }), /6 haneli/);
  assert.equal(finalizeCalls, 0);
  await assert.rejects(service.enrollFinish({ code: '123456' }), /Kurulum geçersizleşti/);
  await assert.rejects(service.enrollFinish({ code: '123456' }), /kurulumu bulunamadı/);
  assert.equal(finalizeCalls, 1);
});

test('Google remember choice survives a new auth service; unchecked stays session-only', async () => {
  const request = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('signInWithIdp')
        ? { idToken: 'first', refreshToken: 'saved-refresh' }
        : url.includes('securetoken')
          ? { id_token: 'renewed', refresh_token: 'renewed-refresh' }
          : {
              users: [
                {
                  localId: 'u',
                  email: 'google@example.test',
                  emailVerified: true,
                  providerUserInfo: [{ providerId: 'google.com' }],
                },
              ],
            },
  });
  const make = () => createAuthService({ apiKey: 'public', request, sendMail: async () => {} });
  const first = make();
  await first.google('synthetic-google-id-token', false);
  assert.equal(first.remembered(), null);
  await first.google('synthetic-google-id-token', true);
  const saved = first.remembered();
  assert.deepEqual(saved, { refreshToken: 'saved-refresh' });
  const restarted = make();
  assert.equal(restarted.profile(), null);
  await restarted.refresh(saved);
  assert.equal(restarted.profile().email, 'google@example.test');
  assert.equal(restarted.profile().provider, 'google');
  assert.deepEqual(restarted.remembered(), { refreshToken: 'renewed-refresh' });
});

test('Google login uses its own enabled-by-default persistence control', async () => {
  const vm = require('node:vm');
  const html = require('./renderer-source.cjs').rendererSource();
  assert.match(html, /id="rememberGoogle" checked/);
  const start = html.indexOf('async function doGoogleLogin('),
    end = html.indexOf('async function doLogin(', start);
  assert.ok(start >= 0 && end > start);
  const controls = { rememberMe: { checked: false }, rememberGoogle: { checked: true } };
  let received;
  const context = {
    window: {
      electronAPI: {
        openGoogleAuth: async (options) => {
          received = options;
          return { success: true, user: { email: 'test@example.test' } };
        },
      },
    },
    document: { getElementById: (id) => controls[id] },
    setBtnLoading() {},
    saveAllData: async () => {},
    updateAccountUI() {},
    closeAllModals() {},
    toast() {},
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  await context.doGoogleLogin();
  assert.equal(received.remember, true);
  controls.rememberGoogle.checked = false;
  await context.doGoogleLogin();
  assert.equal(received.remember, false);
});
test('mixed protected and recreated legacy keys recover individually and retain corruption protection', (t) => {
  const dir = temp(t),
    other = temp(t),
    file = path.join(dir, 'techbrowser-data.json');
  const primary = createStore(dir, secure),
    auth = primary.encrypt({ session: 'synthetic' });
  const old = createStore(other, secure),
    data = old.encrypt({ bookmarks: ['test'] });
  const legacy = secure.decryptString(
    fs.readFileSync(path.join(other, '.techbrowser_enc_key.protected')),
  );
  fs.writeFileSync(path.join(dir, '.techbrowser_enc_key'), Buffer.from(legacy, 'hex'));
  fs.writeFileSync(file, data);
  const recovered = createStore(dir, secure);
  assert.deepEqual(recovered.decrypt(data), { bookmarks: ['test'] });
  assert.deepEqual(recovered.decrypt(auth), { session: 'synthetic' });
  const damaged = JSON.parse(data);
  damaged.tag = '00'.repeat(16);
  assert.throws(() => recovered.decrypt(JSON.stringify(damaged)));
  recovered.write(file, { bookmarks: ['test', 'new'] });
  assert.deepEqual(createStore(dir, secure).decrypt(fs.readFileSync(file, 'utf8')), {
    bookmarks: ['test', 'new'],
  });
  assert.equal(fs.existsSync(path.join(dir, '.techbrowser_enc_key')), true);
});

test('failed terms persistence keeps the acceptance dialog visible for retry', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/app.js'), 'utf8');
  const code = source.slice(
    source.indexOf('async function acceptTerms()'),
    source.indexOf('async function init()'),
  );
  let success = false,
    removed = false;
  const overlay = {
    style: {},
    remove() {
      removed = true;
    },
  };
  const context = {
    document: { getElementById: (id) => (id === 'termsCheck' ? { checked: true } : overlay) },
    window: { electronAPI: { acceptTerms: async () => ({ success, error: 'disk full' }) } },
    toast() {},
    setTimeout: (callback) => callback(),
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  await context.acceptTerms();
  assert.equal(removed, false);
  assert.equal(overlay.style.opacity, undefined);
  success = true;
  await context.acceptTerms();
  assert.equal(removed, true);
});

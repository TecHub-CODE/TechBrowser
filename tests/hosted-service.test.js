const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHostedService } = require('../src/hosted-service');

test('hosted client uses fixed HTTPS routes and keeps tokens out of bodies', async () => {
  assert.equal(createHostedService({ baseUrl: '' }), null);
  for (const baseUrl of [
    'http://example.test',
    'https://user:pass@example.test',
    'https://example.test/path',
    'https://example.test/?key=x',
  ])
    assert.throws(() => createHostedService({ baseUrl }));
  const client = createHostedService({
    baseUrl: 'https://example.test',
    request: async (url, options) => {
      assert.equal(url, 'https://example.test/v1/chat');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.body.includes('synthetic-token'), false);
      return Response.json({ reply: 'Yanıt' });
    },
  });
  assert.equal(
    await client.chat([{ role: 'user', content: 'Merhaba' }], 'synthetic-token'),
    'Yanıt',
  );
});

test('hosted errors hide provider details and empty verification cannot log in', async () => {
  let response = Response.json({ error: 'private upstream details' }, { status: 500 });
  const client = createHostedService({
    baseUrl: 'https://example.test',
    request: async () => response,
  });
  await assert.rejects(client.chat([], 'token'), /Hizmet isteği tamamlanamadı/);
  response = Response.json({});
  await assert.rejects(
    client.finishEmail('challenge', '123456', 'token'),
    /Doğrulama tamamlanamadı/,
  );
  response = Response.json({ reply: '' });
  await assert.rejects(client.chat([], 'token'), /boş yanıt/);
  response = Response.json(null);
  await assert.rejects(client.chat([], 'token'), /geçersiz yanıt/);
});

test('email challenges bind accounts, expire, limit guesses and reject replay', async () => {
  const { EmailChallenge } = await import('../cloudflare/account-routes.mjs');
  let record;
  const storage = {
    async get() {
      return record && structuredClone(record);
    },
    async put(key, value) {
      record = structuredClone(value);
    },
    async delete() {
      record = undefined;
    },
    async deleteAll() {
      record = undefined;
    },
    async setAlarm() {},
    async transaction(fn) {
      return fn(this);
    },
  };
  const challenge = new EmailChallenge({ storage });
  const call = (route, body) =>
    challenge.fetch(
      new Request('https://challenge/' + route, { method: 'POST', body: JSON.stringify(body) }),
    );
  const init = (expires = Date.now() + 300000) =>
    call('init', { uid: 'owner', hash: 'a'.repeat(64), expires });
  await init();
  assert.equal((await call('verify', { uid: 'other', hash: 'a'.repeat(64) })).status, 400);
  assert.equal((await call('verify', { uid: 'owner', hash: 'a'.repeat(64) })).status, 200);
  assert.equal((await call('verify', { uid: 'owner', hash: 'a'.repeat(64) })).status, 400);
  await init();
  for (let i = 0; i < 5; i++)
    assert.equal((await call('verify', { uid: 'owner', hash: 'b'.repeat(64) })).status, 400);
  assert.equal((await call('verify', { uid: 'owner', hash: 'a'.repeat(64) })).status, 400);
  await init(Date.now() - 1);
  assert.equal((await call('verify', { uid: 'owner', hash: 'a'.repeat(64) })).status, 400);
  await init();
  await challenge.alarm();
  assert.equal(record, undefined);
});

test('worker catches rejected account requests and rejects non-object bodies', async () => {
  const worker = (await import('../cloudflare/worker.mjs')).default;
  const env = {
    FIREBASE_API_KEY: 'public',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    API_LIMITER: { limit: async () => ({ success: true }) },
  };
  const req = (body) =>
    new Request('https://example.test/v1/oauth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
      body: JSON.stringify(body),
    });
  for (const body of [null, [], 'bad'])
    assert.equal((await worker.fetch(req(body), env)).status, 400);
  const original = global.fetch;
  global.fetch = async () => {
    throw Error('private upstream failure');
  };
  try {
    const result = await worker.fetch(
      req({
        redirectUri: 'http://localhost:3742/callback',
        code: 'code',
        verifier: 'a'.repeat(43),
      }),
      env,
    );
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: 'SERVICE_UNAVAILABLE' });
    assert.equal(
      (
        await worker.fetch(
          req({
            redirectUri: 'https://evil.test/callback',
            code: 'code',
            verifier: 'a'.repeat(43),
          }),
          env,
        )
      ).status,
      400,
    );
  } finally {
    global.fetch = original;
  }
});

test('email delivery failure cancels the stored challenge; reports use verified sender', async () => {
  const { accountRoute } = await import('../cloudflare/account-routes.mjs');
  const original = global.fetch;
  const paths = [];
  const env = {
    RESEND_API_KEY: 'private',
    MAIL_FROM: 'from@example.test',
    SUPPORT_TO: 'support@example.test',
    EMAIL_CHALLENGES: {
      idFromName: (x) => x,
      get: () => ({
        fetch: async (url) => {
          paths.push(new URL(url).pathname);
          return Response.json({ success: true });
        },
      }),
    },
  };
  try {
    global.fetch = async () => Response.json({}, { status: 503 });
    assert.equal(
      (
        await accountRoute('/v1/email/start', {}, env, {
          localId: 'owner',
          email: 'verified@example.test',
        })
      ).status,
      503,
    );
    assert.deepEqual(paths, ['/init', '/cancel']);
    global.fetch = async (url, options) => {
      const mail = JSON.parse(options.body);
      assert.deepEqual(mail.to, ['support@example.test']);
      assert.match(mail.html, /verified@example.test/);
      assert.doesNotMatch(mail.html, /<script>|forged@example.test/);
      assert.doesNotMatch(mail.subject, /[\r\n]/);
      return Response.json({ id: 'test' });
    };
    assert.equal(
      (
        await accountRoute(
          '/v1/report',
          {
            subject: 'Test\r\nheader',
            description: '<script>alert(1)</script>',
            email: 'forged@example.test',
          },
          env,
          { email: 'verified@example.test' },
        )
      ).status,
      200,
    );
  } finally {
    global.fetch = original;
  }
});

test('hosted email login exposes a profile only after server confirmation', async () => {
  const { createAuthService } = require('../src/auth-service');
  let rejectCode = true;
  const auth = createAuthService({
    apiKey: 'public',
    request: async (url) =>
      Response.json(
        url.includes('signInWithPassword')
          ? { idToken: 'private-token', refreshToken: 'private-refresh' }
          : { users: [{ localId: 'owner', email: 'test@example.test', emailVerified: true }] },
      ),
    hostedService: {
      startEmail: async (token) => {
        assert.equal(token, 'private-token');
        return { challengeId: 'remote-challenge' };
      },
      finishEmail: async (id, code, token) => {
        assert.equal(id, 'remote-challenge');
        assert.equal(token, 'private-token');
        if (rejectCode) throw Error('invalid code');
        return { success: true };
      },
    },
    sendMail: async () => {
      throw Error('local mail must not be used');
    },
  });
  const pending = await auth.begin({
    email: 'test@example.test',
    password: 'test',
    remember: true,
  });
  assert.equal(auth.profile(), null);
  assert.equal(JSON.stringify(pending).includes('private-'), false);
  await assert.rejects(
    auth.finish({ challengeId: pending.challengeId, code: '000000' }),
    /invalid code/,
  );
  assert.equal(auth.profile(), null);
  rejectCode = false;
  assert.equal(
    (await auth.finish({ challengeId: pending.challengeId, code: '123456' })).uid,
    'owner',
  );
  await assert.rejects(auth.finish({ challengeId: pending.challengeId, code: '123456' }));
});

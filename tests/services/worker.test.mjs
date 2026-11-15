import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Response as WorkerResponse } from 'miniflare';

test('Cloudflare runtime persists email challenges and atomically rejects replay', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const storage = path.join(root, 'tests/.runtime/worker-' + Date.now());
  let code,
    calls = 0;
  const options = {
    modules: true,
    modulesRoot: root,
    scriptPath: path.join(root, 'cloudflare/worker.mjs'),
    compatibilityDate: '2026-07-30',
    durableObjects: {
      AI_QUOTAS: { className: 'AiQuota', useSQLite: true },
      EMAIL_CHALLENGES: { className: 'EmailChallenge', useSQLite: true },
    },
    durableObjectsPersist: storage,
    ratelimits: { API_LIMITER: { namespace_id: '31001', simple: { limit: 10, period: 60 } } },
    bindings: {
      FIREBASE_API_KEY: 'test-public',
      RESEND_API_KEY: 'test-private',
      MAIL_FROM: 'from@example.test',
      SUPPORT_TO: 'support@example.test',
      GROQ_API_KEY: 'test-groq',
      GROQ_MODEL: 'test-model',
    },
    outboundService: async (request) => {
      calls++;
      const url = new URL(request.url);
      if (url.hostname === 'identitytoolkit.googleapis.com')
        return WorkerResponse.json({
          users: [{ localId: 'owner', email: 'verified@example.test', emailVerified: true }],
        });
      if (url.hostname === 'api.resend.com') {
        const mail = await request.json();
        assert.deepEqual(mail.to, ['verified@example.test']);
        code = /<strong>(\d{6})<\/strong>/.exec(mail.html)[1];
        return WorkerResponse.json({ id: 'fake-mail' });
      }
      if (url.hostname === 'api.groq.com')
        return WorkerResponse.json({ choices: [{ message: { content: 'Test reply' } }] });
      throw Error('Unexpected outbound request: ' + url.hostname);
    },
  };
  let worker = new Miniflare(options);
  const token =
    'header.' +
    Buffer.from(
      JSON.stringify({
        aud: 'techbrowser02',
        iss: 'https://securetoken.google.com/techbrowser02',
        sub: 'owner',
        exp: Date.now() / 1000 + 300,
      }),
    ).toString('base64url') +
    '.signature';
  const post = (route, body) =>
    worker.dispatchFetch('https://api.test' + route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '192.0.2.1',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
    });
  try {
    const start = await post('/v1/email/start', {});
    assert.equal(
      start.status,
      200,
      'start: ' + (await start.clone().text()) + '; outbound calls=' + calls,
    );
    const { challengeId } = await start.json();
    assert.match(code, /^\d{6}$/);
    await worker.dispose();
    worker = new Miniflare(options);
    const results = await Promise.all([
      post('/v1/email/finish', { challengeId, code }),
      post('/v1/email/finish', { challengeId, code }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.equal((await post('/v1/email/finish', { challengeId, code })).status, 400);
    const chat = await post('/v1/chat', { messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(chat.status, 200);
    assert.deepEqual(await chat.json(), { reply: 'Test reply' });
    const namespace = await worker.getDurableObjectNamespace('EMAIL_CHALLENGES');
    const stub = namespace.get(namespace.idFromName('expired-test'));
    await stub.fetch('https://challenge/init', {
      method: 'POST',
      body: JSON.stringify({ uid: 'owner', hash: 'a'.repeat(64), expires: Date.now() - 1 }),
    });
    assert.equal(
      (
        await stub.fetch('https://challenge/verify', {
          method: 'POST',
          body: JSON.stringify({ uid: 'owner', hash: 'a'.repeat(64) }),
        })
      ).status,
      400,
    );
    assert.ok(calls > 0);
  } finally {
    await worker.dispose();
  }
});

test('daily AI quota is atomic, persistent, isolated and refunds failures only once', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const options = {
    modules: true,
    modulesRoot: root,
    scriptPath: path.join(root, 'cloudflare/worker.mjs'),
    compatibilityDate: '2026-07-30',
    durableObjects: { AI_QUOTAS: { className: 'AiQuota', useSQLite: true } },
    durableObjectsPersist: path.join(root, 'tests/.runtime/quota-' + Date.now()),
  };
  let runtime = new Miniflare(options);
  const get = async (uid) => {
    const ns = await runtime.getDurableObjectNamespace('AI_QUOTAS');
    return ns.get(ns.idFromName(uid));
  };
  const reserve = (stub) => stub.fetch('https://quota/reserve', { method: 'POST', body: '{}' });
  try {
    let stub = await get('owner');
    const results = await Promise.all(Array.from({ length: 60 }, () => reserve(stub)));
    assert.equal(results.filter((x) => x.status === 200).length, 50);
    assert.equal(results.filter((x) => x.status === 429).length, 10);
    const ticket = await results.find((x) => x.status === 200).json();
    await runtime.dispose();
    runtime = new Miniflare(options);
    stub = await get('owner');
    assert.equal((await reserve(stub)).status, 429);
    const settle = () =>
      stub.fetch('https://quota/settle', {
        method: 'POST',
        body: JSON.stringify({ ...ticket, success: false }),
      });
    await settle();
    await settle();
    assert.equal((await reserve(stub)).status, 200);
    assert.equal((await reserve(stub)).status, 429);
    assert.equal((await reserve(await get('another-user'))).status, 200);
  } finally {
    await runtime.dispose();
  }
});

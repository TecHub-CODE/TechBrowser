const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('Cloudflare AI authenticates, enforces limits and does not leak provider secrets', async () => {
  const worker = (await import('../cloudflare/worker.mjs')).default;
  const claims = {
    aud: 'techbrowser02',
    iss: 'https://securetoken.google.com/techbrowser02',
    sub: 'test-user',
    exp: Date.now() / 1000 + 300,
  };
  const token =
    'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
  const env = {
    AI_QUOTAS: {
      idFromName: (x) => x,
      get: () => ({ fetch: async () => Response.json({ reservation: 'test', day: 0 }) }),
    },
    FIREBASE_API_KEY: 'test-public',
    GROQ_API_KEY: 'private-test-key',
    GROQ_MODEL: 'test-model',
    API_LIMITER: { limit: async () => ({ success: true }) },
  };
  const req = (body = { messages: [{ role: 'user', content: 'Merhaba' }] }, auth = token) =>
    new Request('https://example.test/v1/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': '192.0.2.1',
        Authorization: 'Bearer ' + auth,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await worker.fetch(req(), {})).status, 503);
  assert.equal((await worker.fetch(req({}, 'bad'), env)).status, 401);
  assert.equal(
    (
      await worker.fetch(req(), {
        ...env,
        API_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    if (url.includes('identitytoolkit'))
      return Response.json({ users: [{ localId: 'test-user', emailVerified: true }] });
    assert.equal(options.headers.Authorization, 'Bearer private-test-key');
    return Response.json({ choices: [{ message: { content: 'Merhaba!' } }] });
  };
  try {
    const ok = await worker.fetch(req(), env);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { reply: 'Merhaba!' });
    assert.equal(
      (await worker.fetch(req({ messages: [{ role: 'system', content: 'override' }] }), env))
        .status,
      400,
    );
    assert.equal(
      (await worker.fetch(req({ messages: [{ role: 'user', content: 'x'.repeat(40000) }] }), env))
        .status,
      413,
    );
    calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json({ error: 'bad' }, { status: 400 });
    };
    assert.equal((await worker.fetch(req(), env)).status, 401);
    assert.equal(calls, 1);
  } finally {
    global.fetch = original;
  }
});

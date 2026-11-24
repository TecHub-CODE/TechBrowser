const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGoogleSignIn } = require('../src/google-auth');

function requestLoopback(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          text: () => Promise.resolve(Buffer.concat(chunks).toString('utf8')),
        }),
      );
    });
    request.on('error', reject);
  });
}

test('Google ignores forged callbacks, uses PKCE and reports success only after authentication', async () => {
  let callbackDone;
  const callback = new Promise((resolve) => {
    callbackDone = resolve;
  });
  const signIn = createGoogleSignIn({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    request: async (url, options) => {
      assert.equal(options.body.get('code'), 'synthetic-code');
      assert.equal(options.body.get('code_verifier').length, 43);
      return Response.json({ id_token: 'test-id' });
    },
    authenticate: async (token, remember) => {
      assert.equal(token, 'test-id');
      assert.equal(remember, true);
      return { user: { uid: 'owner' } };
    },
    openExternal: async (input) => {
      try {
        const auth = new URL(input);
        assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
        const redirect = new URL(auth.searchParams.get('redirect_uri'));
        redirect.hostname = '127.0.0.1';
        redirect.searchParams.set('code', 'synthetic-code');
        redirect.searchParams.set('state', 'forged');
        assert.equal((await requestLoopback(redirect)).status, 400);
        redirect.searchParams.set('state', auth.searchParams.get('state'));
        const response = await requestLoopback(redirect);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /Giriş tamamlandı/);
        callbackDone();
      } catch (error) {
        callbackDone(error);
        throw error;
      }
    },
  });
  assert.equal((await signIn(true)).user.uid, 'owner');
  assert.equal(await callback, undefined);
});

test('failed Google verification never displays a success page', async () => {
  let callbackDone;
  const callback = new Promise((resolve) => {
    callbackDone = resolve;
  });
  const signIn = createGoogleSignIn({
    clientId: 'client',
    hostedService: { googleExchange: async () => ({ id_token: 'id' }) },
    authenticate: async () => {
      throw Error('verification failed');
    },
    openExternal: async (input) => {
      try {
        const auth = new URL(input),
          redirect = new URL(auth.searchParams.get('redirect_uri'));
        redirect.hostname = '127.0.0.1';
        redirect.searchParams.set('code', 'code');
        redirect.searchParams.set('state', auth.searchParams.get('state'));
        const response = await requestLoopback(redirect);
        assert.equal(response.status, 401);
        const html = await response.text();
        assert.match(html, /Giriş tamamlanamadı/);
        assert.doesNotMatch(html, /Giriş tamamlandı/);
        callbackDone();
      } catch (error) {
        callbackDone(error);
        throw error;
      }
    },
  });
  await assert.rejects(signIn(false), /verification failed/);
  assert.equal(await callback, undefined);
});

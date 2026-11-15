'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeBookmarks } = require('../src/bookmark-sync');
const { createAuthService } = require('../src/auth-service');

test('bookmark merge keeps local edits and ignores unusable or credential-bearing URLs', () => {
  assert.deepEqual(
    mergeBookmarks(
      [{ url: 'https://example.test', title: 'Old' }],
      [
        null,
        {},
        { url: 'https://' },
        { url: 'javascript:alert(1)' },
        { url: 'https://name:password@example.test' },
        { url: 'https://example.test', title: 'New' },
      ],
    ),
    [{ url: 'https://example.test', title: 'New' }],
  );
});

test('bookmark limits reject the merge without silently discarding records', () => {
  const bookmarks = Array.from({ length: 201 }, (_, i) => ({ url: `https://example.test/${i}` }));
  assert.throws(() => mergeBookmarks([], bookmarks), /200 yer imi/);
  assert.equal(bookmarks.length, 201);
  assert.throws(() => mergeBookmarks({}, []), /verisi okunamadı/);
  assert.throws(
    () => mergeBookmarks([], [{ url: 'https://example.test/' + 'x'.repeat(131072) }]),
    /boyut sınırı/,
  );
});

function fixture() {
  let completeRefresh;
  const started = Promise.withResolvers();
  let remote = '[]';
  let writes = 0;
  const service = createAuthService({
    apiKey: 'test',
    cloudSyncEnabled: true,
    request: async (url, options = {}) => {
      if (url.includes('signInWithIdp')) {
        const body = JSON.parse(options.body);
        const uid = new URLSearchParams(body.postBody).get('id_token');
        return Response.json({ idToken: uid, refreshToken: uid });
      }
      if (url.includes('securetoken')) {
        const token = new URLSearchParams(options.body).get('refresh_token');
        const pending = new Promise((resolve) => {
          completeRefresh = () => resolve(Response.json({ id_token: token, refresh_token: token }));
        });
        started.resolve();
        return pending;
      }
      if (url.includes('lookup')) {
        const uid = JSON.parse(options.body).idToken;
        return Response.json({
          users: [{ localId: uid, email: `${uid}@example.test`, emailVerified: true }],
        });
      }
      if (url.includes('firestore.googleapis.com')) {
        if (url.endsWith('documents:commit')) {
          writes++;
          return Response.json({});
        }
        return Response.json({
          updateTime: '2026-01-01T00:00:00Z',
          fields: { bookmarks: { stringValue: remote } },
        });
      }
      throw Error('Unexpected request');
    },
  });
  return {
    service,
    started: started.promise,
    complete: () => completeRefresh(),
    setRemote: (value) => {
      remote = value;
    },
    writes: () => writes,
  };
}

test('an in-flight refresh cannot restore a logged-out account or replace a new account', async () => {
  for (const nextAccount of [null, 'other']) {
    const f = fixture();
    await f.service.google('owner', true);
    const pending = f.service.accessToken();
    await f.started;
    f.service.logout();
    if (nextAccount) await f.service.google(nextAccount, true);
    f.complete();
    await assert.rejects(pending, /Oturum değişti/);
    assert.equal(f.service.profile()?.uid ?? null, nextAccount);
    assert.deepEqual(f.service.remembered(), nextAccount ? { refreshToken: nextAccount } : null);
  }
});

test('malformed or oversized cloud merges never overwrite the remote document', async () => {
  for (const value of [
    'not json',
    '{}',
    'null',
    JSON.stringify(Array.from({ length: 201 }, (_, i) => ({ url: `https://example.test/${i}` }))),
  ]) {
    const f = fixture();
    await f.service.google('owner');
    f.setRemote(value);
    const pending = f.service.sync({ bookmarks: [{ url: 'https://local.test' }] });
    await f.started;
    f.complete();
    await assert.rejects(pending, /verisi okunamadı|200 yer imi/);
    assert.equal(f.writes(), 0);
  }
});

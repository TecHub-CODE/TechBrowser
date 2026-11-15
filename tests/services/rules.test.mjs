import { test } from 'node:test';
import assert from 'node:assert/strict';
import authModule from '../../src/auth-service.js';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, setLogLevel } from 'firebase/firestore';
setLogLevel('silent'); // Expected permission denials are assertions, not test errors.

test('Firestore enforces the browserSync rules in the real emulator', async (t) => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address || ''))
    throw Error('A loopback emulator is required; production access is forbidden.');
  const rules = await readFile(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8');
  const [host, port] = address.split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-techbrowser',
    firestore: {
      host,
      port: Number(port),
      rules,
    },
  });
  const now = Math.floor(Date.now() / 1000);
  const context = (uid = 'owner', extra = {}) =>
    env
      .authenticatedContext(uid, {
        email_verified: true,
        auth_time: now,
        firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' },
        ...extra,
      })
      .firestore();
  const own = (db) => doc(db, 'browserSync/owner');
  try {
    await env.clearFirestore();
    await t.test('verified owner with TOTP can create, read and update', async () => {
      const db = context();
      await assertSucceeds(setDoc(own(db), { bookmarks: '[]' }));
      await assertSucceeds(getDoc(own(db)));
      await assertSucceeds(setDoc(own(db), { bookmarks: '[{"url":"https://example.test"}]' }));
    });
    await t.test('anonymous and another UID cannot read, write or delete', async () => {
      for (const db of [env.unauthenticatedContext().firestore(), context('other')]) {
        await assertFails(getDoc(own(db)));
        await assertFails(setDoc(own(db), { bookmarks: '[]' }));
        await assertFails(deleteDoc(own(db)));
      }
    });
    await t.test('unverified or non-TOTP sessions cannot read or write', async () => {
      for (const db of [
        context('owner', { email_verified: false }),
        context('owner', { firebase: { sign_in_provider: 'password' } }),
      ]) {
        await assertFails(getDoc(own(db)));
        await assertFails(setDoc(own(db), { bookmarks: '[]' }));
      }
    });
    await t.test('unexpected fields, wrong types and oversized bookmarks are denied', async () => {
      for (const data of [
        { bookmarks: '[]', secret: 'x' },
        { bookmarks: [] },
        { bookmarks: 'x'.repeat(131073) },
      ])
        await assertFails(setDoc(own(context()), data));
    });
    await t.test('old, future, noninteger and unverified login cannot delete', async () => {
      for (const extra of [
        { auth_time: now - 360 },
        { auth_time: now + 360 },
        { auth_time: String(now) },
        { email_verified: false },
      ])
        await assertFails(deleteDoc(own(context('owner', extra))));
    });
    await t.test(
      'two app sessions exchange bookmarks through Firestore REST without losing either set',
      async () => {
        // Unsigned tokens are accepted only by this loopback demo emulator.
        const claims = {
          sub: 'sync-owner',
          user_id: 'sync-owner',
          email: 'sync@example.test',
          email_verified: true,
          aud: 'demo-techbrowser',
          iss: 'https://securetoken.google.com/demo-techbrowser',
          iat: now,
          auth_time: now,
          exp: now + 3600,
          firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' },
        };
        const token =
          [{ alg: 'none', typ: 'JWT' }, claims]
            .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
            .join('.') + '.';
        const make = async () => {
          const service = authModule.createAuthService({
            apiKey: 'emulator-only',
            projectId: 'demo-techbrowser',
            cloudSyncEnabled: true,
            request: async (url, options = {}) => {
              if (url.startsWith('https://securetoken.googleapis.com/'))
                return Response.json({ id_token: token, refresh_token: 'test-refresh' });
              if (
                url.startsWith('https://identitytoolkit.googleapis.com/') &&
                url.includes('accounts:lookup')
              )
                return Response.json({
                  users: [
                    { localId: 'sync-owner', email: 'sync@example.test', emailVerified: true },
                  ],
                });
              if (!url.startsWith('https://firestore.googleapis.com/v1/projects/demo-techbrowser/'))
                throw Error('Unexpected endpoint; real service access is forbidden.');
              return fetch(
                url.replace('https://firestore.googleapis.com', `http://${address}`),
                options,
              );
            },
          });
          await service.refresh({ refreshToken: 'test-refresh' });
          return service;
        };
        const first = await make();
        const second = await make();
        const a = { url: 'https://first.example.test', title: 'First device' };
        const b = { url: 'https://second.example.test', title: 'Second device' };
        assert.deepEqual(await first.sync({ bookmarks: [a] }), [a]);
        assert.deepEqual(await second.sync({ bookmarks: [b] }), [a, b]);
        assert.deepEqual(await first.sync({ bookmarks: [a] }), [a, b]);
        await assert.rejects(
          first.sync({
            bookmarks: Array.from({ length: 201 }, (_, i) => ({
              url: `https://large.example.test/${i}`,
            })),
          }),
          /200 yer imi/,
        );
        assert.deepEqual(await second.sync({ bookmarks: [] }), [a, b]);
      },
    );
    await t.test(
      'recent verified owner without TOTP can delete only their own document',
      async () => {
        const db = context('owner', { firebase: { sign_in_provider: 'password' } });
        await assertSucceeds(deleteDoc(own(db)));
        await assertFails(setDoc(own(db), { bookmarks: '[]' }));
      },
    );
  } finally {
    await env.cleanup();
  }
});

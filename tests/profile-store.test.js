const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createProfileStore } = require('../src/profile-store');

test('avatars survive a new store instance, remain account-specific and reject corrupt input', () => {
  const root = path.join(__dirname, '.runtime');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'profile-unit-'));
  const avatar = 'data:image/png;base64,YXZhdGFy';
  // Encryption/native image integration is exercised separately in real Electron.
  const options = {
    directory,
    store: {
      decrypt: JSON.parse,
      write: (file, value) => fs.writeFileSync(file, JSON.stringify(value)),
    },
    nativeImage: {
      createFromDataURL: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 500, height: 500 }),
        resize: (options) => {
          assert.equal(options.width, 256);
          return { toDataURL: () => avatar };
        },
      }),
    },
  };
  const profile = createProfileStore(options);
  assert.equal(profile.withAvatar(null), null);
  assert.throws(() => profile.saveAvatar(null, avatar));
  assert.throws(() => profile.saveAvatar({ uid: 'one' }, 'data:image/svg+xml;base64,YQ=='));
  profile.saveAvatar({ uid: 'one' }, avatar);
  const reopened = createProfileStore(options);
  assert.equal(reopened.withAvatar({ uid: 'one' }).avatar, avatar);
  assert.equal(reopened.withAvatar({ uid: 'two' }).avatar, undefined);
  const misket = { variant: 'custom', color: '#7c5cff', eyeColor: '#fafafa', motion: false };
  profile.saveAvatar({ uid: 'one' }, avatar, misket);
  assert.deepEqual(createProfileStore(options).withAvatar({ uid: 'one' }).misket, misket);
  assert.equal(reopened.withAvatar({ uid: 'two' }).misket, undefined);
  assert.throws(() =>
    profile.saveAvatar({ uid: 'one' }, avatar, { ...misket, color: 'url(https://invalid.test)' }),
  );
  assert.throws(() =>
    profile.saveAvatar({ uid: 'one' }, avatar, { ...misket, variant: 'unknown' }),
  );
  assert.deepEqual(reopened.withAvatar({ uid: 'one' }).misket, misket);
  profile.saveAvatar({ uid: 'one' }, avatar);
  assert.equal(reopened.withAvatar({ uid: 'one' }).misket, null);
  const file = path.join(directory, 'techbrowser-profiles.json');
  fs.writeFileSync(file, 'broken');
  assert.throws(() => reopened.saveAvatar({ uid: 'one' }, avatar));
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
});

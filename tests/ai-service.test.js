'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createAiService } = require('../src/ai-service');
const { createStore } = require('../src/secure-store');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'techbrowser-ai-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createStore(directory, {}, 'synthetic-test-only-encryption-secret');
  const service = createAiService({ directory, store, ...options });
  return { service, directory, store };
}

test('personal AI keys are encrypted and status never returns credentials', (t) => {
  const { service, directory, store } = fixture(t);
  const configured = service.saveKey({ provider: 'chatgpt', key: 'synthetic-openai-key' });
  assert.equal(configured.chatgpt, true);
  assert.equal(configured.groq, false);
  assert.ok(Object.values(configured).every((value) => typeof value === 'boolean'));
  const file = path.join(directory, 'techbrowser-ai-keys.json');
  assert.equal(fs.readFileSync(file, 'utf8').includes('synthetic-openai-key'), false);
  assert.equal(createAiService({ directory, store }).status().chatgpt, true);
  fs.unlinkSync(file);
  assert.equal(
    service.status().chatgpt,
    false,
    'deleted credentials cannot survive in a service cache',
  );
});

test('legacy migration keeps newer keys and preserves corrupt encrypted files', (t) => {
  const { service, directory, store } = fixture(t);
  service.saveKey({ provider: 'chatgpt', key: 'new-key' });
  service.migrate({ chatgpt: 'old-key', claude: 'legacy-claude' });
  const file = path.join(directory, 'techbrowser-ai-keys.json');
  assert.deepEqual(store.decrypt(fs.readFileSync(file, 'utf8')), {
    chatgpt: 'new-key',
    claude: 'legacy-claude',
  });
  const corrupt = JSON.parse(fs.readFileSync(file, 'utf8'));
  corrupt.tag = '00'.repeat(16);
  fs.writeFileSync(file, JSON.stringify(corrupt));
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => service.migrate({ gemini: 'new-gemini' }), /mevcut kayıt korundu/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('providers use fixed HTTPS endpoints, correct headers and bounded messages', async (t) => {
  const calls = [];
  const { service } = fixture(t, {
    request: async (url, options) => {
      calls.push({ url, ...options });
      const data = url.endsWith('/v1/models')
        ? { data: [{ id: 'claude-sonnet-test' }] }
        : url.endsWith('/v1beta/models')
          ? {
              models: [
                {
                  name: 'models/gemini-9.0-flash',
                  supportedGenerationMethods: ['generateContent'],
                },
              ],
            }
          : url.includes('openai.com')
            ? { choices: [{ message: { content: 'openai answer' } }] }
            : url.includes('anthropic.com')
              ? { content: [{ type: 'text', text: 'claude answer' }] }
              : { candidates: [{ content: { parts: [{ text: 'gemini answer' }] } }] };
      return { ok: true, json: async () => data };
    },
  });
  const messages = [{ role: 'user', content: 'synthetic message' }];
  for (const provider of ['chatgpt', 'claude', 'gemini']) {
    service.saveKey({ provider, key: provider + '-synthetic-key' });
    assert.match(await service.query({ provider, messages }), /answer$/);
  }
  assert.equal(calls[0].headers.Authorization, 'Bearer chatgpt-synthetic-key');
  assert.equal(calls[1].headers['x-api-key'], 'claude-synthetic-key');
  assert.equal(calls[3].headers['x-goog-api-key'], 'gemini-synthetic-key');
  assert.ok(
    calls.every((call) => !call.url.includes('synthetic-key') && call.redirect === 'error'),
  );
  const count = calls.length;
  await assert.rejects(
    service.query({
      provider: 'chatgpt',
      messages: [{ role: 'user', content: 'x'.repeat(25001) }],
    }),
    /çok uzun/,
  );
  await assert.rejects(service.query({ provider: 'http://evil.test', messages }), /Desteklenmeyen/);
  assert.equal(calls.length, count);
});

test('provider errors cannot reflect keys back to the renderer', async (t) => {
  const { service } = fixture(t, {
    request: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'secret-key' } }),
    }),
  });
  service.saveKey({ provider: 'chatgpt', key: 'secret-key' });
  await assert.rejects(
    service.query({ provider: 'chatgpt', messages: [{ role: 'user', content: 'hello' }] }),
    (error) => {
      assert.doesNotMatch(error.message, /secret-key/);
      return true;
    },
  );
});

test('renderer only removes legacy keys after confirmed secure migration', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/ai.js'), 'utf8');
  const entries = new Map([['tb_ai_keys', '{"chatgpt":"legacy-test-key"}']]);
  let success = false;
  const context = {
    localStorage: {
      getItem: (key) => entries.get(key) ?? null,
      removeItem: (key) => entries.delete(key),
    },
    window: {
      electronAPI: {
        invoke: async () => ({ success, configured: { chatgpt: true }, error: 'disk unavailable' }),
      },
    },
    document: { getElementById: () => null },
    toast() {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await context.initAiKeys();
  assert.equal(entries.has('tb_ai_keys'), true);
  assert.equal(context.aiReady, false);
  success = true;
  await context.initAiKeys();
  assert.equal(entries.has('tb_ai_keys'), false);
  assert.equal(context.aiKeys.chatgpt, true);
  assert.doesNotMatch(JSON.stringify(context.aiKeys), /legacy-test-key/);
});

test('lost encryption key is detected when only auth or AI records remain', (t) => {
  for (const name of ['techbrowser-auth.json', 'techbrowser-ai-keys.json']) {
    const { directory } = fixture(t);
    fs.writeFileSync(path.join(directory, name), JSON.stringify({ v: 2, data: 'ff' }));
    assert.throws(
      () => createStore(directory, { isEncryptionAvailable: () => true }).encrypt({}),
      /anahtarı kayıp/,
    );
    assert.equal(fs.existsSync(path.join(directory, '.techbrowser_enc_key.protected')), false);
  }
});

test('saved Groq key replaces invalid environment key and can be rotated', async (t) => {
  const headers = [];
  const { service, directory, store } = fixture(t, {
    groqApiKey: 'anahtarınızı-girin',
    request: async (url, options) => {
      headers.push(options.headers.Authorization);
      return {
        ok: true,
        json: async () =>
          url.endsWith('/models')
            ? { data: [{ id: 'llama-3.3-70b-versatile' }] }
            : { choices: [{ message: { content: 'Merhaba' } }] },
      };
    },
  });
  assert.equal(service.status().groq, false);
  assert.throws(() => service.saveKey({ provider: 'groq', key: 'geçersiz' }), /Geçerli/);
  for (const key of ['gsk_syntheticFirst', 'gsk_syntheticSecond']) {
    assert.equal(service.saveKey({ provider: 'groq', key }).groq, true);
    assert.equal(
      await service.query({
        provider: 'groq',
        messages: [{ role: 'user', content: 'Türkçe bir mesaj' }],
      }),
      'Merhaba',
    );
    assert.equal(headers.at(-1), 'Bearer ' + key);
    assert.equal(
      fs.readFileSync(path.join(directory, 'techbrowser-ai-keys.json'), 'utf8').includes(key),
      false,
    );
  }
  assert.equal(createAiService({ directory, store }).status().groq, true);
});

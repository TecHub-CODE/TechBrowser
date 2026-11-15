const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGroq } = require('../src/groq');
test('AI selects accessible chat models and falls back only on unavailable model errors', async () => {
  const calls = [];
  const ask = createGroq({
    apiKey: 'test',
    request: async (url, opts) => {
      const body = opts.body && JSON.parse(opts.body);
      calls.push(body);
      const d = url.endsWith('/models')
        ? { data: [{ id: 'qwen/qwen3.8-27b' }, { id: 'openai/gpt-oss-20b' }] }
        : body.model === 'qwen/qwen3.8-27b'
          ? { error: { code: 'model_not_found', message: 'missing' } }
          : { choices: [{ message: { content: 'Merhaba' } }] };
      return { ok: !d.error, status: d.error ? 404 : 200, json: async () => d };
    },
  });
  assert.equal(await ask([{ role: 'user', content: 'test' }]), 'Merhaba');
  assert.equal(calls[2].model, 'openai/gpt-oss-20b');
});
test('AI does not conceal rate limits as empty successes', async () => {
  const ask = createGroq({
    apiKey: 'test',
    request: async (url) =>
      url.endsWith('/models')
        ? { ok: true, json: async () => ({ data: [{ id: 'qwen/qwen3.8-27b' }] }) }
        : { ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) },
  });
  await assert.rejects(ask([{ role: 'user', content: 'test' }]), /kullanım sınırına/);
});

test('invalid Groq header values are rejected before network access', async () => {
  for (const apiKey of ['anahtarınızı-girin', 'abc def', 'abc\n', '']) {
    let calls = 0;
    const ask = createGroq({
      apiKey,
      request: async () => {
        calls++;
        throw Error('unexpected');
      },
    });
    await assert.rejects(ask([{ role: 'user', content: 'Merhaba' }]), /Geçerli bir Groq/);
    assert.equal(calls, 0);
  }
});

test('Groq errors never expose provider credential echoes', async () => {
  const ask = createGroq({
    apiKey: 'synthetic-secret',
    request: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'synthetic-secret' } }),
    }),
  });
  await assert.rejects(ask([{ role: 'user', content: 'Merhaba' }]), (error) => {
    assert.match(error.message, /kabul edilmedi/);
    assert.doesNotMatch(error.message, /synthetic-secret/);
    return true;
  });
});

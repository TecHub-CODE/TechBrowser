'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createGroq, isValidApiKey } = require('./groq');
const PROVIDERS = ['groq', 'chatgpt', 'claude', 'gemini'];

function createAiService({
  directory,
  store,
  groqApiKey,
  hostedChat,
  request = fetch,
  models = {},
}) {
  const file = path.join(directory, 'techbrowser-ai-keys.json');
  let activeGroqKey = null,
    groq = null;
  function groqQuery(messages) {
    const key = readKeys().groq || groqApiKey;
    if (key !== activeGroqKey || !groq) {
      activeGroqKey = key;
      groq = createGroq({ apiKey: key, request });
    }
    return groq(messages);
  }

  function readKeys() {
    try {
      const keys = store.decrypt(fs.readFileSync(file, 'utf8'));
      if (!keys || typeof keys !== 'object' || Array.isArray(keys))
        throw Error('Geçersiz anahtar kaydı.');
      return keys;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw Error('AI anahtar kaydı okunamadı; mevcut kayıt korundu.');
    }
  }

  function validateKey(provider, key) {
    if (!PROVIDERS.includes(provider)) throw Error('Desteklenmeyen AI sağlayıcısı.');
    if (!isValidApiKey(key)) {
      throw Error('Geçerli bir API anahtarı girin.');
    }
    return key.trim();
  }

  function status() {
    const keys = readKeys();
    return {
      ...Object.fromEntries(PROVIDERS.map((provider) => [provider, isValidApiKey(keys[provider])])),
      groq: !!hostedChat || isValidApiKey(keys.groq || groqApiKey),
    };
  }

  function saveKey({ provider, key }) {
    const value = validateKey(provider, key);
    const keys = readKeys();
    store.write(file, { ...keys, [provider]: value });
    return status();
  }

  function migrate(legacy) {
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy))
      throw Error('Eski AI anahtar kaydı okunamadı.');
    const keys = readKeys();
    let changed = false;
    for (const provider of PROVIDERS) {
      if (legacy[provider] && !keys[provider]) {
        keys[provider] = validateKey(provider, legacy[provider]);
        changed = true;
      }
    }
    // Never overwrite a newer key with a stale localStorage copy.
    if (changed) store.write(file, keys);
    return status();
  }

  async function json(url, headers, body) {
    let response;
    try {
      response = await request(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(45000),
        redirect: 'error',
      });
    } catch {
      throw Error('AI hizmetine ulaşılamadı veya yanıt süresi doldu.');
    }
    // Provider errors can echo credentials; do not forward them to the renderer.
    if (!response.ok) {
      if ([401, 403].includes(response.status))
        throw Error('API anahtarını ve hesabın erişim izinlerini kontrol edin.');
      if (response.status === 429)
        throw Error('Sağlayıcı kullanım sınırına ulaşıldı. Kotanızı kontrol edin.');
      throw Error('AI sağlayıcısı isteği tamamlayamadı (HTTP ' + response.status + ').');
    }
    try {
      return await response.json();
    } catch {
      throw Error('AI sağlayıcısından geçersiz yanıt geldi.');
    }
  }

  async function query({ provider, messages }) {
    if (!PROVIDERS.includes(provider)) throw Error('Desteklenmeyen AI sağlayıcısı.');
    if (
      !Array.isArray(messages) ||
      !messages.length ||
      messages.length > 10 ||
      messages.some(
        (message) =>
          !message ||
          !['user', 'assistant'].includes(message.role) ||
          typeof message.content !== 'string' ||
          !message.content.trim() ||
          message.content.length > 25000,
      ) ||
      messages.reduce((length, message) => length + message.content.length, 0) > 100000
    ) {
      throw Error('AI mesajları boş, geçersiz veya çok uzun.');
    }
    const safeMessages = messages.map(({ role, content }) => ({ role, content }));
    if (provider === 'groq') return hostedChat ? hostedChat(safeMessages) : groqQuery(safeMessages);
    const key = readKeys()[provider];
    if (!isValidApiKey(key)) throw Error('Bu sağlayıcı için geçerli bir API anahtarı kaydedin.');
    let reply;
    if (provider === 'chatgpt') {
      const data = await json(
        'https://api.openai.com/v1/chat/completions',
        { Authorization: 'Bearer ' + key },
        {
          model: models.chatgpt || 'gpt-4o-mini',
          messages: safeMessages,
          max_tokens: 1000,
        },
      );
      reply = data.choices?.[0]?.message?.content;
    } else if (provider === 'claude') {
      const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
      let model = models.claude;
      if (!model) {
        const available = await json('https://api.anthropic.com/v1/models', headers);
        model = available.data?.find((item) => /^claude-sonnet-/.test(item.id))?.id;
        if (!model) throw Error('Bu hesapta erişilebilir bir Claude Sonnet modeli bulunamadı.');
      }
      const data = await json('https://api.anthropic.com/v1/messages', headers, {
        model,
        messages: safeMessages,
        max_tokens: 1000,
      });
      reply = data.content
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
    } else {
      const headers = { 'x-goog-api-key': key };
      let model = models.gemini;
      if (!model) {
        const available = await json(
          'https://generativelanguage.googleapis.com/v1beta/models',
          headers,
        );
        model = available.models?.find(
          (item) =>
            /^models\/gemini-[\d.]+-flash$/.test(item.name) &&
            item.supportedGenerationMethods?.includes('generateContent'),
        )?.name;
        if (!model) throw Error('Bu hesapta erişilebilir bir Gemini Flash modeli bulunamadı.');
      }
      const id = model.replace(/^models\//, '');
      const data = await json(
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(id) +
          ':generateContent',
        headers,
        {
          contents: safeMessages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: 1000 },
        },
      );
      reply = data.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text || '')
        .join('\n');
    }
    if (typeof reply !== 'string' || !reply.trim())
      throw Error('AI metin yanıtı vermedi. İsteğinizi yeniden düzenleyin.');
    return reply;
  }

  return { status, saveKey, migrate, query };
}

module.exports = { createAiService };

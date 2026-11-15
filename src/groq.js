'use strict';
function isValidApiKey(key) {
  return typeof key === 'string' && !/[\r\n]/.test(key) && /^[\x21-\x7e]{1,4096}$/.test(key.trim());
}
function createGroq({ apiKey, request = fetch, preferred = process.env.GROQ_MODEL }) {
  apiKey = isValidApiKey(apiKey) ? apiKey.trim() : '';
  let cached = [];
  let expires = 0;
  const choices = [
    preferred,
    'qwen/qwen3.8-27b',
    'qwen/qwen3.6-27b',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ].filter(Boolean);
  async function call(path, body) {
    let r;
    try {
      r = await request('https://api.groq.com/openai/v1/' + path, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(25000),
        redirect: 'error',
      });
    } catch {
      throw Error('Misket hizmetine ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    }
    let d;
    try {
      d = await r.json();
    } catch {
      throw Error('AI sağlayıcısından geçersiz yanıt geldi.');
    }
    if (!r.ok || d.error) {
      const message = [401, 403].includes(r.status)
        ? 'Groq API anahtarı kabul edilmedi. Anahtarınızı ve erişim izinlerinizi kontrol edin.'
        : r.status === 429
          ? 'AI kullanım sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.'
          : 'AI hizmeti isteği tamamlayamadı (HTTP ' + r.status + ').';
      const e = Error(message);
      e.status = r.status;
      e.code = d.error?.code;
      throw e;
    }
    return d;
  }
  return async (messages) => {
    if (!isValidApiKey(apiKey))
      throw Error(
        'Geçerli bir Groq API anahtarı kaydedin. Anahtar Türkçe karakter, boşluk veya satır sonu içeremez.',
      );
    if (
      !Array.isArray(messages) ||
      !messages.length ||
      messages.length > 100 ||
      messages.some(
        (m) =>
          !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string',
      )
    )
      throw Error('Geçersiz AI mesajı.');
    if (Date.now() > expires) {
      const d = await call('models');
      cached = choices.filter((id) => d.data?.some((m) => m.id === id && m.active !== false));
      expires = Date.now() + 300000;
    }
    for (const model of cached.slice()) {
      try {
        const d = await call('chat/completions', { model, messages, max_completion_tokens: 1000 });
        const reply = d.choices?.[0]?.message?.content;
        if (typeof reply !== 'string' || !reply.trim())
          throw Error('AI boş yanıt verdi. Tekrar deneyin.');
        return reply;
      } catch (e) {
        if (e.code === 'model_not_found' || e.code === 'model_decommissioned' || e.status === 404) {
          cached = cached.filter((id) => id !== model);
          continue;
        }
        if (e.status === 429)
          throw Error('AI kullanım sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.');
        throw e;
      }
    }
    expires = 0;
    throw Error('Bu hesapta erişilebilir sohbet modeli bulunamadı.');
  };
}
module.exports = { createGroq, isValidApiKey };

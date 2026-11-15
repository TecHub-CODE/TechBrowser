'use strict';

function createHostedService({ baseUrl, request = fetch }) {
  if (!baseUrl) return null;
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !['', '/'].includes(base.pathname)
  ) {
    throw Error('Hizmet adresi yalnızca HTTPS sunucu adresi olmalıdır.');
  }
  const errors = {
    SIGN_IN_REQUIRED: 'Bu hizmet için hesabınıza giriş yapın.',
    INVALID_SESSION: 'Oturum geçersiz. Yeniden giriş yapın.',
    VERIFIED_ACCOUNT_REQUIRED: 'Önce e-posta adresinizi doğrulayın.',
    SESSION_VERIFICATION_FAILED: 'Oturum doğrulanamadı. Yeniden giriş yapın.',
    RATE_LIMITED: 'Çok fazla istek gönderildi. Bir dakika bekleyin.',
    DAILY_QUOTA_REACHED:
      'Bugünkü 50 mesaj hakkınızı kullandınız. Türkiye saatiyle 00.00’da yenilenir.',
    AI_QUOTA_REACHED: 'AI hizmetinin kullanım sınırına ulaşıldı.',
    INVALID_CODE: 'Doğrulama kodu yanlış.',
    EXPIRED_CODE: 'Kodun süresi doldu veya deneme sınırı aşıldı. Yeniden giriş yapın.',
    SERVICE_NOT_CONFIGURED: 'Bu hizmet sunucuda henüz yapılandırılmamış.',
    MAIL_UNAVAILABLE: 'E-posta gönderilemedi. Daha sonra yeniden deneyin.',
    INVALID_REQUEST: 'İstek boş, geçersiz veya çok büyük.',
  };
  async function call(route, body, token) {
    const response = await request(new URL(route, base).href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
      redirect: 'error',
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error('Hizmet sunucusundan geçersiz yanıt geldi.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw Error('Hizmet sunucusundan geçersiz yanıt geldi.');
    if (!response.ok)
      throw Error(errors[data.error] || 'Hizmet isteği tamamlanamadı. Daha sonra yeniden deneyin.');
    return data;
  }
  return {
    async chat(messages, token) {
      const result = await call('/v1/chat', { messages }, token);
      if (typeof result.reply !== 'string' || !result.reply.trim())
        throw Error('AI boş yanıt verdi.');
      return result.reply;
    },
    startEmail: (token) => call('/v1/email/start', {}, token),
    async finishEmail(challengeId, code, token) {
      const result = await call('/v1/email/finish', { challengeId, code }, token);
      if (result.success !== true) throw Error('Doğrulama tamamlanamadı.');
      return result;
    },
    googleExchange: (payload) => call('/v1/oauth/google', payload),
    report: (payload, token) => call('/v1/report', payload, token),
  };
}

module.exports = { createHostedService };

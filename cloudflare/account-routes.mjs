// All outbound mail is sent by the deployed service, using a verified sender.
// Tests replace fetch; they never send real mail.
const reply = (status, data) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const digest = async (value) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

function randomCode() {
  const random = new Uint32Array(1),
    limit = Math.floor(2 ** 32 / 900000) * 900000;
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(100000 + (random[0] % 900000));
}

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  return result.ok;
}

export async function accountRoute(route, body, env, user) {
  if (route === '/v1/oauth/google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      return reply(503, { error: 'SERVICE_NOT_CONFIGURED' });
    let redirect;
    try {
      redirect = new URL(body.redirectUri);
    } catch {
      return reply(400, { error: 'INVALID_REQUEST' });
    }
    if (
      redirect.protocol !== 'http:' ||
      redirect.hostname !== 'localhost' ||
      !redirect.port ||
      redirect.pathname !== '/callback' ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      typeof body.code !== 'string' ||
      body.code.length > 4096 ||
      !body.code ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(body.verifier || '')
    )
      return reply(400, { error: 'INVALID_REQUEST' });
    const result = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code: body.code,
        code_verifier: body.verifier,
        redirect_uri: body.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    if (!result.ok) return reply(401, { error: 'INVALID_SESSION' });
    const tokens = await result.json();
    if (typeof tokens.id_token !== 'string') return reply(502, { error: 'SERVICE_UNAVAILABLE' });
    // The desktop uses this ID token to sign in to Firebase; provider access and
    // refresh tokens are deliberately not returned.
    return reply(200, { id_token: tokens.id_token });
  }
  if (route === '/v1/email/start') {
    if (!env.EMAIL_CHALLENGES || !env.RESEND_API_KEY || !env.MAIL_FROM)
      return reply(503, { error: 'SERVICE_NOT_CONFIGURED' });
    if (!user.email) return reply(403, { error: 'VERIFIED_ACCOUNT_REQUIRED' });
    const challengeId = crypto.randomUUID(),
      code = randomCode();
    const stub = env.EMAIL_CHALLENGES.get(env.EMAIL_CHALLENGES.idFromName(challengeId));
    await stub.fetch('https://challenge/init', {
      method: 'POST',
      body: JSON.stringify({
        uid: user.localId,
        hash: await digest(challengeId + ':' + code),
        expires: Date.now() + 300000,
      }),
    });
    let sent = false;
    try {
      sent = await sendMail(
        env,
        user.email,
        'TechBrowser giriş kodu',
        `<p>Giriş kodunuz: <strong>${code}</strong></p><p>Bu kod 5 dakika geçerlidir. İsteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
      );
    } finally {
      if (!sent) await stub.fetch('https://challenge/cancel', { method: 'DELETE' });
    }
    return sent ? reply(200, { challengeId }) : reply(503, { error: 'MAIL_UNAVAILABLE' });
  }
  if (route === '/v1/email/finish') {
    if (!env.EMAIL_CHALLENGES) return reply(503, { error: 'SERVICE_NOT_CONFIGURED' });
    if (!/^[a-f0-9-]{36}$/.test(body.challengeId || '') || !/^\d{6}$/.test(body.code || ''))
      return reply(400, { error: 'INVALID_CODE' });
    return env.EMAIL_CHALLENGES.get(env.EMAIL_CHALLENGES.idFromName(body.challengeId)).fetch(
      'https://challenge/verify',
      {
        method: 'POST',
        body: JSON.stringify({
          uid: user.localId,
          hash: await digest(body.challengeId + ':' + body.code),
        }),
      },
    );
  }
  if (route === '/v1/report') {
    if (!env.SUPPORT_TO || !env.MAIL_FROM || !env.RESEND_API_KEY)
      return reply(503, { error: 'SERVICE_NOT_CONFIGURED' });
    if (
      typeof body.description !== 'string' ||
      body.description.trim().length < 10 ||
      body.description.length > 10000 ||
      typeof body.subject !== 'string' ||
      body.subject.length > 150
    )
      return reply(400, { error: 'INVALID_REQUEST' });
    const sent = await sendMail(
      env,
      env.SUPPORT_TO,
      'TechBrowser bildirimi: ' + body.subject.replace(/[\r\n]/g, ' '),
      `<p>Gönderen: ${escape(user.email)}</p><p>Kategori: ${escape(body.category)}</p><p>Sürüm: ${escape(body.appVersion)}</p><pre>${escape(body.description)}</pre>`,
    );
    return sent ? reply(200, { success: true }) : reply(503, { error: 'MAIL_UNAVAILABLE' });
  }
  return reply(404, { error: 'NOT_FOUND' });
}

export class EmailChallenge {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const route = new URL(request.url).pathname;
    if (route === '/cancel') {
      await this.state.storage.deleteAll();
      return reply(200, { success: true });
    }
    const body = await request.json();
    if (route === '/init') {
      await this.state.storage.put('challenge', { ...body, remaining: 5 });
      await this.state.storage.setAlarm(body.expires);
      return reply(200, { success: true });
    }
    if (route !== '/verify') return reply(404, { error: 'NOT_FOUND' });
    const outcome = await this.state.storage.transaction(async (tx) => {
      const challenge = await tx.get('challenge');
      if (!challenge || challenge.expires <= Date.now() || challenge.remaining <= 0) {
        await tx.delete('challenge');
        return 'EXPIRED_CODE';
      }
      if (challenge.uid !== body.uid) return 'INVALID_CODE';
      let mismatch = challenge.hash.length ^ String(body.hash).length;
      for (let i = 0; i < challenge.hash.length; i++)
        mismatch |= challenge.hash.charCodeAt(i) ^ (String(body.hash).charCodeAt(i) || 0);
      if (mismatch) {
        challenge.remaining--;
        await tx.put('challenge', challenge);
        return 'INVALID_CODE';
      }
      await tx.delete('challenge');
      return null;
    });
    return outcome ? reply(400, { error: outcome }) : reply(200, { success: true });
  }
  async alarm() {
    await this.state.storage.deleteAll();
  }
}

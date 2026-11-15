'use strict';
const crypto = require('crypto');
const { mergeBookmarks } = require('./bookmark-sync');
function createAuthService({
  apiKey,
  request = fetch,
  sendMail,
  hostedService,
  now = Date.now,
  projectId = 'techbrowser02',
  cloudSyncEnabled = false,
}) {
  const attempts = new Map(),
    challenges = new Map();
  let current = null,
    enrollment = null,
    sessionRevision = 0;
  function limit(key, max = 5) {
    const t = now();
    for (const [k, v] of attempts) if (v.until <= t) attempts.delete(k);
    const v = attempts.get(key) || { n: 0, until: t + 60000 };
    attempts.set(key, v);
    if (++v.n > max) throw Error('Çok fazla deneme. Bir dakika bekleyin.');
  }
  async function json(url, body, method = 'POST', headers = {}) {
    const r = await request(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    const value = await r.json();
    if (!r.ok || value.error) throw Error(value.error?.message || 'Hesap hizmeti kullanılamıyor.');
    return value;
  }
  const api = (method, body) =>
    json(
      `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(apiKey)}`,
      body,
    );
  const mfa = (method, body) =>
    json(
      `https://identitytoolkit.googleapis.com/v2/accounts/${method}?key=${encodeURIComponent(apiKey)}`,
      body,
    );
  async function lookup(token) {
    const r = await api('lookup', { idToken: token });
    if (!r.users?.[0]) throw Error('Oturum geçersiz.');
    return r.users[0];
  }
  const profile = (u) => ({
    uid: u.localId,
    name: u.displayName || u.email.split('@')[0],
    email: u.email,
    username: u.email.split('@')[0],
    avatar: u.photoUrl || null,
    provider:
      u.provider ||
      (u.providerUserInfo?.some((p) => p.providerId === 'google.com') ? 'google' : 'email'),
    mfaEnabled: !!u.mfaInfo?.length,
  });
  function newChallenge(email, data) {
    for (const [id, c] of challenges)
      if (c.expires <= now() || c.email === email) challenges.delete(id);
    const id = crypto.randomBytes(24).toString('hex');
    challenges.set(id, { email, expires: now() + 300000, remaining: 5, ...data });
    return id;
  }
  function pendingMfa(result, email, remember) {
    const factor = result.mfaInfo?.find((f) => f.totpInfo);
    if (!factor)
      throw Error('Bu hesabın ikinci faktörü desteklenmiyor. TOTP doğrulayıcı kullanın.');
    return {
      challengeId: newChallenge(email, {
        pending: result.mfaPendingCredential,
        enrollmentId: factor.mfaEnrollmentId,
        kind: 'totp',
        remember,
      }),
      email,
      method: 'totp',
    };
  }
  async function begin({ email, password, remember = false }) {
    email = String(email || '')
      .trim()
      .toLowerCase();
    if (!email || !password) throw Error('E-posta ve şifre gerekli.');
    limit('login-global', 15);
    limit('login:' + email);
    const r = await api('signInWithPassword', { email, password, returnSecureToken: true });
    if (r.mfaPendingCredential) return pendingMfa(r, email, remember);
    const user = await lookup(r.idToken);
    if (!user.emailVerified) throw Error('Önce e-posta adresinizi doğrulayın.');
    if (hostedService) {
      const remote = await hostedService.startEmail(r.idToken);
      if (typeof remote.challengeId !== 'string') throw Error('Doğrulama başlatılamadı.');
      const id = newChallenge(email, {
        kind: 'hosted-email',
        remoteId: remote.challengeId,
        user,
        token: r.idToken,
        refreshToken: r.refreshToken,
        remember,
      });
      return { challengeId: id, email, method: 'email' };
    }
    const code = String(crypto.randomInt(100000, 1000000));
    const id = newChallenge(email, {
      kind: 'email',
      code,
      user,
      token: r.idToken,
      refreshToken: r.refreshToken,
      remember,
    });
    try {
      await sendMail(email, code);
    } catch (e) {
      challenges.delete(id);
      throw e;
    }
    return { challengeId: id, email, method: 'email' };
  }
  async function finish({ challengeId, code }) {
    limit('verify-global', 20);
    const c = challenges.get(challengeId);
    if (!c || c.expires <= now()) {
      challenges.delete(challengeId);
      throw Error('Kodun süresi doldu.');
    }
    if (--c.remaining < 0) {
      challenges.delete(challengeId);
      throw Error('Deneme sınırı aşıldı.');
    }
    if (c.kind === 'totp') {
      try {
        const r = await mfa('mfaSignIn:finalize', {
          mfaPendingCredential: c.pending,
          mfaEnrollmentId: c.enrollmentId,
          totpVerificationInfo: { verificationCode: String(code) },
        });
        c.token = r.idToken;
        c.refreshToken = r.refreshToken;
        c.user = await lookup(r.idToken);
      } catch (e) {
        if (c.remaining === 0) challenges.delete(challengeId);
        throw e;
      }
    } else if (c.kind === 'hosted-email') {
      try {
        await hostedService.finishEmail(c.remoteId, String(code || ''), c.token);
      } catch (error) {
        if (c.remaining === 0) challenges.delete(challengeId);
        throw error;
      }
    } else {
      const a = Buffer.from(c.code),
        b = Buffer.from(String(code || ''));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        if (c.remaining === 0) challenges.delete(challengeId);
        throw Error('Doğrulama kodu yanlış.');
      }
    }
    challenges.delete(challengeId);
    sessionRevision++;
    current = {
      email: c.email,
      user: c.user,
      token: c.token,
      refreshToken: c.refreshToken,
      remember: c.remember,
      authenticatedAt: now(),
    };
    return profile(current.user);
  }
  async function google(idToken, remember = false) {
    const r = await api('signInWithIdp', {
      postBody: new URLSearchParams({ id_token: idToken, providerId: 'google.com' }).toString(),
      requestUri: 'http://localhost',
      returnSecureToken: true,
    });
    if (r.mfaPendingCredential) return pendingMfa(r, r.email, remember);
    const user = await lookup(r.idToken);
    user.provider = 'google';
    sessionRevision++;
    current = {
      user,
      email: user.email,
      token: r.idToken,
      refreshToken: r.refreshToken,
      remember: remember === true,
      authenticatedAt: now(),
    };
    return { user: profile(user) };
  }
  async function refresh(saved) {
    const revision = sessionRevision;
    const previous = current;
    const token = saved?.refreshToken || current?.refreshToken;
    if (!token) throw Error('Yeniden giriş yapın.');
    const r = await request(
      'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token }).toString(),
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      },
    );
    const value = await r.json();
    if (!r.ok || value.error) throw Error(value.error?.message || 'Oturum yenilenemedi.');
    const user = await lookup(value.id_token);
    if (revision !== sessionRevision)
      throw Error('Oturum değişti; işlemi yeni hesabınızla tekrar deneyin.');
    if (previous && user.localId !== previous.user.localId)
      throw Error('Yenilenen oturum mevcut hesapla eşleşmiyor.');
    if (!user.emailVerified) throw Error('E-posta doğrulanmamış.');
    current = {
      ...previous,
      user,
      email: user.email,
      token: value.id_token,
      refreshToken: value.refresh_token,
      remember: !!(saved || current?.remember),
      authenticatedAt: current?.authenticatedAt || 0,
    };
    return profile(user);
  }
  async function register({ email, password, name }) {
    limit('register', 3);
    if (typeof name !== 'string' || !name.trim() || name.length > 100)
      throw Error('Geçerli bir ad girin.');
    const r = await api('signUp', { email, password, returnSecureToken: true });
    await api('update', { idToken: r.idToken, displayName: name.trim() });
    await api('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: r.idToken });
    return true;
  }
  async function resend({ email, password }) {
    limit('resend', 3);
    const r = await api('signInWithPassword', { email, password, returnSecureToken: true });
    if (r.mfaPendingCredential) throw Error('Bu hesap zaten doğrulanmış.');
    await api('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: r.idToken });
    return true;
  }
  async function remove({ password }) {
    if (!current) throw Error('Hesabı silmek için yeniden giriş yapın.');
    let token = current.token;
    if (current.user.mfaInfo?.length || profile(current.user).provider === 'google') {
      if (now() - current.authenticatedAt > 300000)
        throw Error('Hesabı silmeden önce yeniden giriş yapın.');
    } else {
      limit('delete', 3);
      const r = await api('signInWithPassword', {
        email: current.email,
        password,
        returnSecureToken: true,
      });
      if (r.mfaPendingCredential) throw Error('İkinci faktörle yeniden giriş yapın.');
      token = r.idToken;
    }
    if (cloudSyncEnabled) {
      const response = await request(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/browserSync/${encodeURIComponent(current.user.localId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok && response.status !== 404)
        throw Error('Bulut yer imleri silinemedi; hesap silme durduruldu.');
    }
    await api('delete', { idToken: token });
    sessionRevision++;
    current = null;
    challenges.clear();
    enrollment = null;
    return true;
  }
  async function enrollStart() {
    if (!current) throw Error('Önce giriş yapın.');
    enrollment = null;
    const r = await mfa('mfaEnrollment:start', { idToken: current.token, totpEnrollmentInfo: {} });
    enrollment = { ...r.totpSessionInfo, uid: current.user.localId };
    return {
      secret: enrollment.sharedSecretKey,
      algorithm: enrollment.hashingAlgorithm,
      digits: enrollment.verificationCodeLength,
      period: enrollment.periodSec,
    };
  }
  async function enrollFinish({ code }) {
    if (!current || !enrollment || enrollment.uid !== current.user.localId)
      throw Error('Doğrulayıcı kurulumu bulunamadı.');
    if (!/^\d{6}$/.test(String(code)))
      throw Error('Doğrulayıcı uygulamanızdaki 6 haneli kodu girin.');
    let r;
    try {
      r = await mfa('mfaEnrollment:finalize', {
        idToken: current.token,
        displayName: 'TechBrowser doğrulayıcı',
        totpVerificationInfo: {
          sessionInfo: enrollment.sessionInfo,
          verificationCode: String(code),
        },
      });
    } catch (e) {
      if (/TOO_MANY_ENROLLMENT_ATTEMPTS|INVALID_SESSION_INFO|SESSION_EXPIRED/.test(e.message)) {
        enrollment = null;
        throw Error(
          'Kurulum geçersizleşti. Kapatıp doğrulayıcı kurulumunu yeniden açın; yeni anahtarı telefonunuza ekleyin.',
        );
      }
      if (/INVALID_CODE|INVALID_VERIFICATION_CODE/.test(e.message))
        throw Error(
          'Kod yanlış veya süresi dolmuş. Telefonda otomatik tarih/saat açık olsun; doğrulayıcıdaki yeni kodu girin.',
        );
      throw e;
    }
    sessionRevision++;
    current.token = r.idToken;
    current.refreshToken = r.refreshToken;
    current.user = await lookup(r.idToken);
    enrollment = null;
    return profile(current.user);
  }
  async function sync({ bookmarks }) {
    if (!cloudSyncEnabled)
      throw Error(
        'Firebase bulut senkronizasyonu henüz yapılandırılmadı. FIREBASE-SETUP.md adımlarını uygulayın.',
      );
    if (!current) throw Error('Önce giriş yapın.');
    await refresh();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/browserSync/${encodeURIComponent(current.user.localId)}`;
    const headers = { Authorization: 'Bearer ' + current.token };
    const response = await request(url, {
      headers,
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    let remote = {};
    if (response.status !== 404) {
      remote = await response.json();
      if (!response.ok)
        throw Error(remote.error?.message || 'Bulut senkronizasyonu yapılandırılmamış.');
    }
    let stored;
    try {
      stored = JSON.parse(remote.fields?.bookmarks?.stringValue ?? '[]');
    } catch {
      throw Error('Buluttaki yer imi verisi okunamadı. Mevcut kayıtlar değiştirilmedi.');
    }
    const result = mergeBookmarks(stored, bookmarks ?? []);
    const currentDocument = remote.updateTime
      ? { updateTime: remote.updateTime }
      : { exists: false };
    await json(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
      {
        writes: [
          {
            update: {
              name: `projects/${projectId}/databases/(default)/documents/browserSync/${current.user.localId}`,
              fields: { bookmarks: { stringValue: JSON.stringify(result) } },
            },
            currentDocument,
          },
        ],
      },
      'POST',
      headers,
    );
    return result;
  }
  return {
    async accessToken() {
      if (!current) throw Error('Bu hizmet için giriş yapın.');
      await refresh();
      return current.token;
    },
    begin,
    finish,
    google,
    register,
    resend,
    remove,
    refresh,
    enrollStart,
    enrollFinish,
    sync,
    profile: () => (current ? profile(current.user) : null),
    remembered: () => (current?.remember ? { refreshToken: current.refreshToken } : null),
    logout() {
      sessionRevision++;
      current = null;
      enrollment = null;
      challenges.clear();
    },
    async reset(email) {
      limit('reset', 3);
      await api('sendOobCode', { requestType: 'PASSWORD_RESET', email });
      return true;
    },
  };
}
module.exports = { createAuthService };

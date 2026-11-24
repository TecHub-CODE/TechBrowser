'use strict';
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function createGoogleSignIn({
  clientId,
  clientSecret,
  hostedService,
  openExternal,
  authenticate,
  request = fetch,
}) {
  return async function signIn(remember) {
    if (!clientId || (!hostedService && !clientSecret))
      throw Error('Google ile giriş bu kurulumda henüz yapılandırılmamış.');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('hex');
    return new Promise((resolve, reject) => {
      let server,
        timer,
        processing = false,
        settled = false;
      function finish(error, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server?.close();
        server?.closeIdleConnections();
        if (error) reject(error);
        else resolve(result);
      }
      function listen(port) {
        server = http.createServer(async (req, res) => {
          const url = new URL(req.url, 'http://localhost:' + port);
          if (req.method === 'GET' && url.pathname === '/auth.css') {
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(fs.readFileSync(path.join(__dirname, 'pages/auth.css')));
            return;
          }
          if (req.method !== 'GET' || url.pathname !== '/callback') {
            res.writeHead(404);
            res.end();
            return;
          }
          if (url.searchParams.get('state') !== state) {
            res.writeHead(400);
            res.end('Gecersiz giris yaniti.');
            return;
          }
          if (processing) {
            res.writeHead(409);
            res.end();
            return;
          }
          processing = true;
          clearTimeout(timer);
          let result, error;
          try {
            const code = url.searchParams.get('code');
            if (!code || url.searchParams.has('error')) throw Error('Google girişi iptal edildi.');
            const redirectUri = 'http://localhost:' + port + '/callback';
            let tokens;
            if (hostedService)
              tokens = await hostedService.googleExchange({ code, verifier, redirectUri });
            else {
              const response = await request('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: clientId,
                  client_secret: clientSecret,
                  redirect_uri: redirectUri,
                  grant_type: 'authorization_code',
                  code,
                  code_verifier: verifier,
                }),
                signal: AbortSignal.timeout(20000),
                redirect: 'error',
              });
              if (!response.ok) throw Error('Google girişi doğrulanamadı. Yeniden deneyin.');
              tokens = await response.json();
            }
            if (typeof tokens.id_token !== 'string') throw Error('Google kimlik yanıtı alınamadı.');
            result = await authenticate(tokens.id_token, remember === true);
          } catch (caught) {
            error = caught;
          }
          const message = error
            ? 'Giriş tamamlanamadı. TechBrowser’a dönüp yeniden deneyebilirsiniz.'
            : result.challengeId
              ? 'Google hesabı doğrulandı. TechBrowser’da ikinci doğrulama adımını tamamlayın.'
              : 'Giriş tamamlandı. TechBrowser’a dönebilirsiniz.';
          const template = fs.readFileSync(path.join(__dirname, 'pages/auth-result.html'), 'utf8');
          // Embed static CSS: the loopback listener closes after this response.
          const page = template
            .replace('{{STYLE}}', fs.readFileSync(path.join(__dirname, 'pages/auth.css'), 'utf8'))
            .replace('{{MESSAGE}}', message);
          res.writeHead(error ? 401 : 200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          // Give the browser time to consume the complete result body before
          // closing the one-shot loopback server.
          res.end(page);
          setTimeout(() => finish(error, result), 100);
        });
        server.once('error', (error) => {
          if (error.code === 'EADDRINUSE' && port < 3752) listen(port + 1);
          else finish(Error('Google giriş bağlantısı başlatılamadı.'));
        });
        server.listen(port, '127.0.0.1', async () => {
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: 'http://localhost:' + port + '/callback',
            response_type: 'code',
            scope: 'openid email profile',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            prompt: 'select_account',
          });
          timer = setTimeout(() => finish(Error('Google girişinin süresi doldu.')), 300000);
          try {
            await openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + params);
          } catch (error) {
            console.warn('[GoogleAuth] Sistem tarayıcısı açılamadı:', error?.message || error);
            finish(Error('Sistem tarayıcısı açılamadı.'));
          }
        });
      }
      listen(3742);
    });
  };
}
module.exports = { createGoogleSignIn };

'use strict';

const http = require('node:http');
const https = require('node:https');

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function abortError() {
  const error = Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function nodeFetch(input, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(input);
    } catch (error) {
      reject(error);
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      reject(Error('Only HTTP and HTTPS requests are supported.'));
      return;
    }
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (response) => {
        if (
          options.redirect === 'error' &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          response.resume();
          reject(Error('Redirects are not allowed for this request.'));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(Error('Response is too large.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const payload = Buffer.concat(chunks);
          const text = () => Promise.resolve(payload.toString('utf8'));
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers: response.headers,
            text,
            json: async () => JSON.parse(await text()),
          });
        });
      },
    );

    const onAbort = () => request.destroy(abortError());
    options.signal?.addEventListener('abort', onAbort, { once: true });
    request.once('close', () => options.signal?.removeEventListener('abort', onAbort));
    request.once('error', reject);
    if (options.body !== undefined && options.body !== null) request.write(options.body);
    request.end();
  });
}

function timeoutSignal(milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  timer.unref?.();
  return controller.signal;
}

function installRuntimeCompat() {
  if (typeof globalThis.fetch !== 'function') globalThis.fetch = nodeFetch;
  if (typeof globalThis.AbortSignal?.timeout !== 'function') {
    globalThis.AbortSignal.timeout = timeoutSignal;
  }
}

module.exports = { installRuntimeCompat, nodeFetch, timeoutSignal };

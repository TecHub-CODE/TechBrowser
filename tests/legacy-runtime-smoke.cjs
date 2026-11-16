'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');

async function main() {
  // Electron 22 uses Node 16 and does not expose the Fetch API by default.
  assert.equal(typeof globalThis.fetch, 'undefined');
  const { installRuntimeCompat } = require('../src/runtime-compat');
  installRuntimeCompat();
  assert.equal(typeof globalThis.fetch, 'function');
  assert.equal(typeof globalThis.AbortSignal.timeout, 'function');

  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ready: request.method === 'POST' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`, {
      method: 'POST',
      body: '{}',
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), { ready: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const { createHostedService } = require('../src/hosted-service');
  const hosted = createHostedService({ baseUrl: 'https://api.example.com' });
  assert.equal(typeof hosted.chat, 'function');

  const { createGroq } = require('../src/groq');
  assert.equal(typeof createGroq({ apiKey: '' }), 'function');

  const { importBrowserData } = require('../src/browser-import');
  assert.deepEqual(importBrowserData({ localAppData: '', appData: '' }), {
    bookmarks: [],
    history: [],
    sources: [],
  });

  const result = `PASS legacy runtime and HTTP initialize on Node ${process.versions.node}`;
  if (process.env.TECHBROWSER_LEGACY_SMOKE_RESULT) {
    fs.writeFileSync(process.env.TECHBROWSER_LEGACY_SMOKE_RESULT, result);
  }
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

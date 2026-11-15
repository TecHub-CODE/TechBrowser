const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('vm'),
  fs = require('fs');
const { isEmbeddedGoogleAuthUrl } = require('../src/navigation-policy');

test('Google account sign-in is routed out of embedded Chromium without blocking normal Google pages', () => {
  assert.equal(isEmbeddedGoogleAuthUrl('https://accounts.google.com/v3/signin/identifier'), true);
  assert.equal(
    isEmbeddedGoogleAuthUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=x'),
    true,
  );
  assert.equal(isEmbeddedGoogleAuthUrl('https://accounts.google.com/ServiceLogin'), true);
  assert.equal(isEmbeddedGoogleAuthUrl('https://www.google.com/search?q=test'), false);
  assert.equal(isEmbeddedGoogleAuthUrl('https://accounts.google.com.evil.test/v3/signin'), false);
  assert.equal(isEmbeddedGoogleAuthUrl('http://accounts.google.com/v3/signin'), false);
});
test('search terms beginning with app name or http are searches, not local files', () => {
  const source = require('./renderer-source.cjs').rendererSource();
  const code = source.slice(
    source.indexOf('function doNavigate(raw)'),
    source.indexOf('function showNewTab()'),
  );
  const td = { wv: { src: '' } },
    context = {
      tabData: { 0: td },
      activeTabId: 0,
      cfg: { searchEngine: 'google' },
      SE: { google: { url: 'https://www.google.com/search?q=' } },
      encodeInline: encodeURIComponent,
      isEmbeddedGoogleAuthUrl,
      hideNewTab() {},
      showNewTab() {},
      updateLockIcon() {},
      document: {
        getElementById() {
          return { value: '', textContent: '' };
        },
      },
    };
  vm.createContext(context);
  vm.runInContext(code, context);
  for (const term of ['techbrowser test', 'http nedir', 'merhaba dünya']) {
    context.doNavigate(term);
    assert.equal(td.wv.src, 'https://www.google.com/search?q=' + encodeURIComponent(term));
  }
  context.doNavigate('https://example.com');
  assert.equal(td.wv.src, 'https://example.com');
});

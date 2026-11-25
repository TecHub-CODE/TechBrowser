const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVoiceQuery } = require('../src/voice-query');

test('voice search restores common brand spellings without changing surrounding words', () => {
  for (const [heard, query] of [
    ['yutup', 'YouTube'],
    ['yu tüp videoları', 'YouTube videoları'],
    ['maynkıraft', 'Minecraft'],
    ['mikıraft nasıl indirilir', 'Minecraft nasıl indirilir'],
    ['mine craft modları.', 'Minecraft modları'],
    ['yutupça', 'yutupça'],
    ['yutkunmak ve İstanbul', 'yutkunmak ve İstanbul'],
  ]) assert.equal(normalizeVoiceQuery(heard), query);
});

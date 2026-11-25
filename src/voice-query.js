'use strict';

// Match complete spoken names so corrections cannot change parts of unrelated words.
const spokenNames = [
  ['you\\s*tube|y[uo]\\s*t[uü](?:[bp]|be)', 'YouTube'],
  ['mine\\s*craft|m(?:ay[nm]?|ai[nm]?|[iı][nm]?)\\s*k[iı]?\\s*ra[fv]t', 'Minecraft'],
  ['tik\\s*t[oa]k', 'TikTok'],
  ['spotifay|spotifai|spotify', 'Spotify'],
  ['dis\\s*kord|discord', 'Discord'],
  ['git\\s*h[au]b|git\\s+hap', 'GitHub'],
].map(([aliases, name]) => [
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${aliases})(?![\\p{L}\\p{N}])`, 'giu'),
  name,
]);

function normalizeVoiceQuery(text) {
  let query = text.normalize('NFC').trim().replace(/[.!]+$/u, '');
  for (const [name, canonical] of spokenNames) query = query.replace(name, canonical);
  return query.trim().slice(0, 300);
}

module.exports = { normalizeVoiceQuery };

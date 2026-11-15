'use strict';

function mergeBookmarks(remote, local) {
  if (!Array.isArray(remote) || !Array.isArray(local))
    throw Error('Yer imi verisi okunamadı. Mevcut kayıtlar değiştirilmedi.');
  const merged = new Map();
  for (const item of [...remote, ...local]) {
    if (!item || typeof item.url !== 'string') continue;
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
    } catch {
      continue;
    }
    merged.set(item.url, { url: item.url, title: String(item.title || item.url).slice(0, 200) });
  }
  if (merged.size > 200)
    throw Error('Bulut eşitlemesi en fazla 200 yer imini destekler. Hiçbir yer imi silinmedi.');
  const result = [...merged.values()];
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 131072)
    throw Error('Yer imleri bulut boyut sınırını aşıyor. Mevcut kayıtlar değiştirilmedi.');
  return result;
}

module.exports = { mergeBookmarks };

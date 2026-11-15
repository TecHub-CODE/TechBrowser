'use strict';
// A small auditable blocklist, not a claim to block every ad on the web.
const AD_HOSTS = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adnxs.com',
  'adsrvr.org',
  'taboola.com',
  'outbrain.com',
  'amazon-adsystem.com',
  'scorecardresearch.com',
  'criteo.com',
]);
function shouldBlock(url, enabled, type) {
  if (!enabled || type === 'mainFrame') return false;
  try {
    let host = new URL(url).hostname;
    return [...AD_HOSTS].some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}
module.exports = { shouldBlock };

'use strict';

function isEmbeddedGoogleAuthUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') return false;
    return (
      /^\/(?:v\d+\/)?signin(?:\/|$)/i.test(url.pathname) ||
      /^\/o\/oauth2(?:\/|$)/i.test(url.pathname) ||
      /^\/(?:ServiceLogin|AccountChooser)(?:\/|$)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

module.exports = { isEmbeddedGoogleAuthUrl };

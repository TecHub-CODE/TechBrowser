'use strict';

const PARTITIONS = [
  'persist:yandex',
  'persist:default',
  'persist:google',
  'persist:youtube',
  'incognito',
];

function browserSessions(session) {
  return [session.defaultSession, ...PARTITIONS.map((name) => session.fromPartition(name))];
}

function installPermissions(targetSession, getWindow, dialog, getSettings = () => ({})) {
  const notificationOrigins = new Set();
  const ownClipboard = (contents, permission, url) => {
    const win = getWindow();
    return (
      permission === 'clipboard-sanitized-write' &&
      !!win &&
      contents === win.webContents &&
      url === win.webContents.getURL()
    );
  };
  // Checks never grant device access implicitly; requests must obtain consent.
  targetSession.setPermissionCheckHandler((contents, permission, origin, details = {}) => {
    if (ownClipboard(contents, permission, details.requestingUrl || origin)) return true;
    if (permission !== 'notifications' || getSettings().notifications !== true) return false;
    try {
      return notificationOrigins.has(new URL(details.requestingUrl || origin).origin);
    } catch {
      return false;
    }
  });
  targetSession.setPermissionRequestHandler(
    async (contents, permission, callback, details = {}) => {
      if (ownClipboard(contents, permission, details.requestingUrl)) return callback(true);
      if (permission === 'notifications' && getSettings().notifications !== true)
        return callback(false);
      const labels = {
        notifications: 'Bildirim gönderme',
        media: 'Kamera / mikrofon',
        midi: 'MIDI',
        midiSysex: 'MIDI sistem',
        fullscreen: 'Tam ekran',
        pointerLock: 'Fare kilidi',
        'clipboard-read': 'Panoyu okuma',
      };
      if (!labels[permission] || !contents || contents.isDestroyed()) return callback(false);
      let origin;
      try {
        const url = new URL(details.securityOrigin || details.requestingUrl);
        if (!['https:', 'http:'].includes(url.protocol)) return callback(false);
        origin = url.origin;
      } catch {
        return callback(false);
      }
      const label =
        permission === 'media'
          ? (details.mediaTypes || ['video', 'audio'])
              .map((type) => (type === 'video' ? 'Kamera' : 'Mikrofon'))
              .join(' / ')
          : labels[permission];
      const initialUrl = contents.getURL();
      try {
        const win = getWindow();
        if (!win || win.isDestroyed()) return callback(false);
        const { response } = await dialog.showMessageBox(win, {
          type: 'question',
          buttons: ['İzin Ver', 'Reddet'],
          defaultId: 1,
          cancelId: 1,
          title: 'İzin İsteği',
          message: `"${origin}" sitesi ${label} erişimi istiyor.`,
        });
        const allowed =
          response === 0 &&
          !contents.isDestroyed() &&
          contents.getURL() === initialUrl &&
          (permission !== 'notifications' || getSettings().notifications === true);
        if (allowed && permission === 'media') contents.__capturePermissionGranted = true;
        if (allowed && permission === 'notifications') notificationOrigins.add(origin);
        callback(allowed);
      } catch {
        callback(false);
      }
    },
  );
}

async function setBrowserProxy(session, config) {
  const sessions = browserSessions(session);
  const previous = session.__browserProxy || { mode: 'direct' };
  const results = await Promise.allSettled(sessions.map((s) => s.setProxy(config)));
  if (results.some((r) => r.status === 'rejected')) {
    await Promise.all(sessions.map((s) => s.setProxy(previous)));
    await Promise.all(sessions.map((s) => s.closeAllConnections()));
    throw new Error('Proxy ayarı uygulanamadı; önceki bağlantı geri yüklendi.');
  }
  // Existing pooled connections must not keep using the previous route.
  await Promise.all(sessions.map((s) => s.closeAllConnections()));
  session.__browserProxy = config;
}

module.exports = { browserSessions, installPermissions, setBrowserProxy };

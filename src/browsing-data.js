'use strict';

// The default session also contains the file:// application UI. Preserve that
// origin when removing websites, including data created by older app versions.
async function clearBrowsingData(session, appUrl) {
  const sessions = [
    session.defaultSession,
    ...['persist:yandex', 'persist:default', 'persist:google', 'persist:youtube'].map((partition) =>
      session.fromPartition(partition),
    ),
  ];
  const results = await Promise.allSettled(
    sessions.map(async (target) => {
      await target.clearData({
        excludeOrigins: [appUrl],
        originMatchingMode: 'origin-in-all-contexts',
      });
      await target.clearAuthCache();
    }),
  );
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Bazı site verileri temizlenemedi. Yeniden deneyin.');
  }
}

module.exports = { clearBrowsingData };

'use strict';
function summarizeMemory(metrics) {
  const windowsPrivate =
    metrics.length > 0 && metrics.every((m) => Number.isFinite(m.memory?.privateBytes));
  const key = windowsPrivate ? 'privateBytes' : 'workingSetSize';
  const total = metrics.reduce((sum, m) => sum + (m.memory?.[key] || 0), 0);
  return {
    usedMB: Math.round(total / 1024),
    metric: windowsPrivate ? 'private' : 'working-set',
    processCount: metrics.length,
    workingSetMB: Math.round(
      metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize || 0), 0) / 1024,
    ),
  };
}
module.exports = { summarizeMemory };

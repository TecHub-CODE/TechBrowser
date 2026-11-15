const { test } = require('node:test');
const assert = require('node:assert/strict');
test('AI day rolls over at Türkiye midnight', async () => {
  const { quotaDay } = await import('../cloudflare/ai-quota.mjs');
  const before = quotaDay(Date.parse('2026-11-09T20:59:59Z'));
  const after = quotaDay(Date.parse('2026-11-09T21:00:00Z'));
  assert.equal(after.day, before.day + 1);
  assert.equal(before.resetsAt, Date.parse('2026-11-09T21:00:00Z'));
});
test('failed AI requests refund reservations, successful replies consume them', async () => {
  const { withDailyQuota } = await import('../cloudflare/ai-quota.mjs');
  const settled = [];
  const env = {
    AI_QUOTAS: {
      idFromName: (x) => x,
      get: () => ({
        fetch: async (url, opts) => {
          if (url.endsWith('/reserve')) return Response.json({ reservation: 'ticket', day: 1 });
          settled.push(JSON.parse(opts.body));
          return Response.json({ success: true });
        },
      }),
    },
  };
  await withDailyQuota(env, 'owner', async () => Response.json({ reply: 'ok' }));
  await withDailyQuota(env, 'owner', async () => Response.json({ error: 'bad' }, { status: 502 }));
  await assert.rejects(
    withDailyQuota(env, 'owner', async () => {
      throw Error('network');
    }),
  );
  assert.deepEqual(
    settled.map((x) => x.success),
    [true, false, false],
  );
  let called = false;
  env.AI_QUOTAS.get = () => ({
    fetch: async () => Response.json({ error: 'DAILY_QUOTA_REACHED' }, { status: 429 }),
  });
  assert.equal(
    (
      await withDailyQuota(env, 'owner', async () => {
        called = true;
      })
    ).status,
    429,
  );
  assert.equal(called, false);
});

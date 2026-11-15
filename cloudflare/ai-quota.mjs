// One globally consistent counter per verified Firebase UID; no chat text is stored.
export const DAILY_LIMIT = 50;
const DAY = 86400000;
const OFFSET = 3 * 3600000; // Türkiye: UTC+03:00, reset at local midnight.
export function quotaDay(now = Date.now()) {
  const day = Math.floor((now + OFFSET) / DAY);
  return { day, resetsAt: (day + 1) * DAY - OFFSET };
}
export class AiQuota {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const route = new URL(request.url).pathname;
    if (!['/reserve', '/settle'].includes(route)) return new Response(null, { status: 404 });
    const body = await request.json();
    const current = quotaDay();
    const result = await this.state.storage.transaction(async (tx) => {
      let record = await tx.get('quota');
      if (!record || record.day !== current.day)
        record = { day: current.day, used: 0, pending: [] };
      if (route === '/reserve') {
        if (record.used >= DAILY_LIMIT)
          return { error: 'DAILY_QUOTA_REACHED', resetsAt: current.resetsAt };
        const reservation = crypto.randomUUID();
        record.used++;
        record.pending.push(reservation);
        await tx.put('quota', record);
        return { reservation, day: current.day };
      }
      // A duplicate settlement or a late response from yesterday cannot refund today's quota.
      const index = record.pending.indexOf(body.reservation);
      if (body.day === record.day && index !== -1) {
        record.pending.splice(index, 1);
        if (body.success === false) record.used--;
        await tx.put('quota', record);
      }
      return { success: true };
    });
    return Response.json(result, { status: result.error ? 429 : 200 });
  }
}
export async function withDailyQuota(env, uid, operation) {
  const stub = env.AI_QUOTAS.get(env.AI_QUOTAS.idFromName(uid));
  const reserved = await stub.fetch('https://quota/reserve', { method: 'POST', body: '{}' });
  const ticket = await reserved.json();
  if (!reserved.ok)
    return Response.json(ticket, {
      status: reserved.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  let success = false;
  try {
    const result = await operation();
    success = result.ok;
    return result;
  } finally {
    // On an ambiguous storage/network failure retain the reservation, never exceed the cap.
    try {
      await stub.fetch('https://quota/settle', {
        method: 'POST',
        body: JSON.stringify({ ...ticket, success }),
      });
    } catch {
      /* A lost settlement is conservatively counted until midnight. */
    }
  }
}

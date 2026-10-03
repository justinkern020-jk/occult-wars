/**
 * /api/ranked — the live-table ladder.
 *   GET  ?op=board            → { season, rows: [{ name, pts, w, l, rank }] }
 *   GET  ?op=me               → { season, me }                    (signed in)
 *   POST { op: 'begin', nonce }                                    (signed in)
 *   POST { op: 'report', nonce, sitting, won }                     (signed in)
 * Needs the durable store; on instance memory the ladder stays shut.
 */
import { getStore } from '../_lib/store.js';
import { HttpError, fail, json, readJson } from '../_lib/http.js';
import { tokenFrom, userForToken } from '../_lib/accounts.js';
import {
  RankedError,
  beginSitting,
  cleanNonce,
  cleanSitting,
  readBoard,
  readMine,
  reportSitting,
  seasonOf,
} from '../_lib/ranked.js';

export async function handleRanked(req: Request, now = Date.now()): Promise<Response> {
  try {
    const store = getStore();
    if (!store.durable && process.env.OW_ALLOW_MEMORY_ACCOUNTS !== '1') {
      return json({ ok: false, shut: true, error: 'The ladder is shut until the ledger store is connected.' }, req.method === 'GET' ? 200 : 503);
    }
    if (req.method === 'GET') {
      const op = new URL(req.url).searchParams.get('op') ?? 'board';
      if (op === 'board') return json({ ok: true, ...(await readBoard(store, now)) });
      if (op === 'me') {
        const user = await userForToken(store, tokenFrom(req));
        if (!user) return json({ ok: true, season: seasonOf(now), me: null });
        return json({ ok: true, season: seasonOf(now), me: await readMine(store, user, now) });
      }
      throw new HttpError(400, 'Unknown op.');
    }
    if (req.method !== 'POST') throw new HttpError(405, 'GET or POST.');
    const body = await readJson(req, 4_000);
    const user = await userForToken(store, tokenFrom(req));
    if (!user) throw new RankedError(401, 'Take a seat in the Ledger to climb the ladder.');
    const op = String(body.op ?? '');
    if (op === 'begin') {
      await beginSitting(store, user, cleanNonce(body.nonce), now);
      return json({ ok: true });
    }
    if (op === 'report') {
      const r = await reportSitting(
        store,
        user,
        { nonce: cleanNonce(body.nonce), sitting: cleanSitting(body.sitting), won: body.won === true },
        now,
      );
      return json({ ok: true, ...r });
    }
    throw new HttpError(400, 'Unknown op.');
  } catch (err) {
    if (err instanceof RankedError) return json({ ok: false, error: err.message }, err.status);
    return fail(err);
  }
}

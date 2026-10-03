/**
 * /api/patron — redeem a patron code (anyone).
 *   POST { op: 'redeem', code } → { ok, code } | 400
 * The owner mints, lists and revokes codes through the Portal (/api/watch).
 */
import { getStore } from '../_lib/store.js';
import { HttpError, fail, json, readJson } from '../_lib/http.js';
import { PatronError, redeemCode } from '../_lib/patron.js';

export async function handlePatron(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST.');
    const body = await readJson(req, 1_000);
    if (String(body.op ?? '') !== 'redeem') throw new HttpError(400, 'Unknown op.');
    const code = await redeemCode(getStore(), body.code);
    return json({ ok: true, code });
  } catch (err) {
    if (err instanceof PatronError) return json({ ok: false, error: err.message }, err.status);
    return fail(err);
  }
}

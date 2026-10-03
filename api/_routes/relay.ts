/**
 * POST /api/relay — the server-carried Friend Working channel (when WebRTC
 * cannot open) and the Quick Match queue.
 *   { op: 'host', room, hid }               → { ok } | { ok:false, taken }
 *   { op: 'leave', room, hid }
 *   { op: 'push', room, box, items }        → { ok, n } | { ok:false, nohost }
 *   { op: 'pull', room, box, from, hid? }   → { ok, items, next }
 *   { op: 'quick', gid }                    → { ok, role, room }
 *   { op: 'quickbeat' | 'quickagain', room, hid } / { op: 'quickcancel', room }
 */
import { getStore } from '../_lib/store.js';
import { HttpError, fail, json, readJson } from '../_lib/http.js';
import {
  ITEM_MAX,
  RelayError,
  hostRoom,
  leaveRoom,
  pullItems,
  pushItems,
  quickBeat,
  quickCancel,
  quickMatch,
  quickRequeue,
} from '../_lib/relay.js';

export async function handleRelay(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const body = await readJson(req, ITEM_MAX + 50_000);
    const store = getStore();
    const op = String(body.op ?? '');
    switch (op) {
      case 'host':
        return json(await hostRoom(store, body.room, body.hid));
      case 'leave':
        return json(await leaveRoom(store, body.room, body.hid));
      case 'push':
        return json(await pushItems(store, body.room, body.box, body.items));
      case 'pull':
        return json(await pullItems(store, body.room, body.box, body.from, body.hid));
      case 'quick':
        return json(await quickMatch(store, body.gid));
      case 'quickbeat':
        return json(await quickBeat(store, body.room, body.hid));
      case 'quickagain':
        return json(await quickRequeue(store, body.room, body.hid));
      case 'quickcancel':
        return json(await quickCancel(store, body.room));
      default:
        throw new HttpError(400, 'Unknown op.');
    }
  } catch (err) {
    if (err instanceof RelayError) return json({ ok: false, error: err.message }, err.status);
    return fail(err);
  }
}

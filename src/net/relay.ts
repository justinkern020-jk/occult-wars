/**
 * Client for /api/relay — the server-carried Friend Working channel used when
 * WebRTC cannot open, plus the Quick Match queue. Polling only (works through
 * any proxy or firewall that lets the site itself load).
 */

const ENDPOINT = '/api/relay';

export type RelayEnvelope =
  | { k: 'syn'; gid: string }
  | { k: 'ack'; gid: string }
  | { k: 'msg'; gid: string; m: unknown }
  | { k: 'bye'; gid: string };

type Fetcher = typeof fetch;
let fetcher: Fetcher | null = null;
let base = '';

/** Tests: route relay calls to an in-process handler. */
export function setRelayFetchForTests(f: Fetcher | null, url = ''): void {
  fetcher = f;
  base = url;
}

export function relayId(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One relay call; null when the relay cannot be reached at all. */
export async function relayCall<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<(T & { ok?: boolean; error?: string }) | null> {
  try {
    const f = fetcher ?? fetch;
    const res = await f(`${base}${ENDPOINT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: body.op === 'leave' || body.op === 'quickcancel',
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null;
    return (await res.json()) as T & { ok?: boolean };
  } catch {
    return null;
  }
}

export type Inbox = {
  /** Start or resume polling. */
  start: () => void;
  stop: () => void;
  /** Poll quickly for a while (a link is live and moves are flowing). */
  setPace: (pace: 'link' | 'wait' | 'idle') => void;
};

const PACE_MS = { link: 450, wait: 1000, idle: 2500 } as const;

/** Poll one inbox in order, handing each envelope to onItem. */
export function pollInbox(
  room: string,
  box: string,
  onItem: (env: RelayEnvelope) => void,
  opts: { hid?: string; onLost?: () => void } = {},
): Inbox {
  let from = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let busy = false;
  let pace: keyof typeof PACE_MS = 'wait';
  let quietSince = Date.now();

  const schedule = (ms: number) => {
    if (!running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, ms);
  };

  async function tick() {
    timer = null;
    if (!running || busy) return;
    busy = true;
    const r = await relayCall<{ items?: unknown[]; next?: number; lost?: boolean }>({
      op: 'pull',
      room,
      box,
      from,
      ...(opts.hid ? { hid: opts.hid } : {}),
    });
    busy = false;
    if (!running) return;
    if (!r || r.ok === false) {
      schedule(2500);
      return;
    }
    if (r.lost) opts.onLost?.();
    const items = Array.isArray(r.items) ? r.items : [];
    if (typeof r.next === 'number' && r.next >= from) from = r.next;
    for (const it of items) {
      if (it && typeof it === 'object' && typeof (it as RelayEnvelope).k === 'string') {
        try {
          onItem(it as RelayEnvelope);
        } catch {
          /* a bad handler never stops the inbox */
        }
      }
    }
    if (items.length > 0) quietSince = Date.now();
    const quiet = Date.now() - quietSince;
    // Full page: read on at once. A link that has gone quiet slows down.
    const ms =
      items.length >= 40
        ? 0
        : pace === 'link'
          ? quiet > 20_000
            ? 1200
            : PACE_MS.link
          : PACE_MS[pace];
    schedule(ms);
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule(0);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    setPace(p) {
      pace = p;
      if (p === 'link') quietSince = Date.now();
      if (running && !busy) schedule(0);
    },
  };
}

/** Batches envelopes for one inbox (one request per burst, in order). */
export function outbox(room: string, box: string, onFail?: (why: string) => void) {
  let pending: RelayEnvelope[] = [];
  let sending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    timer = null;
    if (sending || pending.length === 0) return;
    sending = true;
    const batch = pending.splice(0, 20);
    let tries = 0;
    for (;;) {
      const r = await relayCall<{ nohost?: boolean }>({ op: 'push', room, box, items: batch });
      if (r && r.ok) break;
      if (r && r.nohost) {
        onFail?.('nohost');
        break;
      }
      tries += 1;
      if (tries >= 6) {
        onFail?.(r?.error ?? 'unreachable');
        break;
      }
      await new Promise((res) => setTimeout(res, 400 * tries));
    }
    sending = false;
    if (pending.length) void flush();
  }

  return {
    send(env: RelayEnvelope) {
      pending.push(env);
      if (!timer && !sending) timer = setTimeout(() => void flush(), 30);
    },
    /** Send now (e.g. a goodbye on the way out). */
    async now(env: RelayEnvelope) {
      return relayCall<{ nohost?: boolean }>({ op: 'push', room, box, items: [env] });
    },
  };
}

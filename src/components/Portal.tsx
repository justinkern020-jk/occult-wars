import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAPS, mapById, tileLabel } from '../game/maps';
import { PORTAL_CODE_LABEL, portalCodeFor } from '../game/portalCodes';
import { readSeatToken } from '../net/account';
import {
  OWNER_KEY_STORAGE,
  portalOpen,
  normalizeFrame,
  readAccounts,
  readWho,
  sendPortalCode,
  type AccountLine,
  viewMatch,
  type HandLine,
  type MatchFrame,
  type MatchSummary,
} from '../net/watch';
import { countryName } from '../net/table';
import { UnitCoin, type BoardUnit } from './UnitCoin';

const SIDE_NAME = { blue: 'Azure', red: 'Crimson' } as const;
const ERA_NAME: Record<string, string> = {
  first: 'First Hour',
  second: 'Second Hour',
  old: 'Sealed Century',
};
const MODE_NAME: Record<string, string> = {
  friend: 'Against a friend',
  hotseat: 'Pass the Grimoire',
  training: 'Training rite',
  campaign: 'The Leaden Hour',
  second: 'Second Hour yard',
  old: 'Sealed Century',
};
/** Every mode but a friend match is practice. */
const PRACTICE = new Set(['hotseat', 'training', 'campaign', 'second', 'old']);

function hasOwnerProof(): boolean {
  try {
    return !!readSeatToken() || !!localStorage.getItem(OWNER_KEY_STORAGE);
  } catch {
    return false;
  }
}

function RuneRing({ small }: { small?: boolean }) {
  // Planetary glyphs: present in the common system symbol fonts (runes are not).
  const runes = '☉ ✧ ☽ ✦ ☿ ✧ ♀ ✦ ♂ ✧ ♃ ✦ ♄ ✧ ';
  return (
    <div className={`portal-ring${small ? ' portal-ring-small' : ''}`} aria-hidden>
      <div className="portal-ring-glow" />
      <svg className="portal-ring-runes" viewBox="0 0 200 200">
        <defs>
          <path id="portal-rune-path" d="M100,100 m-84,0 a84,84 0 1,1 168,0 a84,84 0 1,1 -168,0" />
        </defs>
        <circle cx="100" cy="100" r="92" fill="none" stroke="#c6a15b88" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="76" fill="none" stroke="#c6a15b55" strokeWidth="0.8" />
        <text fill="#e3c98a" fontSize="11" letterSpacing="2.4">
          <textPath href="#portal-rune-path">{runes + runes}</textPath>
        </text>
      </svg>
      <div className="portal-ring-void" />
    </div>
  );
}

const VS_AI: Record<string, string> = {
  training: 'Practice vs AI (training)',
  campaign: 'Practice vs AI (The Leaden Hour)',
  second: 'Practice vs AI (Second Hour yard)',
  old: 'Practice vs AI (Sealed Century)',
};
const SCREEN_NAME: Record<string, string> = {
  title: 'At the title',
  menu: 'Menu',
  allegiance: 'Swearing an order',
  archive: 'Collection',
  deck: 'Deck editor',
  pack: 'Opening packs',
  campaign: 'The Leaden Hour (choosing a stage)',
  friend: 'Friend Working (finding a friend)',
  second: 'Second Hour (in the yard)',
  old: 'Sealed Century (choosing a map)',
  shop: 'Shop',
  ledger: 'Ledger',
  meeting: 'Occultist Meeting',
  sandbox: 'Sandbox',
};

export function activityLine(h: HandLine): string {
  if (!h.known) return 'On an older page (cannot say)';
  if (h.where !== 'field') return SCREEN_NAME[h.where] ?? h.where;
  const era = ERA_NAME[h.era] ?? '';
  const what =
    h.mode === 'friend'
      ? 'Friend match'
      : h.mode === 'hotseat'
        ? 'Pass the Grimoire (one board)'
        : (VS_AI[h.mode] ?? 'On a field');
  return [what, era, h.map].filter(Boolean).join(' · ');
}

export function onlineFor(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** A seat date in the reader's own time, e.g. "Oct 3, 2026, 8:41 AM". */
export function seatDate(ms: number): string {
  if (!ms) return 'at an unknown hour';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The owner's door in the battle count. Renders nothing for anyone else. */
export function PortalDoor() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [hands, setHands] = useState<HandLine[] | null>(null);
  const [build, setBuild] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [accounts, setAccounts] = useState<{ accounts: AccountLine[]; truncated: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void readAccounts().then((r) => {
      if (alive && r) setAccounts(r);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!hasOwnerProof()) return;
    let alive = true;
    void portalOpen().then((ok) => {
      if (alive) setOpen(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open || watching) return;
    let alive = true;
    const read = () =>
      void readWho().then((r) => {
        if (!alive || !r) return;
        setMatches(r.matches);
        setHands(r.hands);
        setBuild(r.build);
        setNow(Date.now());
      });
    read();
    const t = window.setInterval(read, 4_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [open, watching]);

  if (!open) return null;
  return (
    <section className="portal-door" data-testid="portal-door">
      <RuneRing small />
      <h2>The Portal</h2>
      <p className="portal-door-lede">Fields burning right now. Step through to watch unseen.</p>
      {matches == null ? (
        <p className="portal-quiet">Reading the fields…</p>
      ) : matches.length === 0 ? (
        <p className="portal-quiet" data-testid="portal-empty">
          No field is burning right now.
        </p>
      ) : (
        <ol className="portal-list" data-testid="portal-list">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="portal-match"
                data-testid="portal-match"
                data-match-id={m.id}
                onClick={() => setWatching(m.id)}
              >
                <span className="portal-match-names">
                  <b className="portal-blue">{m.blue.name}</b>
                  <i> against </i>
                  <b className="portal-red">{m.red.name}</b>
                </span>
                <span className="portal-match-meta">
                  {PRACTICE.has(m.mode) ? 'Practice' : 'Live table'} · {MODE_NAME[m.mode] ?? m.mode} ·{' '}
                  {ERA_NAME[m.era] ?? m.era} · Turn {m.turn}
                  {m.over ? ' · ended' : ''}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <h3 className="portal-roll-title">Hands at the table</h3>
      {hands == null ? null : hands.length === 0 ? (
        <p className="portal-quiet">No one is at the table.</p>
      ) : (
        <ol className="portal-roll" data-testid="portal-roll">
          {hands.map((h) => {
            const live = h.match && matches?.some((m) => m.id === h.match && !m.over) ? h.match : '';
            const oldBuild = !!(h.known && build && h.build !== build);
            return (
              <li key={h.id} className="portal-hand" data-testid="portal-hand" data-where={h.where} data-mode={h.mode}>
                <span className="portal-hand-name">
                  <b>{h.name || (h.known ? 'Unnamed hand' : 'Unknown hand')}</b>
                  {h.known && <i className="portal-hand-badge">{h.seat ? 'account' : 'guest'}</i>}
                </span>
                <span className="portal-hand-meta">
                  {h.country ? countryName(h.country) : 'Unknown land'} · online {onlineFor(now - h.since)}
                </span>
                <span className="portal-hand-where" data-testid="portal-hand-where">
                  {activityLine(h)}
                  {oldBuild ? ' · older build (refreshes at the menu)' : ''}
                </span>
                {live && (
                  <button
                    type="button"
                    className="brass-btn portal-hand-watch"
                    data-testid="portal-hand-watch"
                    onClick={() => setWatching(live)}
                  >
                    Watch
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <h3 className="portal-roll-title" data-testid="portal-accounts-title">
        Accounts{accounts ? ` (${accounts.accounts.length}${accounts.truncated ? '+' : ''})` : ''}
      </h3>
      {accounts == null ? (
        <p className="portal-quiet">Reading the book of names…</p>
      ) : accounts.accounts.length === 0 ? (
        <p className="portal-quiet">No one has taken a name yet.</p>
      ) : (
        <ol className="portal-roll" data-testid="portal-accounts">
          {accounts.accounts.map((a) => (
            <li key={a.username} className="portal-hand" data-testid="portal-account">
              <span className="portal-hand-name">
                <b>{a.username}</b>
              </span>
              <span className="portal-hand-meta">
                Seated {seatDate(a.createdAt)}
                {a.lastSignInAt ? ` · last in ${seatDate(a.lastSignInAt)}` : ''}
                {a.country ? ` · ${countryName(a.country)}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      {watching &&
        createPortal(
          <PortalView matchId={watching} onLeave={() => setWatching(null)} />,
          document.body,
        )}
    </section>
  );
}

function asUnit(u: NonNullable<MatchFrame['board'][number][number]>): BoardUnit {
  return { ...u } as BoardUnit;
}



/** Full-screen, read-only view of one live match, with the code prompt. */
export function PortalView({ matchId, onLeave }: { matchId: string; onLeave: () => void }) {
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [frame, setFrame] = useState<MatchFrame | null>(null);
  const [frameAt, setFrameAt] = useState(0);
  const [gone, setGone] = useState(false);
  const [code, setCode] = useState('');
  const [target, setTarget] = useState<'blue' | 'red'>('blue');
  const [note, setNote] = useState<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let alive = true;
    let misses = 0;
    const read = () =>
      void viewMatch(matchId).then((r) => {
        if (!alive) return;
        if (!r || !r.summary) {
          misses++;
          if (misses >= 3) setGone(true);
          return;
        }
        misses = 0;
        setGone(false);
        setSummary(r.summary);
        const f = normalizeFrame(r.frame);
        if (f) {
          setFrame(f);
          setFrameAt(Number((r.summary as { at?: number }).at) || Date.now());
        }
      });
    read();
    const t = window.setInterval(read, 1_500);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [matchId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onLeave]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [frame?.log]);

  const mapId = frame?.map;
  const mapName = summary?.map;
  const map = useMemo(() => {
    if (mapId && MAPS.some((m) => m.id === mapId)) return mapById(mapId);
    // An older or odd frame: find the field by its name, else the first field.
    return MAPS.find((m) => m.name === mapName) ?? (mapId || mapName ? MAPS[0] : null);
  }, [mapId, mapName]);

  async function onCode(raw: string) {
    const next = raw.slice(0, 32);
    setCode(next);
    const hit = portalCodeFor(next);
    if (!hit) return;
    setCode('');
    const who = summary ? summary[target].name : SIDE_NAME[target];
    setNote(`Sending ${PORTAL_CODE_LABEL[hit]} to ${who}…`);
    const ok = await sendPortalCode(matchId, target, hit);
    setNote(
      ok
        ? `Through the portal: ${PORTAL_CODE_LABEL[hit]} reaches ${who} (${SIDE_NAME[target]}).`
        : 'The portal would not carry it. The field may have closed.',
    );
  }

  const live = frame ?? null;
  return (
    <div className="portal-view" data-testid="portal-view" role="dialog" aria-modal="true" aria-label="The Portal">
      <div className="portal-view-sky" aria-hidden />
      <RuneRing />
      <div className="portal-view-inner">
        <header className="portal-view-head">
          <p className="plate-kicker">Beyond the portal · unseen</p>
          {summary ? (
            <h1 data-testid="portal-view-title">
              <span className="portal-blue">{summary.blue.name}</span>
              <i> against </i>
              <span className="portal-red">{summary.red.name}</span>
            </h1>
          ) : (
            <h1>Opening the portal…</h1>
          )}
          {summary && (
            <p className="portal-view-meta" data-testid="portal-view-meta">
              {ERA_NAME[summary.era] ?? summary.era} · {summary.map} · Turn {live?.turn ?? summary.turn} ·{' '}
              {SIDE_NAME[live?.side ?? summary.side]} to act · {live?.phase ?? summary.phase}
              {live?.over ? ` · ${SIDE_NAME[live.over.winner]} has won` : ''}
            </p>
          )}
          {live && (
            <p className="portal-quiet portal-view-fresh" data-testid="portal-view-fresh">
              {live.board.flat().filter(Boolean).length} on the field · board as of{' '}
              {Math.max(0, Math.round((Date.now() - frameAt) / 1000))} s ago
            </p>
          )}
          {gone && <p className="portal-quiet">The field has gone dark.</p>}
        </header>

        <div className="portal-view-body">
          <div className="portal-view-field">
            {live && map ? (
              <div className="bf-board-socket portal-board" data-testid="portal-board">
                <img
                  className="bf-board-socket-frame"
                  src="/assets/images/bf_board_frame.png"
                  alt=""
                  aria-hidden
                  draggable={false}
                />
                <div
                  className={`board-wrap${map.mood === 'bright' ? ' mood-bright' : ''}`}
                  style={{ backgroundImage: `url(/assets/maps/${map.id}.jpg)` }}
                >
                  <div className="board-grid" role="grid" aria-readonly>
                    {map.tiles.map((row, r) =>
                      row.map((tile, c) => {
                        const unit = live.board[r]?.[c] ?? null;
                        if (tile.kind === 'void' && !unit) {
                          return <div key={`${r}-${c}`} className="tile-void" aria-hidden />;
                        }
                        const owned = live.control[r]?.[c] ?? null;
                        return (
                          <div
                            key={`${r}-${c}`}
                            className={`stone tile-${tile.kind} ${
                              tile.kind === 'resource' && tile.symbols === 2 ? 'tile-resource-2' : ''
                            } ${owned ? `owned-${owned} held-${owned}` : ''} ${unit ? 'has-unit' : ''}`.trim()}
                          >
                            {tile.kind === 'gate' && (
                              <span className={`tile-mark gate-mark gate-${tile.home ?? 'neutral'}${unit ? ' mark-under' : ''}`} aria-hidden />
                            )}
                            {tile.kind === 'stronghold' && (
                              <span className={`tile-mark stronghold-mark stronghold-${tile.home ?? 'neutral'}${unit ? ' mark-under' : ''}`} aria-hidden />
                            )}
                            {tile.kind === 'resource' && (
                              <span className={`tile-mark resource-mark resource-${tile.symbols === 2 ? 'double' : 'single'}${unit ? ' mark-under' : ''}`} aria-hidden />
                            )}
                            {tileLabel(tile) ? <span className="cell-label">{tileLabel(tile)}</span> : null}
                            {unit && <UnitCoin unit={asUnit(unit)} foe={unit.side === 'red'} />}
                          </div>
                        );
                      }),
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="portal-quiet portal-wait">The mist is parting…</p>
            )}
          </div>

          <aside className="portal-view-side">
            {live && (
              <dl className="portal-tally" data-testid="portal-tally">
                {(['blue', 'red'] as const).map((s) => (
                  <div key={s} className={`portal-tally-${s}`}>
                    <dt>{summary ? summary[s].name : SIDE_NAME[s]}</dt>
                    <dd>
                      Domination {live.domination[s]} · Resources {live.resources[s]} · Hand{' '}
                      {live.hand[s]} · Deck {live.deck[s]}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <ol className="portal-log" ref={logRef} data-testid="portal-log">
              {(live?.log ?? []).map((line, i) => (
                <li key={`${i}-${line.slice(0, 12)}`}>{line}</li>
              ))}
            </ol>

            <div className="portal-code" data-testid="portal-code">
              <p className="portal-code-title">Speak a code through the portal</p>
              <div className="portal-code-sides" role="radiogroup" aria-label="Who receives it">
                {(['blue', 'red'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={target === s}
                    data-testid={`portal-side-${s}`}
                    className={`portal-side portal-side-${s}${target === s ? ' is-on' : ''}`}
                    onClick={() => setTarget(s)}
                  >
                    {summary ? summary[s].name : SIDE_NAME[s]}
                    <small>{SIDE_NAME[s]}</small>
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="portal-code-input"
                data-testid="portal-code-input"
                value={code}
                autoComplete="off"
                spellCheck={false}
                placeholder="A secret code…"
                aria-label="Secret code to send through the portal"
                onChange={(e) => void onCode(e.target.value)}
              />
              {note && (
                <p className="portal-code-note" data-testid="portal-code-note" role="status">
                  {note}
                </p>
              )}
            </div>

            <button
              type="button"
              className="brass-btn brass-btn-solid portal-leave"
              data-testid="portal-leave"
              onClick={onLeave}
            >
              Leave the portal
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

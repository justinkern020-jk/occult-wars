import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mapById, tileLabel } from '../game/maps';
import { PORTAL_CODE_LABEL, portalCodeFor } from '../game/portalCodes';
import { readSeatToken } from '../net/account';
import {
  OWNER_KEY_STORAGE,
  listMatches,
  portalOpen,
  sendPortalCode,
  viewMatch,
  type MatchFrame,
  type MatchSummary,
} from '../net/watch';
import { UnitCoin, type BoardUnit } from './UnitCoin';

const SIDE_NAME = { blue: 'Azure', red: 'Crimson' } as const;
const ERA_NAME: Record<string, string> = {
  first: 'First Hour',
  second: 'Second Hour',
  old: 'Sealed Century',
};
const MODE_NAME: Record<string, string> = {
  friend: 'Against a friend',
  hotseat: 'One table',
  training: 'Against the rival',
  campaign: 'Campaign',
  second: 'Second Hour',
};

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

/** The owner's door in the battle count. Renders nothing for anyone else. */
export function PortalDoor() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [watching, setWatching] = useState<string | null>(null);

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
      void listMatches().then((m) => {
        if (alive && m) setMatches(m);
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
                  {ERA_NAME[m.era] ?? m.era} · {MODE_NAME[m.mode] ?? m.mode} · Turn {m.turn}
                  {m.over ? ' · ended' : ''}
                </span>
              </button>
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
        if (r.frame) setFrame(r.frame);
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
  const map = useMemo(() => (mapId ? mapById(mapId) : null), [mapId]);

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
                        if (tile.kind === 'void') {
                          return <div key={`${r}-${c}`} className="tile-void" aria-hidden />;
                        }
                        const unit = live.board[r]?.[c] ?? null;
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

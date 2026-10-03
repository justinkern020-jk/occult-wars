import { useEffect, useRef, useState } from 'react';
import { useSeat } from '../hooks/useSeat';
import { brassClick } from '../game/sfx';
import {
  MEETING_POLL_MS,
  MEETING_TEXT_MAX,
  mergeMeeting,
  postMeeting,
  readMeeting,
  readMeetingName,
  strikeMeeting,
  writeMeetingName,
  writeSeenMeeting,
  type MeetingMessage,
} from '../net/meeting';

type Props = { onBack: () => void; guestName: string };

function when(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const d = new Date(at);
  const today = new Date(now).toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** The Occultist Meeting — one board for everyone at the table. */
export function Meeting({ onBack, guestName }: Props) {
  const { seat } = useSeat();
  const [msgs, setMsgs] = useState<MeetingMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [owner, setOwner] = useState(false);
  const [store, setStore] = useState<'redis' | 'memory'>('redis');
  const [draft, setDraft] = useState('');
  const [name, setName] = useState(() => readMeetingName(guestName || ''));
  // The owner speaks as the Grand Master unless he names himself here.
  const [ownerName, setOwnerName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const cursor = useRef({ head: 0, rev: -1 });
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const read = async () => {
      try {
        const c = cursor.current;
        const r = await readMeeting(c.head, c.rev < 0 ? undefined : c.rev);
        if (!alive) return;
        cursor.current = { head: Math.max(r.full ? 0 : c.head, ...r.msgs.map((m) => m.id), 0), rev: r.rev };
        setMsgs((have) => mergeMeeting(have, r));
        setOwner(r.owner);
        setStore(r.store);
        setLoaded(true);
        writeSeenMeeting(r.head);
      } catch {
        if (alive) setLoaded(true);
      }
      if (alive) timer = window.setTimeout(read, document.hidden ? MEETING_POLL_MS * 3 : MEETING_POLL_MS);
    };
    void read();
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const speaker = owner
    ? 'Grand Master'
    : seat
      ? seat.username || seat.displayName || 'Occultist'
      : null;

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    if (!speaker && !name.trim()) {
      setNote('Choose a name to speak under.');
      return;
    }
    setBusy(true);
    setNote('');
    try {
      if (!seat && !owner) writeMeetingName(name.trim());
      const msg = await postMeeting(text, owner ? ownerName.trim() || 'Grand Master' : name.trim());
      setDraft('');
      stick.current = true;
      setMsgs((have) => mergeMeeting(have, { msgs: [msg], full: false }));
      cursor.current.head = Math.max(cursor.current.head, msg.id);
      writeSeenMeeting(msg.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The meeting did not hear that.');
    } finally {
      setBusy(false);
    }
  }

  async function strike(id: number) {
    try {
      await strikeMeeting(id);
      setMsgs((have) => have.filter((m) => m.id !== id));
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The message would not be struck.');
    }
  }

  return (
    <section className="meeting" data-testid="meeting">
      <div className="meeting-candles" aria-hidden />
      <p className="plate-kicker">By candlelight, all hands</p>
      <h1 className="meeting-title">The Occultist Meeting</h1>
      <p className="meeting-lead">
        Everyone at the table reads this board. Speak plainly; links are not read aloud.
      </p>
      {store === 'memory' && loaded && (
        <p className="meeting-faint" data-testid="meeting-faint">
          The hall keeps no lasting record yet — words may fade when the lamps are relit.
        </p>
      )}

      <div className="meeting-board plate">
        <ol
          className="meeting-list"
          ref={listRef}
          data-testid="meeting-list"
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
        >
          {!loaded ? (
            <li className="meeting-quiet">Lighting the candles…</li>
          ) : msgs.length === 0 ? (
            <li className="meeting-quiet" data-testid="meeting-empty">
              The hall is quiet. Say the first word.
            </li>
          ) : (
            msgs.map((m) => (
              <li
                key={m.id}
                className={`meeting-msg meeting-${m.badge}`}
                data-testid="meeting-msg"
                data-badge={m.badge}
                data-id={m.id}
              >
                <div className="meeting-msg-head">
                  <b className="meeting-name">{m.name}</b>
                  {m.badge === 'owner' && (
                    <span className="meeting-badge" data-testid="meeting-owner-badge">
                      ✠ Grand Master
                    </span>
                  )}
                  {m.badge === 'seat' && (
                    <span className="meeting-seal" title="Signed in">
                      §
                    </span>
                  )}
                  <time className="meeting-when" dateTime={new Date(m.at).toISOString()}>
                    {when(m.at, now)}
                  </time>
                  {owner && (
                    <button
                      type="button"
                      className="meeting-strike"
                      data-testid="meeting-strike"
                      aria-label={`Strike the message from ${m.name}`}
                      onClick={() => void strike(m.id)}
                    >
                      Strike
                    </button>
                  )}
                </div>
                <p className="meeting-text">{m.text}</p>
              </li>
            ))
          )}
        </ol>

        <form
          className="meeting-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="meeting-as">
            {seat && !owner ? (
              <span data-testid="meeting-speaker">
                Speaking as <b>{speaker}</b>
              </span>
            ) : (
              <label>
                {owner ? 'Grand Master, speaking as' : 'Speaking as'}
                <input
                  value={owner ? ownerName : name}
                  maxLength={24}
                  placeholder={owner ? 'Grand Master' : 'A name for the meeting'}
                  data-testid="meeting-name"
                  onChange={(e) => (owner ? setOwnerName : setName)(e.target.value)}
                />
              </label>
            )}
          </div>
          <textarea
            className="meeting-input"
            data-testid="meeting-input"
            value={draft}
            maxLength={MEETING_TEXT_MAX}
            rows={3}
            placeholder="Speak to the meeting…"
            aria-label="Message to the meeting"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="meeting-send-row">
            <span className="meeting-count">
              {draft.length}/{MEETING_TEXT_MAX}
            </span>
            <button
              type="submit"
              className="brass-btn brass-btn-solid"
              data-testid="meeting-send"
              disabled={busy || !draft.trim()}
            >
              Speak
            </button>
          </div>
          {note && (
            <p className="meeting-note" role="alert" data-testid="meeting-note">
              {note}
            </p>
          )}
        </form>
      </div>

      <button
        type="button"
        className="brass-btn"
        data-testid="meeting-back"
        onClick={() => {
          brassClick();
          onBack();
        }}
      >
        Return to the atelier
      </button>
    </section>
  );
}

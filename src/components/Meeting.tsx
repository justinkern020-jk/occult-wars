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
  type MeetingUpload,
} from '../net/meeting';
import { ACCEPT, ImageRefused, prepareImage } from '../net/meetingImage';

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
  const [upload, setUpload] = useState<MeetingUpload | null>(null);
  const [shrinking, setShrinking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [enlarged, setEnlarged] = useState<MeetingMessage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function attach(file: File | null | undefined) {
    if (!file) return;
    setNote('');
    setShrinking(true);
    try {
      setUpload(await prepareImage(file));
    } catch (err) {
      setNote(err instanceof ImageRefused ? err.message : 'That image could not be read.');
    } finally {
      setShrinking(false);
    }
  }

  function firstImage(list: DataTransferItemList | FileList | null | undefined): File | null {
    if (!list) return null;
    for (const it of Array.from(list as ArrayLike<DataTransferItem | File>)) {
      const f = it instanceof File ? it : it.kind === 'file' ? it.getAsFile() : null;
      if (f && ACCEPT.includes(f.type)) return f;
    }
    return null;
  }

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlarged(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlarged]);

  async function send() {
    const text = draft.trim();
    if ((!text && !upload) || busy || shrinking) return;
    if (!speaker && !name.trim()) {
      setNote('Choose a name to speak under.');
      return;
    }
    setBusy(true);
    setNote('');
    try {
      if (!seat && !owner) writeMeetingName(name.trim());
      const msg = await postMeeting(
        text,
        owner ? ownerName.trim() || 'Grand Master' : name.trim(),
        upload,
      );
      setDraft('');
      setUpload(null);
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
        Everyone at the table reads this board. Speak plainly; links are not read aloud. Images
        are shrunk before they are pinned.
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
                {m.text && <p className="meeting-text">{m.text}</p>}
                {m.img && (
                  <button
                    type="button"
                    className="meeting-thumb"
                    data-testid="meeting-thumb"
                    aria-label={`Enlarge the image from ${m.name}`}
                    onClick={() => setEnlarged(m)}
                  >
                    <img
                      src={m.img.src}
                      alt={`Image from ${m.name}`}
                      width={m.img.w}
                      height={m.img.h}
                      loading="lazy"
                      decoding="async"
                      onLoad={() => {
                        const el = listRef.current;
                        if (el && stick.current) el.scrollTop = el.scrollHeight;
                      }}
                    />
                  </button>
                )}
              </li>
            ))
          )}
        </ol>

        <form
          className={`meeting-form${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void attach(firstImage(e.dataTransfer.files));
          }}
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
            onPaste={(e) => {
              const f = firstImage(e.clipboardData?.items);
              if (f) {
                e.preventDefault();
                void attach(f);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {(upload || shrinking) && (
            <div className="meeting-pending" data-testid="meeting-pending">
              {upload ? (
                <>
                  <img src={upload.preview} alt="Image to send" />
                  <span>
                    {upload.w}×{upload.h} · {Math.round(upload.bytes / 1024)} KB
                  </span>
                  <button
                    type="button"
                    className="meeting-strike"
                    data-testid="meeting-unattach"
                    onClick={() => setUpload(null)}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span>Shrinking the image…</span>
              )}
            </div>
          )}
          <div className="meeting-send-row">
            <span className="meeting-count">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT.join(',')}
                hidden
                data-testid="meeting-file"
                onChange={(e) => {
                  void attach(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="meeting-attach"
                data-testid="meeting-attach"
                aria-label="Attach an image"
                title="Attach an image (or paste / drop one)"
                onClick={() => fileRef.current?.click()}
              >
                ⎘ Image
              </button>
              {draft.length}/{MEETING_TEXT_MAX}
            </span>
            <button
              type="submit"
              className="brass-btn brass-btn-solid"
              data-testid="meeting-send"
              disabled={busy || shrinking || (!draft.trim() && !upload)}
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

      {enlarged?.img && (
        <div
          className="meeting-lightbox"
          data-testid="meeting-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Image from ${enlarged.name}`}
          onClick={() => setEnlarged(null)}
        >
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={enlarged.img.src} alt={`Image from ${enlarged.name}`} />
            <figcaption>
              {enlarged.name}
              {enlarged.text ? ` — ${enlarged.text.slice(0, 120)}` : ''}
            </figcaption>
            <button
              type="button"
              className="brass-btn brass-btn-solid"
              data-testid="meeting-lightbox-close"
              onClick={() => setEnlarged(null)}
            >
              Close
            </button>
          </figure>
        </div>
      )}

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

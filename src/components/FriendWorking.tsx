import { useCallback, useEffect, useRef, useState } from 'react';
import { brassClick } from '../game/sfx';

type Props = {
  onStartAsHost: (room: string) => void;
  onStartAsGuest: (room: string) => void;
  onBack: () => void;
};

function randomRoom(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

/**
 * Best-effort WebRTC friend matchmaking via manual SDP paste
 * (no signaling server in-box). UI always ships; RTC degrades gracefully.
 */
export function FriendWorking({ onStartAsHost, onStartAsGuest, onBack }: Props) {
  const [room, setRoom] = useState(randomRoom);
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [status, setStatus] = useState('Choose host or guest. Exchange the offer by hand.');
  const [localSdp, setLocalSdp] = useState('');
  const [remoteSdp, setRemoteSdp] = useState('');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [connected, setConnected] = useState(false);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  async function becomeHost() {
    brassClick();
    setRole('host');
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;
      pc.createDataChannel('occult-wars');
      pc.onicecandidate = (e) => {
        if (!e.candidate && pc.localDescription) {
          setLocalSdp(JSON.stringify(pc.localDescription));
        }
      };
      pc.onconnectionstatechange = () => {
        setStatus(`Host · ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          setConnected(true);
          onStartAsHost(room);
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setLocalSdp(JSON.stringify(offer));
      setStatus('Host ready. Send the offer SDP to your guest, then paste their answer.');
    } catch (err) {
      setStatus(
        `WebRTC unavailable (${err instanceof Error ? err.message : 'blocked'}). You can still sit hotseat.`,
      );
    }
  }

  async function becomeGuest() {
    brassClick();
    setRole('guest');
    setStatus('Guest · paste the host offer below, then send your answer back.');
  }

  async function applyRemote() {
    if (!remoteSdp.trim()) return;
    try {
      const desc = JSON.parse(remoteSdp) as RTCSessionDescriptionInit;
      if (role === 'host') {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(desc);
        setStatus('Host · answer applied. Waiting for ice…');
        return;
      }
      // guest creates pc from offer
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;
      pc.ondatachannel = () => {
        setConnected(true);
        onStartAsGuest(room);
      };
      pc.onconnectionstatechange = () => {
        setStatus(`Guest · ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          setConnected(true);
          onStartAsGuest(room);
        }
      };
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      pc.onicecandidate = (e) => {
        if (!e.candidate && pc.localDescription) {
          setLocalSdp(JSON.stringify(pc.localDescription));
        }
      };
      setLocalSdp(JSON.stringify(answer));
      setStatus('Guest · send this answer SDP back to the host.');
    } catch (err) {
      setStatus(
        `Could not apply SDP (${err instanceof Error ? err.message : 'error'}).`,
      );
    }
  }

  return (
    <section className="friend-working" data-testid="friend-working">
      <p className="plate-kicker">Friend Working</p>
      <h2>Four-letter room</h2>
      <p className="lede">
        Host names the field. Best-effort WebRTC — if the box blocks peers, pass
        the Grimoire instead.
      </p>

      <label className="room-code">
        Room
        <input
          value={room}
          maxLength={4}
          onChange={(e) => setRoom(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
        />
      </label>

      <div className="friend-roles">
        <button type="button" className="brass-btn brass-btn-solid" onClick={becomeHost}>
          Host the field
        </button>
        <button type="button" className="brass-btn" onClick={becomeGuest}>
          Join as guest
        </button>
      </div>

      <p className="friend-status" data-testid="friend-status">
        {status}
        {connected ? ' · Channel open.' : ''}
      </p>

      {role && (
        <div className="friend-sdp">
          <label>
            Your SDP
            <textarea readOnly value={localSdp} rows={4} />
          </label>
          <label>
            Their SDP
            <textarea
              value={remoteSdp}
              rows={4}
              onChange={(e) => setRemoteSdp(e.target.value)}
              placeholder="Paste offer or answer here"
            />
          </label>
          <button type="button" className="brass-btn" onClick={applyRemote}>
            Apply remote SDP
          </button>
          <button
            type="button"
            className="brass-btn brass-btn-solid"
            onClick={() => {
              brassClick();
              if (role === 'host') onStartAsHost(room);
              else onStartAsGuest(room);
            }}
          >
            Sit anyway (local field)
          </button>
        </div>
      )}

      <button type="button" className="brass-btn brass-btn-ghost mt-door" onClick={onBack}>
        Return
      </button>
    </section>
  );
}

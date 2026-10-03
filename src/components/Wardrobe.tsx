/**
 * The Wardrobe: choose a card back and a coin skin; enter a patron code.
 * Also the small draw pile beside the hand (drawn in the worn back).
 */
import { useState } from 'react';
import type { Profile } from '../game/profile';
import { CARD_BACKS, COIN_SKINS, isUnlocked, wornBack, wornCoin } from '../game/wardrobe';
import { brassClick } from '../game/sfx';
import { redeemPatronCode } from '../net/patron';
import { toastNotice } from './HonourToast';

/** Your draw pile: the worn back, with the count. */
export function DeckPile({ count }: { count: number }) {
  return (
    <span className="deck-pile" title={`${count} plates left to draw`} data-testid="deck-pile">
      <span className="ow-card-back deck-pile-back" aria-hidden />
      <span className="deck-pile-count">{count}</span>
    </span>
  );
}

type Props = { profile: Profile; onUpdate: (fn: (p: Profile) => Profile) => void; onClose: () => void };

export function WardrobePanel({ profile, onUpdate, onClose }: Props) {
  const back = wornBack(profile);
  const coin = wornCoin(profile);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: { back?: string; coin?: string; patron?: string }) =>
    onUpdate((p) => ({ ...p, wardrobe: { ...(p.wardrobe ?? {}), ...patch } }));

  return (
    <div className="codex-page-scrim" role="dialog" aria-modal aria-label="The Wardrobe" onClick={onClose}>
      <div className="wardrobe-panel plate" onClick={(e) => e.stopPropagation()} data-testid="wardrobe-panel">
        <p className="plate-kicker">Cosmetic only · rides your Ledger page</p>
        <h2>The Wardrobe</h2>
        <h3 className="wardrobe-h">Card backs</h3>
        <div className="wardrobe-grid">
          {CARD_BACKS.map((b) => {
            const open = isUnlocked(profile, b);
            const [have, need] = b.unlock?.progress(profile) ?? [1, 1];
            return (
              <button
                key={b.id}
                type="button"
                className={`wardrobe-item${b.id === back ? ' is-worn' : ''}${open ? '' : ' is-locked'}`}
                data-testid={`wardrobe-back-${b.id}`}
                aria-pressed={b.id === back}
                disabled={!open}
                title={open ? b.blurb : b.unlock?.how}
                onClick={() => {
                  brassClick();
                  set({ back: b.id });
                }}
              >
                <span className="ow-card-back wardrobe-back" data-back={b.id} aria-hidden />
                <span className="wardrobe-name">{b.name}</span>
                <span className="wardrobe-sub">
                  {open ? (b.id === back ? 'Worn' : b.blurb) : `${b.unlock?.how}${need > 1 ? ` (${have}/${need})` : ''}`}
                </span>
              </button>
            );
          })}
        </div>
        <h3 className="wardrobe-h">Coin skins</h3>
        <div className="wardrobe-grid wardrobe-grid-coins">
          {COIN_SKINS.map((c) => {
            const open = isUnlocked(profile, c);
            const [have, need] = c.unlock?.progress(profile) ?? [1, 1];
            return (
              <button
                key={c.id}
                type="button"
                className={`wardrobe-item${c.id === coin ? ' is-worn' : ''}${open ? '' : ' is-locked'}`}
                data-testid={`wardrobe-coin-${c.id}`}
                aria-pressed={c.id === coin}
                disabled={!open}
                title={open ? c.blurb : c.unlock?.how}
                onClick={() => {
                  brassClick();
                  set({ coin: c.id });
                }}
              >
                <span className="wardrobe-coin-well" aria-hidden>
                  <span className="stone-coin wardrobe-coin" data-skin={c.id}>
                    <img className="stone-face" src="/assets/images/coil_saint.jpg" alt="" draggable={false} />
                  </span>
                </span>
                <span className="wardrobe-name">{c.name}</span>
                <span className="wardrobe-sub">
                  {open ? (c.id === coin ? 'Worn' : c.blurb) : `${c.unlock?.how}${need > 1 ? ` (${have}/${need})` : ''}`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="wardrobe-note">Your coin skin shows to the other chair in a Friend Working.</p>
        <h3 className="wardrobe-h">Patron code</h3>
        {profile.wardrobe?.patron ? (
          <p className="wardrobe-note" data-testid="patron-ok">
            A patron of the work. The gilt back is yours.
          </p>
        ) : (
          <form
            className="wardrobe-patron"
            onSubmit={(e) => {
              e.preventDefault();
              if (!code.trim() || busy) return;
              setBusy(true);
              setErr('');
              void redeemPatronCode(code.trim()).then((r) => {
                setBusy(false);
                if (r.ok) {
                  set({ patron: r.code, back: 'patron' });
                  setCode('');
                  toastNotice('Patron of the work', 'Patron’s Gilt', 'The gilt card back is yours. Thank you for your patronage.');
                } else setErr(r.error);
              });
            }}
          >
            <input
              className="ledger-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PATRON-XXXXXX-XXXXXXXX"
              aria-label="Patron code"
              maxLength={40}
              autoCapitalize="characters"
              spellCheck={false}
              data-testid="patron-code"
            />
            <button type="submit" className="brass-btn" disabled={busy || !code.trim()} data-testid="patron-redeem">
              {busy ? 'Reading…' : 'Redeem'}
            </button>
            {err && <p className="wardrobe-err" role="alert">{err}</p>}
          </form>
        )}
        <button type="button" className="brass-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

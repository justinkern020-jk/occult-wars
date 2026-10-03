/**
 * One hook for the Battlefield: drives the battle choir from the match state
 * (Domination lead, rite count, a great unit falling) and stops it when the
 * field closes. A unit counts as great when its plate is rare, patron or a
 * leader.
 */
import { useEffect, useRef } from 'react';
import { cardById } from '../data/catalog';
import { DOMINATION_WIN } from '../game/scoring';
import { intensityFor, setBattleIntensity, stopBattleChoir, surgeBattleChoir } from '../game/musicLayers';

type Unit = { uid: string; cardId: string } | null;

export function useBattleMusic(
  board: readonly (readonly Unit[])[],
  domination: { blue: number; red: number },
  turn: number,
  over: boolean,
): void {
  useEffect(() => {
    setBattleIntensity(intensityFor({ domination, domWin: DOMINATION_WIN, turn, over }));
  }, [domination, turn, over]);

  const great = useRef(new Map<string, string>());
  useEffect(() => {
    const now = new Map<string, string>();
    for (const row of board) for (const u of row) if (u) now.set(u.uid, u.cardId);
    let fell = false;
    for (const [uid, cardId] of great.current) {
      if (!now.has(uid)) {
        const c = cardById(cardId);
        if (c && (c.rarity === 'rare' || c.rarity === 'patron' || c.kind === 'hero')) fell = true;
      }
    }
    const keep = new Map<string, string>();
    for (const [uid, cardId] of now) {
      const c = cardById(cardId);
      if (c && (c.rarity === 'rare' || c.rarity === 'patron' || c.kind === 'hero')) keep.set(uid, cardId);
    }
    great.current = keep;
    if (fell && !over && turn > 1) surgeBattleChoir();
  }, [board, over, turn]);

  useEffect(() => () => stopBattleChoir(), []);
}

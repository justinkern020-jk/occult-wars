/**
 * Plates met on the field this match (board, hand, discard piles). Flushed
 * to the Codex once, when the match ends or the field closes. The Battlefield
 * holds no profile writes for this; it only announces.
 */
import { useEffect, useRef } from 'react';
import { announce } from '../game/achievements';

type HasCard = { cardId?: string; id?: string } | null | undefined;

export function useEncounterLog(
  board: readonly (readonly HasCard[])[],
  hand: readonly HasCard[],
  discard: { blue: readonly HasCard[]; red: readonly HasCard[] },
  over: boolean,
): void {
  const seen = useRef(new Set<string>());
  const flushed = useRef(0);
  useEffect(() => {
    const s = seen.current;
    for (const row of board) for (const u of row) if (u?.cardId) s.add(u.cardId);
    for (const c of hand) if (c?.id) s.add(c.id);
    for (const c of discard.blue) if (c?.id) s.add(c.id);
    for (const c of discard.red) if (c?.id) s.add(c.id);
  }, [board, hand, discard]);
  const flush = () => {
    const ids = [...seen.current];
    if (ids.length === flushed.current) return;
    flushed.current = ids.length;
    announce({ kind: 'encounter', ids });
  };
  useEffect(() => {
    if (over) flush();
  });
  useEffect(() => () => flush(), []);
}

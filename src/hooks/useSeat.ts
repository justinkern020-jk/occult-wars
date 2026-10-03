import { useEffect, useSyncExternalStore } from 'react';
import { readSeatState, refreshSeat, subscribeSeat, type SeatState } from '../net/account';

let asked = false;

/** The signed-in occultist (or none), shared across screens. */
export function useSeat(): SeatState {
  const state = useSyncExternalStore(subscribeSeat, readSeatState, readSeatState);
  useEffect(() => {
    if (asked) return;
    asked = true;
    void refreshSeat();
  }, []);
  return state;
}

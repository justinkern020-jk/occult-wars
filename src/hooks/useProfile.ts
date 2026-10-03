import { useCallback, useEffect, useRef, useState } from 'react';
import {
  claimDaily,
  loadProfile,
  migrateProfile,
  saveProfile,
  type Profile,
} from '../game/profile';
import { fetchCloudProfile, pushCloudProfile } from '../net/account';
import { useSeat } from './useSeat';

/** A copy of this device's page, kept the first time a cloud page replaces it. */
export const LOCAL_BACKUP_KEY = 'occult-wars.profile.local-backup';
const PUSH_DELAY_MS = 1200;
/** Seat id whose cloud page is behind this device (a change not yet pushed). */
export const DIRTY_KEY = 'occult-wars.profile.unpushed';

function markDirty(seatId: string | null) {
  try {
    if (seatId) localStorage.setItem(DIRTY_KEY, seatId);
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* blocked storage */
  }
}
function dirtyFor(seatId: string): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === seatId;
  } catch {
    return false;
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [dailyGranted, setDailyGranted] = useState(0);
  const { seat } = useSeat();
  const seatId = seat?.id ?? null;
  /** Cloud sync is live for this seat id once the first pull has settled. */
  const syncedFor = useRef<string | null>(null);
  const pushTimer = useRef<number | undefined>(undefined);
  const latest = useRef(profile);
  useEffect(() => {
    latest.current = profile;
  }, [profile]);

  useEffect(() => {
    const { profile: next, granted } = claimDaily(loadProfile());
    if (granted > 0) {
      saveProfile(next);
      setProfile(next);
      setDailyGranted(granted);
    }
  }, []);

  // Signed in: the cloud page wins; an empty cloud page takes this device's.
  useEffect(() => {
    if (!seatId) {
      syncedFor.current = null;
      return;
    }
    let live = true;
    fetchCloudProfile()
      .then((raw) => {
        if (!live) return;
        if (dirtyFor(seatId)) {
          // This device saved something the cloud never got: it wins.
          syncedFor.current = seatId;
          void pushCloudProfile(latest.current)
            .then(() => markDirty(null))
            .catch(() => undefined);
          return;
        }
        if (raw && typeof raw === 'object') {
          try {
            if (!localStorage.getItem(LOCAL_BACKUP_KEY)) {
              localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(latest.current));
            }
          } catch {
            /* storage full or blocked */
          }
          const { profile: next, granted } = claimDaily(
            migrateProfile(raw as Partial<Profile> & Record<string, unknown>),
          );
          saveProfile(next);
          setProfile(next);
          if (granted > 0) setDailyGranted(granted);
          syncedFor.current = seatId;
          if (granted > 0) void pushCloudProfile(next).catch(() => undefined);
        } else {
          syncedFor.current = seatId;
          void pushCloudProfile(latest.current).catch(() => undefined);
        }
      })
      .catch(() => {
        /* offline: keep playing locally; sync resumes next sign-in */
      });
    return () => {
      live = false;
    };
  }, [seatId]);

  const pushNow = useCallback((keepalive = false) => {
    window.clearTimeout(pushTimer.current);
    pushTimer.current = undefined;
    const seat = syncedFor.current;
    if (!seat) return Promise.resolve(false);
    return pushCloudProfile(latest.current, { keepalive })
      .then(() => {
        if (syncedFor.current === seat && pushTimer.current === undefined) markDirty(null);
        return true;
      })
      .catch(() => false);
  }, []);

  // Closing or hiding the page sends any change still waiting.
  useEffect(() => {
    const flush = () => {
      if (pushTimer.current !== undefined) void pushNow(true);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      window.clearTimeout(pushTimer.current);
    };
  }, [pushNow]);

  const update = useCallback(
    (next: Profile | ((p: Profile) => Profile), opts: { now?: boolean } = {}) => {
      setProfile((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        saveProfile(resolved);
        latest.current = resolved;
        if (syncedFor.current) {
          markDirty(syncedFor.current);
          window.clearTimeout(pushTimer.current);
          pushTimer.current = window.setTimeout(
            () => {
              pushTimer.current = undefined;
              void pushNow();
            },
            opts.now ? 0 : PUSH_DELAY_MS,
          );
        }
        return resolved;
      });
    },
    [pushNow],
  );

  return { profile, update, dailyGranted, clearDailyNotice: () => setDailyGranted(0) };
}

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
const PUSH_DELAY_MS = 2500;

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

  useEffect(
    () => () => {
      window.clearTimeout(pushTimer.current);
    },
    [],
  );

  const update = useCallback((next: Profile | ((p: Profile) => Profile)) => {
    setProfile((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      saveProfile(resolved);
      if (syncedFor.current) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = window.setTimeout(() => {
          if (syncedFor.current) void pushCloudProfile(latest.current).catch(() => undefined);
        }, PUSH_DELAY_MS);
      }
      return resolved;
    });
  }, []);

  return { profile, update, dailyGranted, clearDailyNotice: () => setDailyGranted(0) };
}

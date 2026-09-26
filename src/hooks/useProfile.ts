import { useCallback, useEffect, useState } from 'react';
import {
  claimDaily,
  loadProfile,
  saveProfile,
  type Profile,
} from '../game/profile';

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [dailyGranted, setDailyGranted] = useState(0);

  useEffect(() => {
    const { profile: next, granted } = claimDaily(loadProfile());
    if (granted > 0) {
      saveProfile(next);
      setProfile(next);
      setDailyGranted(granted);
    }
  }, []);

  const update = useCallback((next: Profile | ((p: Profile) => Profile)) => {
    setProfile((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      saveProfile(resolved);
      return resolved;
    });
  }, []);

  return { profile, update, dailyGranted, clearDailyNotice: () => setDailyGranted(0) };
}

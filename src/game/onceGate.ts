/** A per-match "first time only" gate (e.g. a cryptid's Sighting is announced once). */
export type OnceGate = {
  /** True the first time `key` is seen since the last reset, false after. */
  first(key: string): boolean;
  /** Mark keys as already seen without announcing them. */
  mark(...keys: string[]): void;
  reset(): void;
};

export function createOnceGate(): OnceGate {
  let seen = new Set<string>();
  return {
    first(key) {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    mark(...keys) {
      for (const k of keys) seen.add(k);
    },
    reset() {
      seen = new Set();
    },
  };
}

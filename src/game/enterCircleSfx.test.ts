import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const played: string[] = [];

beforeEach(() => {
  store.clear();
  played.length = 0;
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  class FakeAudio {
    src: string;
    volume = 1;
    currentTime = 0;
    preload = '';
    paused = true;
    constructor(src = '') {
      this.src = src;
    }
    load() {}
    pause() {
      this.paused = true;
    }
    play() {
      this.paused = false;
      played.push(this.src);
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
});

describe('the Enter the circle sting', () => {
  it('plays its own file (used nowhere else) on the click', async () => {
    const sfx = await import('./sfx');
    sfx.enterCircleSfx();
    expect(played).toEqual(['/assets/audio/sfx/enter-circle.mp3']);
  });

  it('stays silent when sound is muted on this device', async () => {
    const sfx = await import('./sfx');
    sfx.setSoundMuted(true);
    expect(sfx.isSoundMuted()).toBe(true);
    sfx.enterCircleSfx();
    expect(played).toEqual([]);
    sfx.setSoundMuted(false);
    sfx.enterCircleSfx();
    expect(played).toHaveLength(1);
  });
});

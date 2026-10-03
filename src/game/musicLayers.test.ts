import { describe, expect, it } from 'vitest';
import { intensityFor } from './musicLayers';
import { BARKS } from './voice';
import fs from 'fs';

describe('battle choir intensity', () => {
  it('is silent early and swells near Domination', () => {
    expect(intensityFor({ domination: { blue: 5, red: 3 }, domWin: 60, turn: 3, over: false })).toBe(0);
    expect(intensityFor({ domination: { blue: 56, red: 10 }, domWin: 60, turn: 9, over: false })).toBeGreaterThan(0.9);
    expect(intensityFor({ domination: { blue: 10, red: 10 }, domWin: 60, turn: 24, over: false })).toBeGreaterThan(0.5);
    expect(intensityFor({ domination: { blue: 59, red: 10 }, domWin: 60, turn: 30, over: true })).toBe(0);
  });
});

describe('leader barks', () => {
  it('every bark has its recording', () => {
    for (const list of Object.values(BARKS)) {
      for (const b of list) expect(fs.existsSync(`public/assets/audio/voice/${b.id}.mp3`), b.id).toBe(true);
    }
  });
});

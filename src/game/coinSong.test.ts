import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COIN_MOVE_SONG,
  DIES_IRAE,
  MOONLIGHT_SONATA,
  knockSrc,
  nextCoinMoveNote,
  resetCoinMoveSong,
} from './sfx';

const PUBLIC = path.resolve(__dirname, '../../public');

describe('coin-move song', () => {
  it('every note of both tunes has a rendered knock', () => {
    for (const note of new Set([...MOONLIGHT_SONATA, ...DIES_IRAE])) {
      expect(fs.existsSync(path.join(PUBLIC, knockSrc(note))), note).toBe(true);
    }
    expect(knockSrc('G#2')).toBe('/assets/audio/sfx/knock/knock-gs2.mp3');
  });

  it('opens on the Moonlight triplet and steps one note per move, cycling; reset starts over', () => {
    expect(COIN_MOVE_SONG).toBe(MOONLIGHT_SONATA);
    resetCoinMoveSong();
    expect([nextCoinMoveNote(), nextCoinMoveNote(), nextCoinMoveNote()]).toEqual(['G#2', 'C#3', 'E3']);
    for (let i = 3; i < COIN_MOVE_SONG.length; i++) nextCoinMoveNote();
    expect(nextCoinMoveNote()).toBe('G#2'); // wrapped
    nextCoinMoveNote();
    resetCoinMoveSong();
    expect(nextCoinMoveNote()).toBe('G#2');
  });
});

import { describe, expect, it } from 'vitest';
import {
  loadoutFromWorking,
  resolveFriendMatchLoadouts,
  rivalFaction,
  sanitizeFriendLoadout,
} from './friendLoadout';

describe('sanitizeFriendLoadout', () => {
  it('keeps known hero and cards', () => {
    const out = sanitizeFriendLoadout({
      heroId: 'the_rune_colonel',
      cards: ['coil_novice', 'gyro_rocketeer', 'not_a_real_card'],
      faction: 'The Vril Syndicate',
    });
    expect(out.heroId).toBe('the_rune_colonel');
    expect(out.cards).toEqual(['coil_novice', 'gyro_rocketeer']);
    expect(out.faction).toBe('The Vril Syndicate');
  });

  it('drops unknown heroId and non-hero ids used as hero', () => {
    expect(
      sanitizeFriendLoadout({ heroId: 'nope', cards: [] }).heroId,
    ).toBeUndefined();
    expect(
      sanitizeFriendLoadout({ heroId: 'coil_novice', cards: [] }).heroId,
    ).toBeUndefined();
  });

  it('infers faction from hero when omitted', () => {
    const out = sanitizeFriendLoadout({
      heroId: 'the_mute_alchemist',
      cards: [],
    });
    expect(out.faction).toBe('The Hermetic Circle');
  });

  it('tolerates missing cards array', () => {
    expect(sanitizeFriendLoadout({}).cards).toEqual([]);
  });
});

describe('loadoutFromWorking', () => {
  it('uses custom deck cards and allegiance', () => {
    const out = loadoutFromWorking(
      {
        id: 'first-working',
        name: 'Vril',
        heroId: 'the_rune_colonel',
        cards: ['coil_novice', 'gyro_rocketeer'],
      },
      'The Vril Syndicate',
    );
    expect(out.heroId).toBe('the_rune_colonel');
    expect(out.cards).toContain('coil_novice');
    expect(out.faction).toBe('The Vril Syndicate');
  });

  it('falls back to allegiance only when no working', () => {
    const out = loadoutFromWorking(undefined, 'Order of the Lead Dawn');
    expect(out.cards).toEqual([]);
    expect(out.faction).toBe('Order of the Lead Dawn');
    expect(out.heroId).toBeUndefined();
  });
});

describe('resolveFriendMatchLoadouts', () => {
  const thirty = Array.from({ length: 30 }, () => 'coil_novice');

  it('assigns host to blue and guest to red', () => {
    const host = sanitizeFriendLoadout({
      heroId: 'the_rune_colonel',
      cards: thirty,
      faction: 'The Vril Syndicate',
    });
    const guest = sanitizeFriendLoadout({
      heroId: 'the_mute_alchemist',
      cards: Array.from({ length: 30 }, () => 'coil_novice'),
      faction: 'The Hermetic Circle',
    });
    // guest cards filtered to known — coil_novice is Vril but still known ids
    const r = resolveFriendMatchLoadouts(
      host,
      guest,
      'The Vril Syndicate',
    );
    expect(r.blueFaction).toBe('The Vril Syndicate');
    expect(r.redFaction).toBe('The Hermetic Circle');
    expect(r.blueHeroId).toBe('the_rune_colonel');
    expect(r.redHeroId).toBe('the_mute_alchemist');
    expect(r.blueDeckIds).toHaveLength(30);
    expect(r.redDeckIds).toHaveLength(30);
  });

  it('falls back to default decks when cards < 30', () => {
    const host = sanitizeFriendLoadout({
      heroId: 'the_rune_colonel',
      cards: ['coil_novice'],
      faction: 'The Vril Syndicate',
    });
    const guest = sanitizeFriendLoadout({
      cards: [],
      faction: 'The Hermetic Circle',
    });
    const r = resolveFriendMatchLoadouts(
      host,
      guest,
      'The Vril Syndicate',
    );
    expect(r.blueDeckIds).toBeUndefined();
    expect(r.redDeckIds).toBeUndefined();
    expect(r.redFaction).toBe('The Hermetic Circle');
  });

  it('picks a rival when guest has no faction', () => {
    const host = sanitizeFriendLoadout({
      faction: 'The Vril Syndicate',
      cards: [],
    });
    const guest = sanitizeFriendLoadout({ cards: [] });
    const r = resolveFriendMatchLoadouts(
      host,
      guest,
      'The Vril Syndicate',
    );
    expect(r.redFaction).toBe(rivalFaction('The Vril Syndicate'));
    expect(r.redFaction).not.toBe('The Vril Syndicate');
  });
});

describe('rivalFaction', () => {
  it('avoids self and ally', () => {
    const r = rivalFaction('The Vril Syndicate');
    expect(r).not.toBe('The Vril Syndicate');
    expect(r).not.toBe('The Hermetic Circle');
  });
});

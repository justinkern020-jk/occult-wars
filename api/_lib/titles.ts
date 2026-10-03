/** Titles an adept may wear (kept in step with src/game/achievements.ts; a test checks). */
export const TITLES: readonly string[] = [
  'Initiate of the Circle',
  'Veteran of the Circle',
  'Master of the Circle',
  'Grand Inquisitor',
  'Witch-Finder General',
  'Thaumaturge',
  'Lord of the Circles',
  'Voice of the Order',
  'Stormer of Gates',
  'Dominus',
  'Grand Hierophant',
  'Keeper of the Sealed Century',
  'Magister of the Old Work',
  'Watcher of the Hour After',
  'Survivor of the Leaden Hour',
  'Duellist',
  'Champion of the Table',
  'Seeker of Strange Beasts',
  'Keeper of the Bestiary',
  'Breaker of Seals',
  'The Gilded Hand',
  'Curator of the Emerald Cabinet',
  'Archivist',
  'Keeper of the Codex',
  'Adept of the Tenth Degree',
  'One Who Heard the Hour',
  'Destroyer of Worlds',
  'Witness of the Hidden Adept',
  'Friend of the Chief',
  'On the Night Shift',
  'Survivor of the Crash'
];

export function cleanTitle(raw: unknown): string | undefined {
  return typeof raw === 'string' && TITLES.includes(raw) ? raw : undefined;
}

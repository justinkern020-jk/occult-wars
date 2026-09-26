# Occult Wars

Vite + React + TypeScript port of the Occult Wars card game, with **Cabals dual-Power combat**.

- Live Grok prototype (reference): https://occultwar.grok.me
- This repo is the maintainable source of truth for combat + catalog.

## Cabals combat rules

1. **Power** is one dual stat = vitality **and** damage. No separate ATK/HP.
2. Taking damage permanently reduces Power. Power ≤ 0 → destroyed.
3. Example: Power 4 deals 4; takes 2 → Power 2 thereafter.
4. **Normal**: simultaneous mutual damage at current Power.
5. **Fast Attack** (`fast`): strikes first; if defender Power drops to ≤ 0, no strike back.
6. **Slow Attack** (`slow`): strikes last; opponent deals first; if the Slow unit survives, it deals its (possibly reduced) Power.
7. Chipping Power before (or during) melee reduces return damage.

Toughness (`tough`) still refuses the first point of any single strike.

## Power conversion (from legacy attack + health)

The Grok app stored separate `attack` and `health`. Cabals uses one printed Power.

**Conversion:** `power = Math.max(attack, health)`

So tanks keep soak capacity and hitters keep strike weight. Legacy values are kept on cards as `legacyAttack` / `legacyHealth` for audit. Cards that said “Slow muster” were remapped to keyword `delay` so `slow` means Slow Attack.

## Run locally

```bash
npm install
npm run dev
npm test
npm run build
```

## Deploy (Vercel)

1. Push is on `https://github.com/justinkern020-jk/occult-wars`
2. In Vercel: **Add New Project** → Import that repo → Framework preset Vite → Deploy.
3. Or CLI: `vercel --prod` from this directory (once linked).

`vercel.json` sets Vite build output to `dist` and SPA rewrites.

## Layout

| Path | Role |
|------|------|
| `src/game/combat.ts` | Cabals melee resolver (Fast / Slow / Normal) |
| `src/game/combat.test.ts` | Vitest coverage for combat |
| `src/game/keywords.ts` | Keyword glossary |
| `src/data/cards.json` | Extracted catalog (204 cards, dual Power) |
| `src/components/*` | Catalog + combat sandbox UI |
| `public/assets/*` | Original minified Grok bundles (reference) |

## Sample resolution

Fast Power 2 into Power 2 → defender destroyed, attacker untouched.  
Slow Power 6 into Power 4 → defender deals 4 first (attacker → 2), then attacker deals 2 (defender → 2).  
Normal 3 vs 4 → simultaneous; attacker → 0, defender → 1.

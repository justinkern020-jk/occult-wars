# Occult Wars

Vite + React + TypeScript port of [occultwar.grok.me](https://occultwar.grok.me), with **Cabals dual-Power combat**.

Live: https://occult-wars.vercel.app

## Cabals combat

1. **Power** is one dual stat = vitality **and** damage.
2. Damage permanently reduces Power. Power ≤ 0 → destroyed.
3. **Normal** simultaneous · **Fast** strikes first · **Slow** strikes last.
4. Toughness refuses the first point of any single strike.
5. Ranged: Manhattan reach 2; Shutter blocks ranged naming.
6. Lamp (`crown`): adjacent allies strike +1.

## Atelier doors

| Door | What it does |
|------|----------------|
| **Swear an order** | Pick primary + ally jewel (6 first-hour pairs) |
| **Training Rite** | Solo AI sitting; rites, devices, leaders |
| **The Leaden Hour** | 6-stage campaign + ending variants |
| **Pass the Grimoire** | Hotseat two chairs |
| **Friend Working** | 4-letter room · best-effort WebRTC |
| **The hour after** | Second Hour societies + blackout yards |
| **The Collection** | Owned plates · import/export ledger |
| **Deck Editor** | 1 leader · 30–40 · max 3 · order+ally |
| **Break a Seal** | 150 shards → 5 cards + reel |

Profile key: `occult-wars.profile.v1` (start 500 shards, daily purse 1000).

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

## Layout

| Path | Role |
|------|------|
| `src/game/combat.ts` | Dual-Power melee |
| `src/game/effects.ts` | Rite / device / leader ops |
| `src/game/orders.ts` | First/second hour allies |
| `src/game/profile.ts` | Shards, packs, decks, persistence |
| `src/game/campaign.ts` | Leaden Hour stages + endings |
| `src/components/Battlefield.tsx` | Field (all modes) |
| `public/assets/images/` | Mirrored card art |

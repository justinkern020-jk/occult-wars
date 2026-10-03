/**
 * The Leaden Hour between battles: 3-5 painted comic panels with narration
 * captions, built from the campaign's own lines (src/game/campaign.ts). Art
 * lives at /assets/story/<id>.jpg (1600×900); until a plate is painted, the
 * panel falls back to existing card or map art. The ending sequence (nuke,
 * fallout, Radiation Poisoning, Justin Kern, Fulcanelli) is not touched here.
 */
import { LEADEN_STAGES, type StageOutcome } from './campaign';

export type StoryPanel = {
  id: string;
  /** What the painting shows (also the alt text). */
  scene: string;
  caption: string;
  /** Existing art to show until /assets/story/<id>.jpg lands. */
  fallback: string;
  /** False: the panel always uses its existing art (the stage's own painted map). */
  paint?: boolean;
};

export const storyArt = (id: string) => `/assets/story/${id}.jpg`;

const MAP = (id: string) => `/assets/maps/${id}.jpg`;
const CARD = (slug: string) => `/assets/images/${slug}.jpg`;

/** Opening of the hour (before the first battle). */
export const PROLOGUE: StoryPanel = {
  id: 'leaden-prologue',
  scene: 'Six lodge banners ring a dark 5×5 alchemical field at midnight; a leaden clock face hangs in the fog above it.',
  caption: 'Six orders. One leaden hour. Close each circle.',
  fallback: '/assets/titles/menu-atelier.jpg',
};

type StageArt = { veil: string; foe: string; foeScene: string; veilScene: string; afterScene: string };

/** Per stage: the veil (establishing shot), the foe, and the morning after. */
const ART: Record<string, StageArt> = {
  lamp: {
    veil: CARD('lamp_of_the_work'),
    foe: CARD('vril_wyrm'),
    veilScene: 'A single oil lamp on a brass table in a dark laboratory; copper coils hum behind it with faint blue arcs.',
    foeScene: 'Vril Syndicate engineers in leather aprons and goggles wheel a great coil-engine into a lead-roofed court.',
    afterScene: 'Dawn over the leaden court: the first lamp burning in a window, coil-engines silent and smoking below.',
  },
  bell: {
    veil: MAP('ashen-cross'),
    foe: CARD('funeral_march'),
    veilScene: 'A cracked bronze parish bell hanging in a fog-bound belfry, a crow on the beam.',
    foeScene: 'Robed adepts of the Lead Dawn walk a funeral procession with an empty coffin through an ashen crossroads.',
    afterScene: 'The ashen cross at first light, the cracked bell lying in the mud beside a toppled lych-gate.',
  },
  hedge: {
    veil: MAP('twin-vaults'),
    foe: CARD('lion_s_mask'),
    veilScene: 'A hawthorn hedge taller than a man, shut against a moonlit country road; a lantern hangs on a post.',
    foeScene: 'Sons of the Green Lion in leaf-crowned lion masks step out of the hedge, vines curling round their boots.',
    afterScene: 'The hedge after the battle: a burned gap or a mended border, smoke drifting between two vaults.',
  },
  retort: {
    veil: CARD('the_open_retort'),
    foe: CARD('retort_warden'),
    veilScene: 'An open glass retort over a low blue flame on a cluttered alchemist’s bench; something gold glows inside.',
    foeScene: 'Masters of the Hermetic Circle in black academic robes stand in a ring of chalk around the outer seal.',
    afterScene: 'The outer seal at dawn: a chalk ring scuffed by boots, a retort cooling on its stand.',
  },
  midnight: {
    veil: MAP('leaden-court'),
    foe: CARD('midnight_don'),
    veilScene: 'A locked oak door at the end of a dim corridor, cigarette smoke curling out from under it.',
    foeScene: 'The Midnight Assembly round a card table in a back room: fedoras, a ledger, a ring of keys, a pistol by the ashtray.',
    afterScene: 'The back room after: the card table overturned, the ledger open, a key left in the lock.',
  },
  seal: {
    veil: CARD('carve_the_seal'),
    foe: CARD('edgar_allan_poe'),
    veilScene: 'A great seal of brass and paper, half-pressed into red wax on a lodge table under a single bulb.',
    foeScene: 'The Columbia Lodge: Poe in a dark coat, Cayce asleep in a chair, cryptid eyes shining at the edge of a pine forest.',
    afterScene: '',
  },
};

const words = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
/** The briefing minus the sentences the foe panel already said. */
export function freshBriefing(briefing: string, said: string): string {
  const heard = new Set(words(said));
  const sentences = briefing.match(/[^.!?]+[.!?]+/g) ?? [briefing];
  const keep = sentences.filter((x) => {
    const w = words(x);
    if (w.length === 0) return false;
    const overlap = w.filter((v) => heard.has(v)).length / w.length;
    return overlap < 0.7;
  });
  return (keep.length ? keep : sentences).join(' ').replace(/\s+/g, ' ').trim();
}

function outcomeLine(stageIndex: number, outcome: StageOutcome): string {
  const s = LEADEN_STAGES[stageIndex];
  if (!s) return '';
  return outcome === 'storm' ? s.storm : outcome === 'hold' ? s.hold : s.loss;
}

/**
 * Panels shown on arriving at a stage: the aftermath of the last battle (or
 * the prologue), then the stage's veil and foe, then its call to the field.
 */
export function panelsForStage(stageIndex: number, prevOutcome?: StageOutcome | null): StoryPanel[] {
  const s = LEADEN_STAGES[stageIndex];
  if (!s) return [];
  const art = ART[s.id]!;
  const out: StoryPanel[] = [];
  if (stageIndex === 0) out.push(PROLOGUE);
  else {
    const prev = LEADEN_STAGES[stageIndex - 1]!;
    if (prevOutcome) {
      out.push({
        id: `${prev.id}-after`,
        scene: ART[prev.id]!.afterScene,
        caption: outcomeLine(stageIndex - 1, prevOutcome),
        fallback: MAP(prev.map),
      });
    }
  }
  out.push({ id: `${s.id}-veil`, scene: art.veilScene, caption: s.cutscene.veil, fallback: art.veil });
  out.push({ id: `${s.id}-foe`, scene: art.foeScene, caption: s.cutscene.vo, fallback: art.foe });
  out.push({
    id: `${s.id}-field`,
    scene: `The field of ${s.title}: the painted map (${s.map}).`,
    caption: `${freshBriefing(s.briefing, s.cutscene.vo)} Foe · ${s.foe}.`,
    fallback: MAP(s.map),
    paint: false,
  });
  return out;
}

/** Every panel the hour can show (for the art list and tests). */
export function allStoryPanels(): StoryPanel[] {
  const seen = new Map<string, StoryPanel>();
  LEADEN_STAGES.forEach((_, i) => {
    for (const p of panelsForStage(i, i > 0 ? 'hold' : null)) if (!seen.has(p.id)) seen.set(p.id, p);
  });
  return [...seen.values()];
}

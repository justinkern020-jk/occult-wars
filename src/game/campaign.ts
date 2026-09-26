/** The Leaden Hour — 6 stages + ending variants. */

export type CampaignStageId =
  | 'lamp'
  | 'bell'
  | 'hedge'
  | 'retort'
  | 'midnight'
  | 'seal';

export type EndingId =
  | 'sealed-hour'
  | 'leaden-crown'
  | 'broken-circle'
  | 'cryptid-vigil'
  | 'ash-treaty';

export type StageOutcome = 'hold' | 'storm' | 'lost';

export type CampaignStage = {
  id: CampaignStageId;
  title: string;
  foe: string;
  map: string;
  briefing: string;
  hold: string;
  storm: string;
  loss: string;
  cutscene: {
    veil: string;
    portrait?: string;
    vo: string;
  };
};

export const LEADEN_STAGES: CampaignStage[] = [
  {
    id: 'lamp',
    title: 'The First Lamp',
    foe: 'The Vril Syndicate',
    map: 'leaden-court',
    briefing:
      'The Syndicate wants the hour as a machine. Light the first lamp or let their coil take the court.',
    hold: 'You took the court and left their stronghold standing. The Vril Syndicate draws its engineers back from the lamp.',
    storm:
      'You stormed the Vril stronghold. The lamp is yours. The hour tilts toward the machine — under your hand.',
    loss: 'Vril keeps the lamp. The court ticks in glass that is not yours.',
    cutscene: {
      veil: 'A single lamp on a brass table. The coil hums.',
      vo: 'The Syndicate wants the hour as a machine. Will you light the first lamp?',
    },
  },
  {
    id: 'bell',
    title: 'The Parish Bell',
    foe: 'Order of the Lead Dawn',
    map: 'ashen-cross',
    briefing:
      'Lead Dawn says the hour is a funeral that has not happened yet. The ashen cross waits.',
    hold: 'You took the ashen cross by the circles, not by the door. Lead Dawn remains in its house.',
    storm:
      'You took the Lead Dawn stronghold. The bell cracks. A cracked bell still calls something.',
    loss: 'Lead Dawn keeps the funeral. In the streets, people begin to answer a bell you could not silence.',
    cutscene: {
      veil: 'A cracked parish bell in fog.',
      vo: 'Lead Dawn says the hour is a funeral that has not happened yet.',
    },
  },
  {
    id: 'hedge',
    title: 'The Shut Hedge',
    foe: 'Sons of the Green Lion',
    map: 'twin-vaults',
    briefing:
      'You chose the hedge. The Green Lion will grow over whatever you leave unclaimed.',
    hold: 'The hedge accepts a border. The Green Lion keeps its root, and lends you the green quiet.',
    storm:
      "You tore out the Green Lion's stronghold. The hedge burns back, and something older than the order watches.",
    loss: 'You are on the wrong side of the leaves.',
    cutscene: {
      veil: 'A hedge taller than a man, shut against the road.',
      vo: 'The Green Lion will grow over whatever you leave unclaimed.',
    },
  },
  {
    id: 'retort',
    title: 'The Open Retort',
    foe: 'The Hermetic Circle',
    map: 'outer-seal',
    briefing:
      'You chose the retort. The Hermetic Circle will not share a formula taken at the point of a circle.',
    hold: 'You hold the outer seal. The Hermetic Circle keeps its house, and the formula you did not take by force.',
    storm:
      'You stormed the Hermetic stronghold. The retort is in your pocket. Formulas taken at the point of a circle still burn.',
    loss: 'The Circle keeps the hour. You can hear it ticking in glass.',
    cutscene: {
      veil: 'An open retort over a low flame.',
      vo: 'The Hermetic Circle will not share a formula taken at the point of a circle.',
    },
  },
  {
    id: 'midnight',
    title: 'The Back Room',
    foe: 'The Midnight Assembly',
    map: 'leaden-court',
    briefing:
      'Midnight has been selling seats at the hour. The lock on their door is a promise, or a threat.',
    hold: 'The back room is yours by the ground around it. Midnight pays what it owes, and keeps its lock.',
    storm:
      'You stormed the Midnight stronghold. The lock is yours. Every order now knows you collect doors.',
    loss: 'Midnight keeps the book. Your name is written in the loss column.',
    cutscene: {
      veil: 'A locked door with cigarette smoke under it.',
      vo: 'Midnight has been selling seats at the hour.',
    },
  },
  {
    id: 'seal',
    title: 'The American Seal',
    foe: 'The Columbia Lodge',
    map: 'ashen-cross',
    briefing:
      "Columbia was waiting. Poe's hour, Cayce's voice, the cryptids at the edge of the map.",
    hold: 'The American seal holds, and you did not sit their chair. Columbia remains a lodge.',
    storm:
      "You stormed the last stronghold. Columbia's chair is empty, and then it is yours. The war has a single occupant.",
    loss: 'Columbia closes the seal in a hand that is not yours. The hour stays open, in someone else.',
    cutscene: {
      veil: 'A great seal of brass and paper, half-pressed.',
      vo: "Poe's hour. Cayce's voice. The cryptids at the edge of the map.",
    },
  },
];

export const ENDINGS: Record<
  EndingId,
  { title: string; text: string }
> = {
  'sealed-hour': {
    title: 'The Sealed Hour',
    text: 'You closed each circle without sitting every chair. The hour seals. The orders remember a border.',
  },
  'leaden-crown': {
    title: 'The Leaden Crown',
    text: 'You stormed until only one occupant remained. The crown is lead. It does not shine. It weighs.',
  },
  'broken-circle': {
    title: 'The Broken Circle',
    text: 'Too many losses. The circle breaks. Something older than the six orders steps through.',
  },
  'cryptid-vigil': {
    title: 'The Cryptid Vigil',
    text: 'You held the edges and left the strange things standing. They keep watch. You keep the hour.',
  },
  'ash-treaty': {
    title: 'The Ash Treaty',
    text: 'Holds and storms in equal measure. Ash settles into a treaty no one signed out loud.',
  },
};


/** Universal closer after any Leaden Hour ending — Justin Kern answers. */
export const JUSTIN_EPILOGUE = {
  title: 'Justin Kern Answers',
  kicker: 'The Occult Wars · First Sitting',
  paragraphs: [
    'The lodges thought they had won the leaden hour. Crowns of ash. Sealed circles. Treaties no one signed out loud.',
    'Then Justin Kern answered. The gadget spoke. The field became ash, and every chair — victor and vanquished — was empty under the same white fire.',
    'He rules what remains of the occult world. The six orders remember only the flash.',
    'The Occult Wars were only the first sitting. The hour after has not yet begun.',
  ],
  sequelTease: 'A true sequel waits beyond the seal.',
} as const;

export function stageByIndex(i: number): CampaignStage | null {
  return LEADEN_STAGES[i] ?? null;
}

export function pickEnding(
  outcomes: StageOutcome[],
): EndingId {
  const storms = outcomes.filter((o) => o === 'storm').length;
  const holds = outcomes.filter((o) => o === 'hold').length;
  const losses = outcomes.filter((o) => o === 'lost').length;
  if (losses >= 3) return 'broken-circle';
  if (storms === 6) return 'leaden-crown';
  if (holds === 6) return 'sealed-hour';
  if (holds >= 4 && storms <= 1) return 'cryptid-vigil';
  if (Math.abs(holds - storms) <= 1) return 'ash-treaty';
  if (storms >= 4) return 'leaden-crown';
  return 'sealed-hour';
}

import {
  isAthensCode,
  isHiddenAdeptCode,
  isOppenheimerCode,
  isSethKernCode,
  isSouthHavenPdCode,
} from './hourUnlock';
import type { PortalCode } from '../net/watch';

/** The in-match codes the Portal can carry, read exactly as the field reads them. */
export function portalCodeFor(text: string): PortalCode | null {
  if (isHiddenAdeptCode(text)) return 'adept';
  if (isOppenheimerCode(text)) return 'justin';
  if (isSethKernCode(text)) return 'seth';
  if (isSouthHavenPdCode(text)) return 'southhaven';
  if (isAthensCode(text)) return 'athens';
  return null;
}

export const PORTAL_CODE_LABEL: Record<PortalCode, string> = {
  justin: 'Oppenheimer — Justin Kern',
  adept: 'Hidden Adept — Justin Kern',
  seth: 'Seth Kern',
  southhaven: 'South Haven Dispatch',
  athens: 'Athens Ohio — a cryptid sighting',
};

/**
 * Maps team display names (as they typically appear on BBC fixture pages) to
 * the TLA (three-letter abbreviation) team codes used internally.
 *
 * Each TLA may have multiple aliases — BBC has historically switched between
 * "South Korea" / "Korea Republic", "Ivory Coast" / "Côte d'Ivoire",
 * "Turkey" / "Türkiye", etc. Listing both protects against editorial drift.
 *
 * Lookup goes through `normaliseTeamName` so case, whitespace, diacritics, and
 * common punctuation differences don't cause misses.
 */

const TLA_TO_ALIASES: Record<string, string[]> = {
  MEX: ['Mexico'],
  KOR: ['South Korea', 'Korea Republic', 'Korea'],
  CZE: ['Czechia', 'Czech Republic'],
  RSA: ['South Africa'],
  SUI: ['Switzerland'],
  CAN: ['Canada'],
  QAT: ['Qatar'],
  BIH: ['Bosnia-Herzegovina', 'Bosnia and Herzegovina', 'Bosnia & Herzegovina'],
  BRA: ['Brazil'],
  MAR: ['Morocco'],
  SCO: ['Scotland'],
  HAI: ['Haiti'],
  USA: ['USA', 'United States', 'United States of America'],
  TUR: ['Turkey', 'Türkiye', 'Turkiye'],
  AUS: ['Australia'],
  PAR: ['Paraguay'],
  GER: ['Germany'],
  ECU: ['Ecuador'],
  CIV: ['Ivory Coast', "Côte d'Ivoire", "Cote d'Ivoire"],
  CUW: ['Curaçao', 'Curacao'],
  NED: ['Netherlands', 'Holland'],
  JPN: ['Japan'],
  SWE: ['Sweden'],
  TUN: ['Tunisia'],
  BEL: ['Belgium'],
  IRN: ['Iran'],
  EGY: ['Egypt'],
  NZL: ['New Zealand'],
  ESP: ['Spain'],
  URU: ['Uruguay'],
  KSA: ['Saudi Arabia'],
  CPV: ['Cape Verde', 'Cabo Verde'],
  FRA: ['France'],
  SEN: ['Senegal'],
  NOR: ['Norway'],
  IRQ: ['Iraq'],
  ARG: ['Argentina'],
  AUT: ['Austria'],
  ALG: ['Algeria'],
  JOR: ['Jordan'],
  POR: ['Portugal'],
  COL: ['Colombia'],
  COD: ['DR Congo', 'Congo DR', 'Democratic Republic of the Congo', 'DRC'],
  UZB: ['Uzbekistan'],
  ENG: ['England'],
  CRO: ['Croatia'],
  PAN: ['Panama'],
  GHA: ['Ghana'],
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normaliseTeamName(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NORMALISED_TO_TLA: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [tla, aliases] of Object.entries(TLA_TO_ALIASES)) {
    for (const alias of aliases) {
      map[normaliseTeamName(alias)] = tla;
    }
  }
  return map;
})();

export function teamNameToTla(name: string): string | undefined {
  return NORMALISED_TO_TLA[normaliseTeamName(name)];
}

export const ALL_TEAM_TLAS: string[] = Object.keys(TLA_TO_ALIASES);

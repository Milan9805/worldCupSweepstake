import * as fs from 'fs';
import * as path from 'path';
import { teamNameToTla, normaliseTeamName, ALL_TEAM_TLAS } from '../teamNames';

interface SeedTeam {
  teamCode: string;
  name: string;
}

const SEED_PATH = path.resolve(__dirname, '../../../../data/seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')) as {
  teams: SeedTeam[];
};

describe('teamNames', () => {
  describe('coverage of seed data', () => {
    it('has a mapping for every team in seed.json', () => {
      const missing: string[] = [];
      for (const team of seed.teams) {
        if (!ALL_TEAM_TLAS.includes(team.teamCode)) {
          missing.push(`${team.teamCode} (${team.name})`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('has exactly the 48 World Cup teams from seed', () => {
      expect(ALL_TEAM_TLAS.sort()).toEqual(
        seed.teams.map((t) => t.teamCode).sort(),
      );
    });
  });

  describe('teamNameToTla', () => {
    it('maps common BBC names to TLAs', () => {
      expect(teamNameToTla('England')).toBe('ENG');
      expect(teamNameToTla('Brazil')).toBe('BRA');
      expect(teamNameToTla('USA')).toBe('USA');
      expect(teamNameToTla('United States')).toBe('USA');
      expect(teamNameToTla('South Korea')).toBe('KOR');
      expect(teamNameToTla('Korea Republic')).toBe('KOR');
    });

    it('is case-insensitive', () => {
      expect(teamNameToTla('england')).toBe('ENG');
      expect(teamNameToTla('ENGLAND')).toBe('ENG');
      expect(teamNameToTla(' Brazil ')).toBe('BRA');
    });

    it('handles diacritics', () => {
      expect(teamNameToTla('Türkiye')).toBe('TUR');
      expect(teamNameToTla('Turkiye')).toBe('TUR');
      expect(teamNameToTla('Curaçao')).toBe('CUW');
      expect(teamNameToTla('Curacao')).toBe('CUW');
      expect(teamNameToTla("Côte d'Ivoire")).toBe('CIV');
      expect(teamNameToTla("Cote d'Ivoire")).toBe('CIV');
      expect(teamNameToTla('Ivory Coast')).toBe('CIV');
    });

    it('handles punctuation variants', () => {
      expect(teamNameToTla('Bosnia & Herzegovina')).toBe('BIH');
      expect(teamNameToTla('Bosnia and Herzegovina')).toBe('BIH');
      expect(teamNameToTla('Bosnia-Herzegovina')).toBe('BIH');
    });

    it('returns undefined for placeholders and unknowns', () => {
      expect(teamNameToTla('Winner Group A')).toBeUndefined();
      expect(teamNameToTla('Runner-up Group B')).toBeUndefined();
      expect(teamNameToTla('Atlantis')).toBeUndefined();
      expect(teamNameToTla('')).toBeUndefined();
    });
  });

  describe('normaliseTeamName', () => {
    it('lowercases and trims whitespace', () => {
      expect(normaliseTeamName('  HELLO World  ')).toBe('hello world');
    });

    it('strips diacritics', () => {
      expect(normaliseTeamName('Türkiye')).toBe('turkiye');
      expect(normaliseTeamName('Curaçao')).toBe('curacao');
    });

    it('removes apostrophes and converts & to "and"', () => {
      expect(normaliseTeamName("Côte d'Ivoire")).toBe('cote divoire');
      expect(normaliseTeamName('A & B')).toBe('a and b');
    });
  });
});

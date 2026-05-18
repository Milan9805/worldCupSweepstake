import { fetchMatches } from '../clients/footballData';
import { getAllMatches, getAllTeams, putMatch, getConfig, putConfig } from '../db/dynamodb';
import { Match, Team } from '@sweepstake/shared';
import { generateTreeIfReady, processKnockoutResults } from './generateTree';

const REFRESH_COOLDOWN_MS = 60_000; // 60 seconds

export async function refreshData(): Promise<{ matches: Match[]; teams: Team[] }> {
  // Check rate limit
  const lastRefresh = await getConfig('lastRefreshTime');
  const now = Date.now();

  if (lastRefresh && now - parseInt(lastRefresh.value) < REFRESH_COOLDOWN_MS) {
    // Return cached data
    const matches = await getAllMatches() as unknown as Match[];
    const teams = await getAllTeams() as unknown as Team[];
    return { matches, teams };
  }

  try {
    // Fetch fresh data from football-data.org
    const freshMatches = await fetchMatches();

    // Update matches in DynamoDB
    for (const match of freshMatches) {
      if (match.matchId) {
        await putMatch(match);
      }
    }

    // Update last refresh time
    await putConfig('lastRefreshTime', String(now));
  } catch (error) {
    console.error('Error refreshing from external API:', error);
    // Fall through to return cached data
  }

  const matches = await getAllMatches() as unknown as Match[];
  const teams = await getAllTeams() as unknown as Team[];

  // Generate knockout bracket if group stage is complete
  await generateTreeIfReady();

  // Progress any finished knockout matches
  await processKnockoutResults(matches);

  return { matches, teams };
}

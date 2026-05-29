'use client';

import { Match, Team } from '@sweepstake/shared';
import { TeamMatchInfo } from '@/lib/teamMatches';
import { formatMatchDate, formatMatchTime } from '@/lib/format';

// Fallbacks for when the source omits a channel's colours.
const DEFAULT_CHANNEL_BG = '#374151';
const DEFAULT_CHANNEL_FG = '#ffffff';

interface TeamCardProps {
  team: Team;
  ownerName?: string;
  ownerImage?: string | null;
  groupPosition?: number;
  totalInGroup?: number;
  matchInfo?: TeamMatchInfo;
  teamsByCode?: Record<string, Team>;
  ownersByTeam?: Record<string, { name: string; imageUrl: string | null }>;
}

export default function TeamCard({ team, ownerName, ownerImage, groupPosition, totalInGroup: _totalInGroup, matchInfo, teamsByCode, ownersByTeam }: TeamCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        team.eliminated
          ? 'border-red-900/50 bg-black/40 opacity-60'
          : 'border-white/20 bg-black/30 hover:bg-black/40'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{team.flag}</span>
          <div>
            <h3 className="font-semibold text-sm text-white">{team.name}</h3>
            <span className="text-xs text-white/70">
              Group {team.groupLetter} • #{team.fifaRanking}
            </span>
          </div>
          {groupPosition && (
            <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${
              groupPosition <= 2 ? 'bg-green-700/60 text-green-200' :
              groupPosition === 3 ? 'bg-yellow-700/60 text-yellow-200' :
              'bg-red-800/60 text-red-200'
            }`}>
              {team.eliminated
                ? team.eliminatedAt?.replace(/_/g, ' ') || 'Out'
                : `${getOrdinal(groupPosition)} in group`}
            </span>
          )}
        </div>
        {team.eliminated && (
          <span className="text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded">
            Eliminated
            {team.eliminatedAt && ` (${team.eliminatedAt.replace(/_/g, ' ')})`}
          </span>
        )}
        {ownerName && (
          <div className="flex items-center gap-1">
            {ownerImage ? (
              <img
                src={ownerImage}
                alt={ownerName}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-accent/50 flex items-center justify-center text-xs">
                {ownerName[0]}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mt-3">
        <div className="text-center">
          <div className="text-white/70">P</div>
          <div className="font-medium text-white">{team.stats.points}</div>
        </div>
        <div className="text-center">
          <div className="text-white/70">W/D/L</div>
          <div className="font-medium text-white">
            {team.stats.wins}/{team.stats.draws}/{team.stats.losses}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/70">GD</div>
          <div className="font-medium text-white">
            {team.stats.goalDifference > 0 ? '+' : ''}
            {team.stats.goalDifference}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/70">GF/GA</div>
          <div className="font-medium text-white">
            {team.stats.goalsFor}/{team.stats.goalsAgainst}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/70">Cards</div>
          <div className="font-medium text-white">
            🟨{team.stats.yellowCards} 🟥{team.stats.redCards}
          </div>
        </div>
        {team.stats.possession !== null && (
          <div className="text-center">
            <div className="text-white/70">Poss</div>
            <div className="font-medium text-white">{team.stats.possession}%</div>
          </div>
        )}
      </div>

      <MatchInfoFooter team={team} matchInfo={matchInfo} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} />
    </div>
  );
}

function MatchInfoFooter({
  team,
  matchInfo,
  teamsByCode,
  ownersByTeam,
}: {
  team: Team;
  matchInfo?: TeamMatchInfo;
  teamsByCode?: Record<string, Team>;
  ownersByTeam?: Record<string, { name: string; imageUrl: string | null }>;
}) {
  if (!matchInfo) return null;
  const { live, next, previous } = matchInfo;
  if (!live && !next && !previous) return null;

  const opponentCode = (match: Match) =>
    match.homeTeam === team.teamCode ? match.awayTeam : match.homeTeam;

  const opponentLabel = (match: Match) => {
    const oppCode = opponentCode(match);
    const opp = teamsByCode?.[oppCode];
    return `${opp?.flag ?? ''} ${oppCode}`.trim();
  };

  // The group member who owns the opponent in this match, if any.
  const opponentOwner = (match: Match) => ownersByTeam?.[opponentCode(match)] ?? null;

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 text-xs">
      {live ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded animate-pulse shrink-0">
            LIVE
          </span>
          <span className="text-white font-medium">
            {live.homeTeam} {live.homeScore} - {live.awayScore} {live.awayTeam}
          </span>
          <OwnerTag owner={opponentOwner(live)} />
        </div>
      ) : (
        <>
          {previous && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/70 w-9 shrink-0">Last</span>
              <span className="text-white">
                {previous.homeTeam} {previous.homeScore} - {previous.awayScore}{' '}
                {previous.awayTeam}
              </span>
              <ResultTag team={team} match={previous} />
              <OwnerTag owner={opponentOwner(previous)} />
            </div>
          )}
          {next && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white/70 w-9 shrink-0">Next</span>
                <span className="text-white">
                  vs {opponentLabel(next)} · {formatMatchDate(next.datetime)},{' '}
                  {formatMatchTime(next.datetime)}
                </span>
                <OwnerTag owner={opponentOwner(next)} />
              </div>
              {next.channels && next.channels.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {next.channels.map((channel) => (
                    <span
                      key={channel.name}
                      style={{
                        backgroundColor: channel.bg || DEFAULT_CHANNEL_BG,
                        color: channel.fg || DEFAULT_CHANNEL_FG,
                      }}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm"
                    >
                      {channel.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Shows which group member owns the opponent, when the opponent belongs to one.
function OwnerTag({ owner }: { owner: { name: string; imageUrl: string | null } | null }) {
  if (!owner) return null;
  return (
    <span className="flex items-center gap-1 text-white/70 shrink-0">
      {owner.imageUrl ? (
        <img src={owner.imageUrl} alt={owner.name} className="w-4 h-4 rounded-full" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-accent/50 flex items-center justify-center text-[9px]">
          {owner.name[0]}
        </span>
      )}
      {owner.name}
    </span>
  );
}

function ResultTag({ team, match }: { team: Team; match: Match }) {
  if (match.homeScore === null || match.awayScore === null) return null;
  const isHome = match.homeTeam === team.teamCode;
  const teamScore = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;
  const outcome = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'D';
  const colour =
    outcome === 'W'
      ? 'bg-green-700/60 text-green-200'
      : outcome === 'L'
      ? 'bg-red-800/60 text-red-200'
      : 'bg-yellow-700/60 text-yellow-200';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colour}`}>{outcome}</span>
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

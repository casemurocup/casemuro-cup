import type { Match, MatchStatus, TeamCount } from '@/types/tournament';

export function totalRounds(teamCount: number): number {
  return Math.round(Math.log2(teamCount));
}

export function matchesInRound(teamCount: number, roundNumber: number): number {
  return teamCount / Math.pow(2, roundNumber);
}

export function roundName(matchCount: number): string {
  switch (matchCount) {
    case 32:
      return 'Treitaidosavos de Final';
    case 16:
      return 'Dieciseisavos de Final';
    case 8:
      return 'Octavos de Final';
    case 4:
      return 'Cuartos de Final';
    case 2:
      return 'Semifinal';
    case 1:
      return 'Final';
    default:
      return `Ronda de ${matchCount * 2}`;
  }
}

export function roundNamesForTeamCount(teamCount: number): string[] {
  const rounds = totalRounds(teamCount);
  const names: string[] = [];
  for (let r = 1; r <= rounds; r++) {
    names.push(roundName(matchesInRound(teamCount, r)));
  }
  return names;
}

export function matchStatus(match: Match): MatchStatus {
  if (match.winner_id) return 'completed';
  if (match.team1_id && match.team2_id) return 'ready';
  return 'pending';
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildBracketSkeleton(teamCount: TeamCount): { round_number: number; match_number: number }[] {
  const rounds = totalRounds(teamCount);
  const skeleton: { round_number: number; match_number: number }[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = matchesInRound(teamCount, r);
    for (let m = 1; m <= count; m++) {
      skeleton.push({ round_number: r, match_number: m });
    }
  }
  return skeleton;
}

export function groupMatchesByRound(matches: Match[]): Map<number, Match[]> {
  const map = new Map<number, Match[]>();
  for (const match of matches) {
    const list = map.get(match.round_number) ?? [];
    list.push(match);
    map.set(match.round_number, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.match_number - b.match_number);
  }
  return map;
}

export function formatTeamNumber(number: number, teamCount: number): string {
  const digits = String(teamCount).length;
  return String(number).padStart(digits, '0');
}

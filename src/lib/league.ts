import type { Match, Team } from '@/types/tournament';

export interface StandingRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;

/**
 * ¿Está jugado este partido?
 *
 * Un partido de liga cuenta para la clasificación en cuanto tiene marcador,
 * no cuando tiene ganador: un 1-1 es un resultado válido y `winner_id` queda
 * a NULL.
 */
export function isPlayed(match: Match): boolean {
  return match.team1_score != null && match.team2_score != null;
}

/**
 * Clasificación de la liga.
 *
 * Desempates, en este orden: puntos, diferencia de goles, goles a favor y
 * finalmente el nombre, para que el orden sea estable y no baile entre
 * recargas cuando dos equipos empatan en todo.
 */
export function buildStandings(teams: Team[], matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  for (const team of teams) {
    rows.set(team.id, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const match of matches) {
    if (!isPlayed(match) || !match.team1_id || !match.team2_id) continue;

    const home = rows.get(match.team1_id);
    const away = rows.get(match.team2_id);
    if (!home || !away) continue;

    const homeGoals = match.team1_score as number;
    const awayGoals = match.team2_score as number;

    home.played += 1;
    away.played += 1;

    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      home.won += 1;
      away.lost += 1;
      home.points += POINTS_WIN;
    } else if (awayGoals > homeGoals) {
      away.won += 1;
      home.lost += 1;
      away.points += POINTS_WIN;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    }
  }

  for (const row of rows.values()) {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      a.team.name.localeCompare(b.team.name, 'es'),
  );
}

/**
 * Agrupa los partidos por jornada, en orden.
 */
export function groupByMatchday(matches: Match[]): Map<number, Match[]> {
  const map = new Map<number, Match[]>();

  for (const match of matches) {
    const list = map.get(match.round_number) ?? [];
    list.push(match);
    map.set(match.round_number, list);
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.match_number - b.match_number);
  }

  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * Jornada que toca: la primera que tenga algún partido sin jugar.
 * Si están todos jugados, la última.
 */
export function currentMatchday(matches: Match[]): number {
  const byDay = groupByMatchday(matches);

  for (const [day, list] of byDay) {
    if (list.some((m) => !isPlayed(m))) return day;
  }

  return [...byDay.keys()].pop() ?? 1;
}

/**
 * La liga ha terminado cuando todos los partidos tienen marcador.
 */
export function isLeagueFinished(matches: Match[]): boolean {
  return matches.length > 0 && matches.every(isPlayed);
}

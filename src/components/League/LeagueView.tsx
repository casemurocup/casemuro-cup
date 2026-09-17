import { useState } from 'react';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  ListOrdered,
  Pencil,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useTournamentContext } from '@/context/TournamentContext';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { showToast } from '@/components/UI/Toast';

import {
  buildStandings,
  currentMatchday,
  groupByMatchday,
  isLeagueFinished,
  isPlayed,
} from '@/lib/league';

import type { Match } from '@/types/tournament';

export function LeagueView({ isAdmin }: { isAdmin: boolean }) {
  const { tournament, teams, matches } = useTournamentContext();

  const byDay = groupByMatchday(matches);
  const days = [...byDay.keys()];

  const [day, setDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<Match | null>(null);
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!tournament) return null;

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center">
        <ListOrdered className="mb-4 h-12 w-12 text-accent-400" />

        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          {tournament.name}
        </h1>

        <p className="mt-2 max-w-md text-sm text-slate-400">
          El calendario de la liga todavía no se ha generado.
          {isAdmin
            ? ' Genéralo desde Administración cuando tengas los equipos.'
            : ' La organización lo publicará en cuanto esté listo.'}
        </p>
      </div>
    );
  }

  const activeDay = day ?? currentMatchday(matches);
  const dayMatches = byDay.get(activeDay) ?? [];
  const standings = buildStandings(teams, matches);
  const finished = isLeagueFinished(matches);
  const champion = finished ? standings[0] : null;

  const teamOf = (id: string | null) =>
    teams.find((t) => t.id === id) ?? null;

  const openEditor = (match: Match) => {
    setEditing(match);
    setHomeGoals(match.team1_score ?? 0);
    setAwayGoals(match.team2_score ?? 0);
  };

  const saveScore = async () => {
    if (!editing) return;
    setSaving(true);

    const { error } = await supabase.rpc('set_match_score', {
      p_match_id: editing.id,
      p_team1_score: homeGoals,
      p_team2_score: awayGoals,
    });

    setSaving(false);

    if (error) {
      showToast(error.message || 'No se pudo guardar el resultado', 'error');
      return;
    }

    showToast('Resultado guardado');
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      {/* CABECERA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
            {tournament.name}
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Liga · {teams.length} equipos ·{' '}
            {tournament.double_round ? 'Ida y vuelta' : 'Una vuelta'} ·{' '}
            {days.length} jornadas
          </p>
        </div>

        {champion && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2">
            <Crown className="h-5 w-5 text-amber-400" />

            <span className="font-display text-sm font-bold uppercase tracking-wide text-amber-300">
              Campeón: {champion.team.name}
            </span>
          </div>
        )}
      </div>

      {/* CLASIFICACION */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-accent-400" />

          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            Clasificación
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                <th className="px-3 py-3 text-left font-bold">#</th>
                <th className="px-3 py-3 text-left font-bold">Equipo</th>
                <th className="px-2 py-3 text-center font-bold">PJ</th>
                <th className="px-2 py-3 text-center font-bold">G</th>
                <th className="px-2 py-3 text-center font-bold">E</th>
                <th className="px-2 py-3 text-center font-bold">P</th>
                <th className="px-2 py-3 text-center font-bold">GF</th>
                <th className="px-2 py-3 text-center font-bold">GC</th>
                <th className="px-2 py-3 text-center font-bold">DG</th>
                <th className="px-3 py-3 text-center font-bold text-accent-400">
                  PTS
                </th>
              </tr>
            </thead>

            <tbody>
              {standings.map((row, index) => (
                <tr
                  key={row.team.id}
                  className={`border-b border-slate-800/60 last:border-0 ${
                    index === 0 ? 'bg-accent-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 text-left font-bold text-slate-500">
                    {index + 1}
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <TeamLogo
                        logoUrl={row.team.logo_url}
                        name={row.team.name}
                        size="sm"
                      />

                      <span className="font-medium text-slate-100">
                        {row.team.name}
                      </span>
                    </div>
                  </td>

                  <td className="px-2 py-2.5 text-center text-slate-400">
                    {row.played}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-300">
                    {row.won}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-400">
                    {row.drawn}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-400">
                    {row.lost}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-400">
                    {row.goalsFor}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-400">
                    {row.goalsAgainst}
                  </td>
                  <td
                    className={`px-2 py-2.5 text-center ${
                      row.goalDiff > 0
                        ? 'text-emerald-400'
                        : row.goalDiff < 0
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {row.goalDiff > 0 ? '+' : ''}
                    {row.goalDiff}
                  </td>
                  <td className="px-3 py-2.5 text-center font-display text-base font-bold text-accent-400">
                    {row.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CALENDARIO */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-5 w-5 text-accent-400" />

          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            Jornada {activeDay}
          </h2>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setDay(Math.max(1, activeDay - 1))}
              disabled={activeDay <= (days[0] ?? 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 transition hover:text-slate-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <select
              value={activeDay}
              onChange={(e) => setDay(Number(e.target.value))}
              className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent-500/50"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  Jornada {d}
                </option>
              ))}
            </select>

            <button
              onClick={() =>
                setDay(Math.min(days[days.length - 1] ?? 1, activeDay + 1))
              }
              disabled={activeDay >= (days[days.length - 1] ?? 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 transition hover:text-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {dayMatches.map((match) => {
            const home = teamOf(match.team1_id);
            const away = teamOf(match.team2_id);
            const played = isPlayed(match);

            return (
              <div
                key={match.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
              >
                <div className="flex flex-1 items-center gap-2 overflow-hidden">
                  <TeamLogo
                    logoUrl={home?.logo_url ?? null}
                    name={home?.name ?? '?'}
                    size="sm"
                  />
                  <span className="truncate text-sm text-slate-200">
                    {home?.name ?? 'Por determinar'}
                  </span>
                </div>

                <div className="shrink-0 px-2 text-center">
                  {played ? (
                    <span className="font-display text-lg font-bold text-slate-100">
                      {match.team1_score} - {match.team2_score}
                    </span>
                  ) : (
                    <span className="font-display text-sm font-bold text-slate-600">
                      VS
                    </span>
                  )}
                </div>

                <div className="flex flex-1 items-center justify-end gap-2 overflow-hidden">
                  <span className="truncate text-right text-sm text-slate-200">
                    {away?.name ?? 'Por determinar'}
                  </span>
                  <TeamLogo
                    logoUrl={away?.logo_url ?? null}
                    name={away?.name ?? '?'}
                    size="sm"
                  />
                </div>

                {isAdmin && (
                  <button
                    onClick={() => openEditor(match)}
                    title="Anotar resultado"
                    className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-500 transition hover:border-accent-500/40 hover:text-accent-400"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* EDITOR DE RESULTADO (solo administración) */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink-200/80 backdrop-blur-md"
            onClick={() => setEditing(null)}
          />

          <div className="relative w-full max-w-md animate-scale-in rounded-2xl border border-accent-500/20 bg-gradient-to-br from-ink-100 to-ink-200 p-6 shadow-2xl glow-ring">
            <h2 className="mb-5 font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
              Anotar resultado
            </h2>

            <div className="flex items-center justify-center gap-5 py-4">
              <div className="flex flex-col items-center gap-2">
                <TeamLogo
                  logoUrl={teamOf(editing.team1_id)?.logo_url ?? null}
                  name={teamOf(editing.team1_id)?.name ?? '?'}
                  size="lg"
                />
                <span className="max-w-[8rem] truncate text-xs font-bold uppercase tracking-wide text-slate-300">
                  {teamOf(editing.team1_id)?.name}
                </span>
                <input
                  type="number"
                  min={0}
                  value={homeGoals}
                  onChange={(e) =>
                    setHomeGoals(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-center text-2xl font-bold text-slate-100 outline-none focus:border-accent-500/50"
                />
              </div>

              <span className="font-display text-xl font-bold text-slate-500">
                -
              </span>

              <div className="flex flex-col items-center gap-2">
                <TeamLogo
                  logoUrl={teamOf(editing.team2_id)?.logo_url ?? null}
                  name={teamOf(editing.team2_id)?.name ?? '?'}
                  size="lg"
                />
                <span className="max-w-[8rem] truncate text-xs font-bold uppercase tracking-wide text-slate-300">
                  {teamOf(editing.team2_id)?.name}
                </span>
                <input
                  type="number"
                  min={0}
                  value={awayGoals}
                  onChange={(e) =>
                    setAwayGoals(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-center text-2xl font-bold text-slate-100 outline-none focus:border-accent-500/50"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancelar
              </button>

              <button
                onClick={saveScore}
                disabled={saving}
                className="btn-shine rounded-lg bg-gradient-to-r from-accent-500 to-accent-400 px-5 py-2 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-accent-500/20 transition hover:scale-[1.03] active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

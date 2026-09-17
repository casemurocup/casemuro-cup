import { LayoutGrid, ListOrdered, Trophy } from 'lucide-react';

import { useTournamentContext } from '@/context/TournamentContext';
import { Bracket } from '@/components/Bracket/Bracket';
import { LeagueView } from '@/components/League/LeagueView';

import type { View } from '@/types/tournament';

/**
 * Contenedor de competiciones.
 *
 * Hoy solo hay un torneo activo, así que esta pantalla muestra el selector con
 * esa competición y debajo la vista que le corresponde: el cuadro si es una
 * copa, la clasificación si es una liga. El selector se mantiene aunque solo
 * haya una para que se vea de qué competición se están viendo los datos.
 */
export function CompetitionsPage({
  onNavigate,
  isAdmin,
}: {
  onNavigate: (view: View) => void;
  isAdmin: boolean;
}) {
  const { tournament, loading } = useTournamentContext();

  if (loading || !tournament) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-slate-500">Cargando competiciones...</p>
      </div>
    );
  }

  const isLeague = tournament.format === 'league';

  return (
    <div className="space-y-5">
      {/* SELECTOR DE COMPETICION */}
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 shrink-0 text-accent-400" />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-accent-500/50 bg-accent-500/15 px-4 py-2.5 text-left transition"
          >
            {isLeague ? (
              <ListOrdered className="h-4 w-4 text-accent-400" />
            ) : (
              <LayoutGrid className="h-4 w-4 text-accent-400" />
            )}

            <span className="flex flex-col leading-tight">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-slate-100">
                {tournament.name}
              </span>

              <span className="text-[10px] font-bold uppercase tracking-widest text-accent-400">
                {isLeague ? 'Liga' : 'Copa'}
              </span>
            </span>
          </button>
        </div>
      </div>

      {isLeague ? (
        <LeagueView isAdmin={isAdmin} />
      ) : (
        <Bracket onNavigate={onNavigate} isAdmin={isAdmin} />
      )}
    </div>
  );
}

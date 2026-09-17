import { useEffect, useState } from 'react';
import { Calendar, Clock, Trophy, MapPin, Users, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTournamentContext } from '@/context/TournamentContext';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { matchRoundLabel } from '@/lib/bracket';
import type { Match, MatchResult } from '@/types/tournament';

interface MatchDetailViewProps {
  match: Match;
}

export function MatchDetailView({ match }: MatchDetailViewProps) {
  const { tournament, teams } = useTournamentContext();
  const [result, setResult] = useState<MatchResult | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('match_results')
        .select('*')
        .eq('match_id', match.id)
        .maybeSingle();
      setResult(data as MatchResult | null);
    };
    load();

    const channel = supabase
      .channel(`match-result-${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_results', filter: `match_id=eq.${match.id}` }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [match.id]);

  const team1 = teams.find((t) => t.id === match.team1_id) ?? null;
  const team2 = teams.find((t) => t.id === match.team2_id) ?? null;
  const round = matchRoundLabel(tournament?.format ?? 'cup', tournament?.team_count ?? 32, match.round_number);

  const formatDate = (d: string | null) => {
    if (!d) return 'Por determinar';
    return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (t: string | null) => t ? t.slice(0, 5) : 'Por determinar';

  const stateLabel = () => {
    if (match.winner_id) return 'Finalizado';
    if (match.match_state === 'pending_review') return 'Resultado pendiente';
    if (match.match_state === 'in_progress') return 'En juego';
    if (match.team1_id && match.team2_id) return 'Pendiente';
    return 'Esperando rival';
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-sky-400" />
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            {round}
          </h3>
          <span className="ml-auto rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            {stateLabel()}
          </span>
        </div>

        {/* Teams + score */}
        <div className="flex items-center justify-center gap-6 py-6">
          <div className="flex flex-col items-center gap-2">
            {team1 ? (
              <>
                <TeamLogo logoUrl={team1.logo_url} name={team1.name} size="xl" glow={match.winner_id === team1.id} />
                <span className="text-sm font-bold uppercase tracking-wide text-slate-200">{team1.name}</span>
              </>
            ) : (
              <span className="text-sm text-slate-500">Por determinar</span>
            )}
          </div>

          <div className="flex flex-col items-center">
            {result ? (
              <span className="font-display text-4xl font-bold text-slate-100">
                {result.team1_score} <span className="text-slate-600">-</span> {result.team2_score}
              </span>
            ) : match.winner_id ? (
              <span className="font-display text-2xl font-bold text-slate-500">Finalizado</span>
            ) : (
              <span className="font-display text-2xl font-bold text-slate-600">VS</span>
            )}
            {result?.had_penalties && (
              <span className="mt-1 text-xs font-bold text-amber-400">
                Penaltis: {result.penalty_team1} - {result.penalty_team2}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            {team2 ? (
              <>
                <TeamLogo logoUrl={team2.logo_url} name={team2.name} size="xl" glow={match.winner_id === team2.id} />
                <span className="text-sm font-bold uppercase tracking-wide text-slate-200">{team2.name}</span>
              </>
            ) : (
              <span className="text-sm text-slate-500">Por determinar</span>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoRow icon={Calendar} label="Fecha" value={formatDate(match.scheduled_date)} />
          <InfoRow icon={Clock} label="Hora" value={formatTime(match.scheduled_time)} />
          <InfoRow icon={Users} label={tournament?.format === 'league' ? "Jornada" : "Ronda"} value={round} />
          <InfoRow icon={MapPin} label="Estado" value={stateLabel()} />
        </div>
      </div>

      {/* Result details */}
      {result && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-400" />
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-slate-100">Detalles del resultado</h3>
          </div>

          <div className="space-y-3">
            {result.had_extra_time && (
              <p className="text-sm text-slate-400">El partido fue a la prórroga.</p>
            )}
            {result.had_penalties && (
              <p className="text-sm text-slate-400">Se decidió en la tanda de penaltis.</p>
            )}

            {result.scorers.length > 0 && (
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Goleadores</span>
                <div className="space-y-1">
                  {result.scorers.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <span className="text-sm text-slate-200">{s.player}</span>
                      {s.minute != null && <span className="text-xs font-bold text-slate-500">{s.minute}'</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.notes && (
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Notas</span>
                <p className="text-sm text-slate-400">{result.notes}</p>
              </div>
            )}

            <div className="pt-2">
              <span className={`inline-block rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                result.status === 'confirmed' ? 'bg-emerald-500/15 text-emerald-400' :
                result.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                'bg-amber-500/15 text-amber-400'
              }`}>
                {result.status === 'confirmed' ? 'Confirmado' : result.status === 'rejected' ? 'Rechazado' : 'Pendiente de revisión'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-bold text-slate-200">{value}</p>
    </div>
  );
}

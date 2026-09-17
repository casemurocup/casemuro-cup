import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle,
  Check,
  ClipboardList,
  ExternalLink,
  X,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useTournamentContext } from '@/context/TournamentContext';
import { showToast } from '@/components/UI/Toast';

import {
  INCIDENT_CATEGORY_LABEL,
  INCIDENT_STATUS_LABEL,
  isSafeUrl,
} from '@/lib/incidents';

import type {
  Captain,
  Incident,
  IncidentStatus,
  MatchResult,
} from '@/types/tournament';

const STATUS_FILTERS: { value: IncidentStatus; label: string }[] = [
  { value: 'open', label: 'Abiertas' },
  { value: 'reviewing', label: 'En revisión' },
  { value: 'resolved', label: 'Resueltas' },
  { value: 'dismissed', label: 'Descartadas' },
];

export function IncidentManagement() {
  const { teams, matches } = useTournamentContext();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<IncidentStatus>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [incidentsRes, resultsRes, captainsRes] = await Promise.all([
      supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('match_results')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('captains').select('*'),
    ]);

    setIncidents((incidentsRes.data ?? []) as Incident[]);
    setResults((resultsRes.data ?? []) as MatchResult[]);
    setCaptains((captainsRes.data ?? []) as Captain[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel('incidents-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_results' },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const teamName = (id: string | null) =>
    teams.find((t) => t.id === id)?.name ?? 'Sin equipo';

  const captainName = (id: string | null) =>
    captains.find((c) => c.id === id)?.name ?? 'Capitán';

  const matchLabel = (id: string | null) => {
    if (!id) return null;
    const match = matches.find((m) => m.id === id);
    if (!match) return null;

    return `Ronda ${match.round_number} · ${teamName(match.team1_id)} vs ${teamName(match.team2_id)}`;
  };

  const resolve = async (
    incidentId: string,
    status: IncidentStatus,
  ) => {
    setBusyId(incidentId);

    const { error } = await supabase.rpc('resolve_incident', {
      p_incident_id: incidentId,
      p_status: status,
      p_notes: notes[incidentId]?.trim() || null,
    });

    setBusyId(null);

    if (error) {
      showToast('No se pudo actualizar la incidencia', 'error');
      return;
    }

    showToast('Incidencia actualizada');
    setNotes((prev) => ({ ...prev, [incidentId]: '' }));
    load();
  };

  const reviewResult = async (
    resultId: string,
    status: 'confirmed' | 'rejected',
  ) => {
    setBusyId(resultId);

    const { error } = await supabase.rpc('review_match_result', {
      p_result_id: resultId,
      p_status: status,
    });

    setBusyId(null);

    if (error) {
      showToast('No se pudo validar el resultado', 'error');
      return;
    }

    showToast(
      status === 'confirmed' ? 'Resultado confirmado' : 'Resultado rechazado',
    );
    load();
  };

  const visibleIncidents = incidents.filter((i) => i.status === filter);
  const pendingResults = results.filter((r) => r.status === 'pending_review');
  const openCount = incidents.filter((i) => i.status === 'open').length;

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Cargando incidencias...
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ================= RESULTADOS PENDIENTES ================= */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-sky-400" />

          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            Resultados por validar
          </h2>

          {pendingResults.length > 0 && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-300">
              {pendingResults.length}
            </span>
          )}
        </div>

        <p className="text-sm text-slate-500">
          Validar un resultado lo deja registrado como confirmado. Quién pasa de
          ronda se sigue decidiendo desde el cuadro.
        </p>

        {pendingResults.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 py-10 text-center text-sm text-slate-500">
            No hay resultados pendientes de validar.
          </div>
        ) : (
          pendingResults.map((result) => {
            const match = matches.find((m) => m.id === result.match_id);

            return (
              <div
                key={result.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold uppercase tracking-wide text-slate-100">
                      {teamName(match?.team1_id ?? null)}{' '}
                      <span className="text-accent-400">
                        {result.team1_score} - {result.team2_score}
                      </span>{' '}
                      {teamName(match?.team2_id ?? null)}
                    </p>

                    <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">
                      {matchLabel(result.match_id) ?? 'Partido'} · Reportado por{' '}
                      {captainName(result.reported_by)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewResult(result.id, 'confirmed')}
                      disabled={busyId === result.id}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" /> Confirmar
                    </button>

                    <button
                      onClick={() => reviewResult(result.id, 'rejected')}
                      disabled={busyId === result.id}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" /> Rechazar
                    </button>
                  </div>
                </div>

                {(result.had_extra_time || result.had_penalties) && (
                  <p className="mt-2 text-xs text-slate-400">
                    {result.had_extra_time && 'Prórroga'}
                    {result.had_extra_time && result.had_penalties && ' · '}
                    {result.had_penalties &&
                      `Penaltis ${result.penalty_team1 ?? 0} - ${result.penalty_team2 ?? 0}`}
                  </p>
                )}

                {result.scorers.length > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Goleadores:{' '}
                    {result.scorers
                      .map(
                        (s) =>
                          `${s.player}${s.minute != null ? ` (${s.minute}')` : ''}`,
                      )
                      .join(', ')}
                  </p>
                )}

                {result.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                    {result.notes}
                  </p>
                )}

                {result.evidence_url && isSafeUrl(result.evidence_url) && (
                  <a
                    href={result.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:border-accent-500/40 hover:text-accent-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver prueba
                  </a>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* ================= INCIDENCIAS ================= */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-accent-400" />

          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            Incidencias
          </h2>

          {openCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">
              {openCount} abiertas
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                filter === f.value
                  ? 'border-accent-500/50 bg-accent-500/15 text-accent-400'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visibleIncidents.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 py-10 text-center text-sm text-slate-500">
            No hay incidencias en este estado.
          </div>
        ) : (
          visibleIncidents.map((incident) => {
            const badge = INCIDENT_STATUS_LABEL[incident.status];
            const label = matchLabel(incident.match_id);

            return (
              <div
                key={incident.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-bold uppercase tracking-wide text-slate-100">
                      {incident.subject}
                    </h3>

                    <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">
                      {INCIDENT_CATEGORY_LABEL[incident.category]} ·{' '}
                      {captainName(incident.captain_id)} ·{' '}
                      {teamName(incident.team_id)}
                      {label && ` · ${label}`}
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                  {incident.description}
                </p>

                {incident.evidence_url && isSafeUrl(incident.evidence_url) && (
                  <a
                    href={incident.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:border-accent-500/40 hover:text-accent-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver prueba
                  </a>
                )}

                {incident.resolution_notes && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Respuesta enviada
                    </p>

                    <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-200/90">
                      {incident.resolution_notes}
                    </p>
                  </div>
                )}

                {/* ACCIONES */}
                <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                  <textarea
                    value={notes[incident.id] ?? ''}
                    rows={2}
                    maxLength={1000}
                    onChange={(e) =>
                      setNotes((prev) => ({
                        ...prev,
                        [incident.id]: e.target.value,
                      }))
                    }
                    placeholder="Respuesta para el capitán (opcional)"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/30"
                  />

                  <div className="flex flex-wrap gap-2">
                    {incident.status !== 'reviewing' && (
                      <button
                        onClick={() => resolve(incident.id, 'reviewing')}
                        disabled={busyId === incident.id}
                        className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-accent-400 transition hover:bg-accent-500/20 disabled:opacity-40"
                      >
                        En revisión
                      </button>
                    )}

                    <button
                      onClick={() => resolve(incident.id, 'resolved')}
                      disabled={busyId === incident.id}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" /> Resolver
                    </button>

                    <button
                      onClick={() => resolve(incident.id, 'dismissed')}
                      disabled={busyId === incident.id}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" /> Descartar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle,
  Check,
  ClipboardList,
  ExternalLink,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useTournamentContext } from '@/context/TournamentContext';
import { showToast } from '@/components/UI/Toast';
import { ConfirmationModal } from '@/components/UI/ConfirmationModal';

import {
  INCIDENT_CATEGORY_LABEL,
  INCIDENT_STATUS_LABEL,
  isSafeUrl,
} from '@/lib/incidents';

import type {
  Captain,
  Incident,
  IncidentStatus,
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
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<IncidentStatus>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Incident | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const load = useCallback(async () => {
    const [incidentsRes, captainsRes] = await Promise.all([
      supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('captains').select('*'),
    ]);

    setIncidents((incidentsRes.data ?? []) as Incident[]);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const teamName = (id: string | null) =>
    teams.find((t) => t.id === id)?.name ?? 'Sin equipo';

  const captainName = (id: string | null) =>
    captains.find((c) => c.id === id)?.name ?? 'Capitán';

  const matchFor = (id: string | null) =>
    id ? (matches.find((m) => m.id === id) ?? null) : null;

  const matchLabel = (id: string | null) => {
    const match = matchFor(id);
    if (!match) return null;

    return `Ronda ${match.round_number} · ${teamName(match.team1_id)} vs ${teamName(match.team2_id)}`;
  };

  const resolve = async (incidentId: string, status: IncidentStatus) => {
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

  /**
   * Da por bueno el resultado reportado y clasifica al ganador en el cuadro.
   */
  const confirmResult = async (
    incidentId: string,
    winnerTeamId: string,
  ) => {
    setBusyId(incidentId);

    const { error } = await supabase.rpc('resolve_incident_result', {
      p_incident_id: incidentId,
      p_winner_team_id: winnerTeamId,
    });

    setBusyId(null);

    if (error) {
      showToast(error.message || 'No se pudo validar el resultado', 'error');
      return;
    }

    showToast(`${teamName(winnerTeamId)} clasificado en el cuadro`);
    load();
  };

  const remove = async (incident: Incident) => {
    setConfirmDelete(null);
    setBusyId(incident.id);

    const { error } = await supabase
      .from('incidents')
      .delete()
      .eq('id', incident.id);

    setBusyId(null);

    if (error) {
      showToast('No se pudo eliminar la incidencia', 'error');
      return;
    }

    showToast('Incidencia eliminada');
    load();
  };

  const purgeDismissed = async () => {
    setConfirmPurge(false);

    const { error } = await supabase
      .from('incidents')
      .delete()
      .eq('status', 'dismissed');

    if (error) {
      showToast('No se pudieron eliminar las incidencias', 'error');
      return;
    }

    showToast('Incidencias descartadas eliminadas');
    load();
  };

  /**
   * Reportes de resultado todavía sin validar. Son incidencias como las
   * demás, pero se muestran aparte porque se resuelven de otra forma:
   * eligiendo ganador.
   */
  const pendingResults = incidents.filter(
    (i) =>
      i.category === 'resultado' &&
      (i.status === 'open' || i.status === 'reviewing'),
  );

  const visibleIncidents = incidents.filter(
    (i) =>
      i.status === filter &&
      !(
        i.category === 'resultado' &&
        (i.status === 'open' || i.status === 'reviewing')
      ),
  );

  const openCount = incidents.filter((i) => i.status === 'open').length;
  const dismissedCount = incidents.filter(
    (i) => i.status === 'dismissed',
  ).length;

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Cargando incidencias...
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ================= RESULTADOS POR VALIDAR ================= */}
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
          Los capitanes los reportan desde Incidencias. Elige quién ha ganado:
          el equipo se coloca solo en la siguiente ronda del cuadro.
        </p>

        {pendingResults.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 py-10 text-center text-sm text-slate-500">
            No hay resultados pendientes de validar.
          </div>
        ) : (
          pendingResults.map((incident) => {
            const match = matchFor(incident.match_id);
            const isOwnTeam1 = match?.team1_id === incident.team_id;

            /* El marcador se guarda desde el punto de vista de quien reporta. */
            const team1Score = isOwnTeam1
              ? incident.score_own
              : incident.score_rival;
            const team2Score = isOwnTeam1
              ? incident.score_rival
              : incident.score_own;

            return (
              <div
                key={incident.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold uppercase tracking-wide text-slate-100">
                      {teamName(match?.team1_id ?? null)}{' '}
                      <span className="text-accent-400">
                        {team1Score} - {team2Score}
                      </span>{' '}
                      {teamName(match?.team2_id ?? null)}
                    </p>

                    <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">
                      {matchLabel(incident.match_id) ?? 'Partido'} · Reportado
                      por {captainName(incident.captain_id)} (
                      {teamName(incident.team_id)})
                    </p>
                  </div>

                  <button
                    onClick={() => resolve(incident.id, 'dismissed')}
                    disabled={busyId === incident.id}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                  >
                    <X className="h-4 w-4" /> Descartar
                  </button>
                </div>

                {incident.description && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                    {incident.description}
                  </p>
                )}

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

                {/* QUIÉN GANA Y PASA DE RONDA */}
                <div className="mt-4 border-t border-slate-800 pt-4">
                  {match?.winner_id ? (
                    <p className="text-sm text-slate-400">
                      Este partido ya está clasificado:{' '}
                      <span className="font-bold text-emerald-300">
                        {teamName(match.winner_id)}
                      </span>
                      . Para cambiarlo, deshazlo antes desde el cuadro.
                    </p>
                  ) : !match?.team1_id || !match?.team2_id ? (
                    <p className="text-sm text-slate-500">
                      El partido todavía no tiene los dos equipos asignados.
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        Validar y clasificar en el cuadro
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {[match.team1_id, match.team2_id].map((teamId) => {
                          const ownScore = isOwnTeam1 ? team1Score : team2Score;
                          const otherScore = isOwnTeam1
                            ? team2Score
                            : team1Score;

                          const reportedWinner =
                            ownScore != null &&
                            otherScore != null &&
                            ownScore !== otherScore
                              ? ownScore > otherScore
                                ? incident.team_id
                                : match.team1_id === incident.team_id
                                  ? match.team2_id
                                  : match.team1_id
                              : null;

                          const reported = reportedWinner === teamId;

                          return (
                            <button
                              key={teamId}
                              onClick={() =>
                                confirmResult(incident.id, teamId as string)
                              }
                              disabled={busyId === incident.id}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                                reported
                                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                                  : 'border-slate-700 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-300'
                              }`}
                            >
                              <Trophy className="h-4 w-4" />
                              Gana {teamName(teamId)}
                              {reported && (
                                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px]">
                                  reportado
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
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

        <div className="flex flex-wrap items-center gap-2">
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

          {filter === 'dismissed' && dismissedCount > 0 && (
            <button
              onClick={() => setConfirmPurge(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" /> Vaciar descartadas (
              {dismissedCount})
            </button>
          )}
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
                  {incident.status !== 'dismissed' && (
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
                  )}

                  <div className="flex flex-wrap gap-2">
                    {incident.status !== 'reviewing' &&
                      incident.status !== 'dismissed' && (
                        <button
                          onClick={() => resolve(incident.id, 'reviewing')}
                          disabled={busyId === incident.id}
                          className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-accent-400 transition hover:bg-accent-500/20 disabled:opacity-40"
                        >
                          En revisión
                        </button>
                      )}

                    {incident.status !== 'resolved' && (
                      <button
                        onClick={() => resolve(incident.id, 'resolved')}
                        disabled={busyId === incident.id}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" /> Resolver
                      </button>
                    )}

                    {incident.status !== 'dismissed' && (
                      <button
                        onClick={() => resolve(incident.id, 'dismissed')}
                        disabled={busyId === incident.id}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
                      >
                        <X className="h-4 w-4" /> Descartar
                      </button>
                    )}

                    {/* Solo se borra lo descartado: lo resuelto es el histórico */}
                    {incident.status === 'dismissed' && (
                      <button
                        onClick={() => setConfirmDelete(incident)}
                        disabled={busyId === incident.id}
                        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      <ConfirmationModal
        open={!!confirmDelete}
        title="Eliminar incidencia"
        description={`Se borrará definitivamente "${confirmDelete?.subject ?? ''}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmationModal
        open={confirmPurge}
        title="Vaciar descartadas"
        description={`Se borrarán definitivamente las ${dismissedCount} incidencias descartadas. Las abiertas, en revisión y resueltas no se tocan. Esta acción no se puede deshacer.`}
        confirmLabel="Vaciar"
        destructive
        onConfirm={purgeDismissed}
        onCancel={() => setConfirmPurge(false)}
      />
    </div>
  );
}

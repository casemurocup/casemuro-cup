import { useEffect, useState } from 'react';
import { Check, X, UserCog, Mail, Shield, Crown, User, Unlink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTournamentContext } from '@/context/TournamentContext';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { showToast } from '@/components/UI/Toast';
import type { Captain, CaptainStatus } from '@/types/tournament';

export function CaptainManagement() {
  const { teams } = useTournamentContext();
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from('captains').select('*').order('created_at', { ascending: false });
    setCaptains((data ?? []) as Captain[]);
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel('captains-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'captains' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateStatus = async (id: string, status: CaptainStatus) => {
    const { error } = await supabase.rpc('update_captain_status', {
      p_captain_id: id,
      p_status: status,
    });
    if (error) {
      showToast('Error al actualizar', 'error');
      return;
    }
    showToast(status === 'approved' ? 'Capitán aprobado' : status === 'rejected' ? 'Capitán rechazado' : 'Capitán pendiente');
    load();
  };

  const assignTeam = async (captainId: string, teamId: string) => {
    if (!teamId) {
      showToast('Selecciona un equipo', 'error');
      return;
    }
    const { error } = await supabase.rpc('assign_captain_to_team', {
      p_captain_id: captainId,
      p_team_id: teamId,
    });
    if (error) {
      showToast(error.message.includes('ya tiene 2 capitanes') ? 'Ese equipo ya tiene 2 capitanes' : 'Error al asignar equipo', 'error');
      return;
    }
    showToast('Equipo asignado');
    load();
  };

  const unassignTeam = async (captainId: string) => {
    const { error } = await supabase.rpc('unassign_captain_team', {
      p_captain_id: captainId,
    });
    if (error) {
      showToast('Error al quitar equipo', 'error');
      return;
    }
    showToast('Equipo quitado');
    load();
  };

  const teamFor = (c: Captain) => teams.find((t) => t.id === c.team_id) ?? null;
  // Equipos disponibles: los que tienen 0 o 1 capitán asignado (nunca 2)
  const availableTeams = teams.filter((t) => {
    const count = captains.filter((c) => c.team_id === t.id).length;
    return count < 2;
  });

  if (loading) {
    return <div className="py-20 text-center text-slate-500">Cargando capitanes...</div>;
  }

  const pending = captains.filter((c) => c.status === 'pending');
  const approved = captains.filter((c) => c.status === 'approved');
  const rejected = captains.filter((c) => c.status === 'rejected');

  const renderCaptain = (c: Captain) => {
    const team = teamFor(c);
    const teamCaptains = team ? captains.filter((cap) => cap.team_id === team.id) : [];
    const isSecondary = c.captain_role === 'secondary';

    // Equipos disponibles para este capitán: los que tienen <2 capitanes, más su equipo actual
    const teamsForThisCaptain = availableTeams.filter((t) => t.id !== c.team_id);
    const allOptions = team ? [team, ...teamsForThisCaptain] : teamsForThisCaptain;

    return (
      <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
              <UserCog className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-slate-200">{c.name}</p>
                {team && (
                  isSecondary ? (
                    <span className="flex items-center gap-0.5 rounded bg-slate-700/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      <User className="h-2.5 w-2.5" /> 2º
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-400">
                      <Crown className="h-2.5 w-2.5" /> 1º
                    </span>
                  )
                )}
              </div>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Mail className="h-3 w-3" /> {c.email}
              </p>
            </div>
          </div>
          <StatusBadge status={c.status} />
        </div>

        {/* Team assignment */}
        <div className="mt-3 space-y-2">
          {team ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2">
                <TeamLogo logoUrl={team.logo_url} name={team.name} size="sm" />
                <span className="text-sm font-bold text-slate-200">{team.name}</span>
              </div>
              {teamCaptains.length > 1 && (
                <span className="text-[10px] text-slate-500">{teamCaptains.length} capitanes</span>
              )}
              <button
                onClick={() => unassignTeam(c.id)}
                title="Quitar equipo"
                className="ml-auto flex items-center justify-center rounded-lg border border-slate-700 p-2 text-slate-500 transition hover:border-red-500/40 hover:text-red-400"
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Sin equipo</span>
          )}
          <select
            value={c.team_id ?? ''}
            onChange={(e) => e.target.value ? assignTeam(c.id, e.target.value) : unassignTeam(c.id)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500/50"
          >
            <option value="">Sin equipo</option>
            {allOptions.map((t) => {
              const count = captains.filter((cap) => cap.team_id === t.id).length;
              return (
                <option key={t.id} value={t.id}>
                  {t.name}{count > 0 && t.id !== c.team_id ? ` (${count}/2 capitanes)` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Actions */}
        {c.status !== 'approved' && (
          <button
            onClick={() => updateStatus(c.id, 'approved')}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-400 transition hover:bg-emerald-500/25"
          >
            <Check className="h-3.5 w-3.5" /> Aprobar
          </button>
        )}
        {c.status !== 'rejected' && (
          <button
            onClick={() => updateStatus(c.id, 'rejected')}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-400 transition hover:bg-red-500/25"
          >
            <X className="h-3.5 w-3.5" /> Rechazar
          </button>
        )}
        {c.status === 'rejected' && (
          <button
            onClick={() => updateStatus(c.id, 'pending')}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:text-slate-200"
          >
            Reabrir solicitud
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-accent-400" />
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">Gestión de capitanes</h2>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
        Cada equipo puede tener hasta <span className="font-bold text-sky-400">2 capitanes</span>: un capitán principal (1º) y un secundario (2º).
        Si quitas al principal, el secundario pasa a ser automáticamente el principal.
      </div>

      {captains.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-slate-500">
          No hay solicitudes de capitán registradas.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-400">Pendientes ({pending.length})</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pending.map(renderCaptain)}
              </div>
            </div>
          )}
          {approved.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-400">Aprobados ({approved.length})</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {approved.map(renderCaptain)}
              </div>
            </div>
          )}
          {rejected.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-red-400">Rechazados ({rejected.length})</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rejected.map(renderCaptain)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CaptainStatus }) {
  const map: Record<CaptainStatus, { label: string; class: string }> = {
    pending: { label: 'Pendiente', class: 'bg-amber-500/15 text-amber-400' },
    approved: { label: 'Aprobado', class: 'bg-emerald-500/15 text-emerald-400' },
    rejected: { label: 'Rechazado', class: 'bg-red-500/15 text-red-400' },
  };
  const { label, class: cls } = map[status];
  return <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>;
}

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, RotateCcw, Users, Sparkles, UserCog, AlertTriangle, CalendarDays } from 'lucide-react';
import { useTournamentContext } from '@/context/TournamentContext';
import { TeamCard } from '@/components/Teams/TeamCard';
import { TeamForm } from '@/components/Teams/TeamForm';
import { ConfirmationModal } from '@/components/UI/ConfirmationModal';
import { StatCard } from '@/components/UI/StatCard';
import { BroadcastButton } from '@/components/UI/BroadcastButton';
import { showToast } from '@/components/UI/Toast';
import { CaptainManagement } from '@/components/Admin/CaptainManagement';
import { IncidentManagement } from '@/components/Admin/IncidentManagement';
import type { Team, TeamCount, TournamentFormat } from '@/types/tournament';

const DEMO_TEAMS = [
  'Real Madrid', 'Barcelona', 'Atlético Madrid', 'Valencia', 'Sevilla', 'Athletic Club',
  'Real Sociedad', 'Villarreal', 'Real Betis', 'Celta Vigo', 'Girona', 'Osasuna',
  'Rayo Vallecano', 'Mallorca', 'Getafe', 'Las Palmas', 'Espanyol', 'Alavés',
  'Granada', 'Cádiz', 'Levante', 'Sporting Gijón', 'Zaragoza', 'Tenerife',
  'Málaga', 'Deportivo', 'Elche', 'Huesca', 'Leganes', 'Eibar', 'Burgos', 'Cartagena',
];

export function AdminPanel() {
  const {
    tournament, teams, loading,
    setTeamCount, setTournamentName, setTournamentFormat, generateLeagueFixtures,
    addTeam, updateTeam, deleteTeam, clearAllTeams,
    resetTournament,
  } = useTournamentContext();

  const [editingTeam, setEditingTeam] = useState<Team | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [addingDemo, setAddingDemo] = useState(false);
  const [adminTab, setAdminTab] = useState<'teams' | 'captains' | 'incidents'>('teams');
  const [doubleRound, setDoubleRound] = useState(false);
  const [generatingFixtures, setGeneratingFixtures] = useState(false);
  const [confirmFixtures, setConfirmFixtures] = useState(false);

  if (loading || !tournament) {
    return <div className="flex h-full items-center justify-center py-20 text-slate-500">Cargando...</div>;
  }

  const teamCount = tournament.team_count;
  const registered = teams.length;
  const remaining = teamCount - registered;
  const canDraw = registered === teamCount;
  const isLocked = tournament.status !== 'setup';

  /*
   * Cuántos partidos y jornadas saldrían con los equipos que hay ahora.
   * Con N equipos (o N+1 si es impar) son N-1 jornadas y N/2 partidos cada una.
   */
  const slots = registered % 2 === 1 ? registered + 1 : registered;
  const matchdayCount =
    registered >= 4 ? (slots - 1) * (doubleRound ? 2 : 1) : 0;
  const fixtureCount =
    registered >= 4 ? (registered * (registered - 1)) / 2 * (doubleRound ? 2 : 1) : 0;

  const setFormat = async (format: TournamentFormat) => {
    if (format === tournament.format) return;

    /*
     * Al cambiar de formato hay que ajustar el número de equipos: la copa
     * solo admite 32 o 64 y la liga como mucho 24, así que la base de datos
     * rechazaría el cambio si no se mueven los dos a la vez.
     */
    const ok = await setTournamentFormat(
      format,
      format === 'cup' ? 32 : Math.min(Math.max(registered, 4), 24),
    );

    if (ok) {
      showToast(format === 'cup' ? 'Formato: Copa' : 'Formato: Liga');
    }
  };

  const handleGenerateFixtures = async () => {
    setConfirmFixtures(false);
    setGeneratingFixtures(true);
    const ok = await generateLeagueFixtures(doubleRound);
    setGeneratingFixtures(false);
    if (ok) showToast('Calendario generado');
  };

  const handleAdd = () => setEditingTeam(null);
  const handleEdit = (team: Team) => setEditingTeam(team);

  const handleSubmit = async (name: string, logoUrl: string | null) => {
    if (editingTeam) {
      const ok = await updateTeam(editingTeam.id, { name, logo_url: logoUrl });
      if (ok) showToast('Equipo actualizado');
      return ok;
    }
    const ok = await addTeam(name, logoUrl);
    if (ok) showToast('Equipo añadido');
    return ok;
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const ok = await deleteTeam(confirmDelete.id);
    setConfirmDelete(null);
    if (ok) showToast('Equipo eliminado', 'success');
  };

  const handleReset = async () => {
    const ok = await resetTournament();
    setConfirmReset(false);
    if (ok) showToast('Torneo reiniciado');
  };

  const handleClear = async () => {
    setConfirmClear(false);
    const ok = await clearAllTeams();
    if (ok) showToast('Equipos eliminados');
  };

  const handleDemo = async () => {
    setAddingDemo(true);
    const needed = teamCount - registered;
    const toAdd = DEMO_TEAMS.slice(0, needed);
    let added = 0;
    for (const name of toAdd) {
      const ok = await addTeam(name, null);
      if (ok) added++;
    }
    setAddingDemo(false);
    if (added > 0) showToast(`${added} equipos de demostración añadidos`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">Administración</h1>
          <p className="mt-1 text-sm text-slate-400">Configura los participantes del torneo.</p>
        </div>

        <BroadcastButton
          variant="danger"
          size="md"
          icon={<RotateCcw className="h-4 w-4" />}
          onClick={() => setConfirmReset(true)}
        >
          Reiniciar Torneo
        </BroadcastButton>
      </div>

      {/* Admin tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        <button
          onClick={() => setAdminTab('teams')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
            adminTab === 'teams' ? 'bg-accent-500/20 text-accent-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Users className="h-4 w-4" /> Equipos
        </button>
        <button
          onClick={() => setAdminTab('captains')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
            adminTab === 'captains' ? 'bg-accent-500/20 text-accent-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <UserCog className="h-4 w-4" /> Capitanes
        </button>
        <button
          onClick={() => setAdminTab('incidents')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
            adminTab === 'incidents' ? 'bg-accent-500/20 text-accent-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="h-4 w-4" /> Incidencias
        </button>
      </div>

      {adminTab === 'incidents' && <IncidentManagement />}

      {adminTab === 'captains' && <CaptainManagement />}

      {adminTab === 'teams' && (
      <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Equipos" value={registered} accent="accent" />
        <StatCard label="Plazas" value={teamCount} accent="sky" />
        <StatCard label="Faltan" value={remaining} accent={remaining === 0 ? 'emerald' : 'amber'} />
        <StatCard label="Estado" value={statusLabel(tournament.status)} accent={tournament.status === 'setup' ? 'slate' : 'emerald'} />
      </div>

      {/* Config panel */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Nombre del torneo</label>
            <input
              type="text"
              value={tournament.name}
              onChange={(e) => setTournamentName(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Formato</label>
            <div className="flex gap-2">
              {(['cup', 'league'] as TournamentFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  disabled={isLocked}
                  title={isLocked ? 'Reinicia el torneo para cambiar el formato' : undefined}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-40 ${
                    tournament.format === f
                      ? 'border-accent-500 bg-accent-500/10 text-accent-400 shadow-lg shadow-accent-500/10'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f === 'cup' ? 'Copa' : 'Liga'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {tournament.format === 'cup'
                ? 'Eliminatoria directa: quien pierde queda fuera.'
                : 'Todos contra todos, clasificación por puntos.'}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Número de equipos</label>

            {tournament.format === 'cup' ? (
              <div className="flex gap-2">
                {([32, 64] as TeamCount[]).map((n) => (
                  <button
                    key={n}
                    onClick={() => setTeamCount(n)}
                    disabled={isLocked || (n < registered)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-40 ${
                      teamCount === n
                        ? 'border-accent-500 bg-accent-500/10 text-accent-400 shadow-lg shadow-accent-500/10'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {n} equipos
                  </button>
                ))}
              </div>
            ) : (
              <>
                <input
                  type="number"
                  min={4}
                  max={24}
                  value={teamCount}
                  onChange={(e) => setTeamCount(Number(e.target.value))}
                  disabled={isLocked}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:opacity-60"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Entre 4 y 24. Si es impar, cada jornada descansa un equipo.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Generación del calendario de liga */}
        {tournament.format === 'league' && (
          <div className="mt-4 border-t border-slate-800 pt-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
              <CalendarDays className="h-4 w-4 text-accent-400" /> Calendario de la liga
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={doubleRound}
                  onChange={(e) => setDoubleRound(e.target.checked)}
                  className="accent-accent-500"
                />
                Ida y vuelta
              </label>

              <BroadcastButton
                variant="primary"
                size="md"
                icon={<CalendarDays className="h-4 w-4" />}
                onClick={() => setConfirmFixtures(true)}
                disabled={registered < 4 || generatingFixtures}
              >
                {generatingFixtures ? 'Generando...' : 'Generar calendario'}
              </BroadcastButton>

              <span className="text-xs text-slate-500">
                {registered < 4
                  ? 'Necesitas al menos 4 equipos.'
                  : `${registered} equipos · ${fixtureCount} partidos en ${matchdayCount} jornadas`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent-400" />
          <span className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            Equipos: {registered} / {teamCount}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <BroadcastButton variant="secondary" size="md" icon={<Sparkles className="h-4 w-4" />} onClick={handleDemo} disabled={isLocked || addingDemo || remaining === 0}>
            {addingDemo ? 'Añadiendo...' : 'Rellenar Demo'}
          </BroadcastButton>
          <BroadcastButton variant="ghost" size="md" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmClear(true)} disabled={isLocked || registered === 0}>
            Vaciar Lista
          </BroadcastButton>
          <BroadcastButton variant="primary" size="md" icon={<Plus className="h-4 w-4" />} onClick={handleAdd} disabled={isLocked || registered >= teamCount}>
            Añadir Equipo
          </BroadcastButton>
        </div>
      </div>

      {/* Status messages */}
      {!canDraw && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300">
          Faltan {remaining} equipo{remaining === 1 ? '' : 's'} para generar el cuadro.
        </div>
      )}
      {canDraw && tournament.status === 'setup' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
          Todos los equipos están preparados. Puedes generar el cuadro.
        </div>
      )}

      {/* Teams grid */}
      {teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-slate-500">
          No hay equipos registrados. Añade el primero o usa "Rellenar Demo".
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team, idx) => (
            <div key={team.id} className="animate-fade-in" style={{ animationDelay: `${idx * 0.03}s` }}>
              <TeamCard
                team={team}
                teamCount={teamCount}
                onEdit={handleEdit}
                onDelete={setConfirmDelete}
                disabled={isLocked}
              />
            </div>
          ))}
        </div>
      )}

      </>
      )}

      {/* Edit modal — se renderiza en document.body (portal) para que el
          `fixed` se ancle siempre al viewport, sin importar el `transform`
          de la animación de entrada de página (`page-enter` en App.tsx). */}
      {editingTeam !== undefined &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink-200/80 backdrop-blur-md" onClick={() => setEditingTeam(undefined)} />
            <div className="relative w-full max-w-md animate-scale-in rounded-2xl border border-accent-500/20 bg-gradient-to-br from-ink-100 to-ink-200 p-6 shadow-2xl glow-ring">
              <h2 className="mb-5 font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
                {editingTeam ? 'Editar Equipo' : 'Nuevo Equipo'}
              </h2>
              <TeamForm
                team={editingTeam}
                onSubmit={handleSubmit}
                onCancel={() => setEditingTeam(undefined)}
              />
            </div>
          </div>,
          document.body,
        )}

      <ConfirmationModal
        open={!!confirmDelete}
        title="Eliminar Equipo"
        description={`¿Seguro que quieres eliminar a "${confirmDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmationModal
        open={confirmClear}
        title="Vaciar Lista de Equipos"
        description="Se eliminarán todos los equipos registrados. Esta acción no se puede deshacer."
        confirmLabel="Vaciar Lista"
        destructive
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmationModal
        open={confirmFixtures}
        title="Generar calendario"
        description={`Se crearán ${fixtureCount} partidos repartidos en ${matchdayCount} jornadas con los ${registered} equipos actuales${doubleRound ? ', ida y vuelta' : ''}. Si ya había un calendario, se borrará junto con todos sus resultados.`}
        confirmLabel="Generar"
        destructive
        onConfirm={handleGenerateFixtures}
        onCancel={() => setConfirmFixtures(false)}
      />

      <ConfirmationModal
        open={confirmReset}
        title="Reiniciar Torneo"
        description="¿Estás seguro? Esta acción eliminará el cuadro y todos los resultados. Los equipos registrados se conservarán."
        confirmLabel="Reiniciar Torneo"
        destructive
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'setup': return 'Configurando';
    case 'draw_in_progress': return 'Configurando';
    case 'bracket': return 'En Juego';
    case 'completed': return 'Finalizado';
    default: return status;
  }
}
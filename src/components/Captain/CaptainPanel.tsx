import { useEffect, useState, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Shield,
  Trophy,
  Users,
  MessageSquare,
  History,
  LogOut,
  Bell,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useCaptainAuth } from '@/context/CaptainAuthContext';
import { useTournamentContext } from '@/context/TournamentContext';
import { useChatNotifications } from '@/context/ChatNotificationContext';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { BroadcastButton } from '@/components/UI/BroadcastButton';
import { MatchChat } from '@/components/Captain/MatchChat';
import { MatchDetailView } from '@/components/Captain/MatchDetailView';
import { roundName, matchesInRound } from '@/lib/bracket';

import type {
  Match,
  AppNotification,
} from '@/types/tournament';

interface CaptainPanelProps {
  onSignOut: () => void;
}

/**
 * Calendario oficial del torneo.
 *
 * round_number:
 * 1 = Primera Ronda
 * 2 = Dieciseisavos de Final
 * 3 = Octavos de Final
 * 4 = Cuartos de Final
 * 5 = Semifinal
 * 6 = Final
 */
const ROUND_SCHEDULE: Record<number, { date: string; time: string }> = {
  1: { date: '2026-09-11', time: '22:30' },
  2: { date: '2026-09-11', time: '23:00' },
  3: { date: '2026-09-12', time: '22:30' },
  4: { date: '2026-09-12', time: '23:00' },
  5: { date: '2026-09-13', time: '22:30' },
  6: { date: '2026-09-13', time: '23:00' },
};

export function CaptainPanel({ onSignOut }: CaptainPanelProps) {
  const { captain, signOut } = useCaptainAuth();
  const { tournament, teams, matches } = useTournamentContext();
  const { markMatchAsRead } = useChatNotifications();

  const [activeTab, setActiveTab] = useState<
    'panel' | 'chat' | 'history' | 'match'
  >('panel');

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  /**
   * Carga las notificaciones del capitán.
   */
  const loadNotifications = useCallback(async () => {
    if (!captain) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .or(`captain_id.eq.${captain.id},captain_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(20);

    setNotifications((data ?? []) as AppNotification[]);
  }, [captain]);

  /**
   * Escucha las notificaciones en tiempo real.
   */
  useEffect(() => {
    loadNotifications();

    const channel = supabase
      .channel('captain-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => loadNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  /**
   * Equipo del capitán.
   */
  const myTeam =
    teams.find((t) => t.id === captain?.team_id) ?? null;

  /**
   * Todos los partidos del equipo.
   */
  const findMyMatches = useCallback((): Match[] => {
    if (!myTeam) return [];

    return matches.filter(
      (m) =>
        m.team1_id === myTeam.id ||
        m.team2_id === myTeam.id
    );
  }, [matches, myTeam]);

  const myMatches = findMyMatches();

  /**
   * Devuelve la fecha/hora oficial de una ronda.
   *
   * Si el partido ya tiene scheduled_date / scheduled_time
   * en la base de datos, se respetan esos valores.
   *
   * Si no los tiene, se utiliza automáticamente el calendario
   * oficial definido arriba.
   */
  const getMatchSchedule = (match: Match) => {
    const automaticSchedule =
      ROUND_SCHEDULE[match.round_number];

    return {
      date:
        match.scheduled_date ??
        automaticSchedule?.date ??
        null,

      time:
        match.scheduled_time ??
        automaticSchedule?.time ??
        null,
    };
  };

  /**
   * Devuelve el timestamp del partido para poder ordenarlos.
   */
  const getMatchTimestamp = (match: Match): number => {
    const schedule = getMatchSchedule(match);

    if (!schedule.date || !schedule.time) {
      return Number.MAX_SAFE_INTEGER;
    }

    const timestamp = new Date(
      `${schedule.date}T${schedule.time}:00`
    ).getTime();

    return Number.isNaN(timestamp)
      ? Number.MAX_SAFE_INTEGER
      : timestamp;
  };

  /**
   * Próximo partido REAL.
   *
   * Ya no depende del orden en el que Supabase
   * devuelve los partidos.
   *
   * Busca los partidos pendientes, los ordena por
   * fecha/hora y selecciona el primero.
   */
  const nextMatch =
    [...myMatches]
      .filter(
        (m) =>
          !m.winner_id &&
          m.team1_id &&
          m.team2_id
      )
      .sort(
        (a, b) =>
          getMatchTimestamp(a) -
          getMatchTimestamp(b)
      )[0] ?? null;

  /**
   * IMPORTANTE:
   * Cuando el capitán entra en la pestaña del chat,
   * marcamos inmediatamente el partido como leído.
   *
   * Esto no depende únicamente de que MatchChat se monte.
   * Así el contador de la barra superior se limpia
   * también al navegar a la pestaña Chat.
   *
   * Este efecto DEBE quedarse por encima de los `return`
   * condicionales de más abajo (capitán pendiente, rechazado
   * o sin equipo). Si no, React ejecuta un número distinto de
   * hooks según el estado del capitán y la aplicación revienta
   * en cuanto la organización aprueba a un capitán en caliente
   * (llega por Realtime, sin recargar la página).
   */
  useEffect(() => {
    if (
      activeTab !== 'chat' ||
      !nextMatch ||
      !nextMatch.team1_id ||
      !nextMatch.team2_id
    ) {
      return;
    }

    markMatchAsRead(nextMatch.id);
  }, [
    activeTab,
    nextMatch,
    markMatchAsRead,
  ]);

  /**
   * Cerrar sesión.
   */
  const handleSignOut = async () => {
    await signOut();
    onSignOut();
  };

  /**
   * Marcar una notificación como leída.
   */
  const markRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, read: true }
          : n
      )
    );
  };

  /**
   * Marcar todas las notificaciones como leídas.
   */
  const markAllRead = async () => {
    if (!captain) return;

    const unread = notifications.filter(
      (n) => !n.read
    );

    for (const n of unread) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', n.id);
    }

    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        read: true,
      }))
    );
  };

  /**
   * Formatear fecha.
   */
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Por determinar';

    const d = new Date(
      `${dateStr}T00:00:00`
    );

    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
    });
  };

  /**
   * Formatear hora.
   */
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return 'Por determinar';

    return timeStr.slice(0, 5);
  };

  /**
   * Estado del partido.
   */
  const matchStateLabel = (m: Match): string => {
    if (m.winner_id) return 'Finalizado';

    if (
      m.match_state === 'pending_review'
    ) {
      return 'Resultado pendiente de revisión';
    }

    if (
      m.match_state === 'in_progress'
    ) {
      return 'En juego';
    }

    if (m.team1_id && m.team2_id) {
      return 'Pendiente';
    }

    return 'Esperando rival';
  };

  /**
   * Si no hay capitán.
   */
  if (!captain) return null;

  /**
   * Solicitud pendiente.
   */
  if (captain.status === 'pending') {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mb-5 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-400" />
          </div>
        </div>

        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          Solicitud pendiente
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Tu solicitud de capitán está en revisión.
          La organización debe aprobarla antes de
          que puedas acceder a tu panel.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    );
  }

  /**
   * Solicitud rechazada.
   */
  if (captain.status === 'rejected') {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mb-5 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10">
            <Shield className="h-8 w-8 text-red-400" />
          </div>
        </div>

        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          Solicitud rechazada
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Tu solicitud de capitán ha sido rechazada
          por la organización. Contacta con ellos si
          crees que es un error.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    );
  }

  /**
   * Capitán aprobado pero sin equipo.
   */
  if (!myTeam) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mb-5 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/10">
            <Users className="h-8 w-8 text-sky-400" />
          </div>
        </div>

        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          Sin equipo asignado
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Tu solicitud ha sido aprobada, pero todavía
          no tienes un equipo asignado. La organización
          te asignará uno pronto.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    );
  }

  /**
   * Rival del próximo partido.
   */
  const rivalTeam = nextMatch
    ? teams.find(
        (t) =>
          t.id ===
          (nextMatch.team1_id === myTeam.id
            ? nextMatch.team2_id
            : nextMatch.team1_id)
      ) ?? null
    : null;

  const bothHaveMatch =
    nextMatch &&
    nextMatch.team1_id &&
    nextMatch.team2_id;

  /**
   * Ronda del próximo partido.
   */
  const matchRound = nextMatch
    ? matchesInRound(
        tournament?.team_count ?? 64,
        nextMatch.round_number
      )
    : 0;

  /**
   * Fecha/hora que se mostrará para el próximo partido.
   */
  const nextMatchSchedule = nextMatch
    ? getMatchSchedule(nextMatch)
    : {
        date: null,
        time: null,
      };

  const unreadNotifications =
    notifications.filter(
      (n) => !n.read
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
            Panel del Capitán
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Bienvenido, {captain.name}
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-800 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>

      {/* My team card */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-slate-900/60 to-slate-950/60 p-6">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative flex items-center gap-5">
          <TeamLogo
            logoUrl={myTeam.logo_url}
            name={myTeam.name}
            size="2xl"
          />

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">
              Mi equipo
            </span>

            <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
              {myTeam.name}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Capitán{' '}
              {captain.captain_role === 'secondary'
                ? 'secundario'
                : 'principal'}
              : {captain.name}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        {(
          [
            {
              key: 'panel',
              label: 'Próximo partido',
              icon: Calendar,
            },
            {
              key: 'chat',
              label: 'Chat',
              icon: MessageSquare,
            },
            {
              key: 'history',
              label: 'Historial',
              icon: History,
            },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);

              /**
               * Limpiamos el contador inmediatamente
               * al entrar en Chat.
               */
              if (
                key === 'chat' &&
                nextMatch &&
                bothHaveMatch
              ) {
                markMatchAsRead(nextMatch.id);
              }
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
              activeTab === key
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Notifications */}
      {unreadNotifications.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />

              <span className="text-sm font-bold uppercase tracking-wide text-amber-400">
                Notificaciones
              </span>
            </div>

            <button
              onClick={markAllRead}
              className="text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:text-amber-400"
            >
              Marcar todo como leído
            </button>
          </div>

          <div className="space-y-2">
            {unreadNotifications
              .slice(0, 5)
              .map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-left transition hover:border-amber-500/30"
                >
                  <div className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-amber-400" />

                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      {n.title}
                    </p>

                    <p className="text-xs text-slate-400">
                      {n.message}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Próximo partido */}
      {activeTab === 'panel' && (
        <div className="space-y-4">
          {nextMatch ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-400" />

                <h3 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
                  Próximo partido
                </h3>
              </div>

              <div className="flex items-center justify-center gap-6 py-6">
                <div className="flex flex-col items-center gap-2">
                  <TeamLogo
                    logoUrl={myTeam.logo_url}
                    name={myTeam.name}
                    size="xl"
                  />

                  <span className="text-sm font-bold uppercase tracking-wide text-slate-200">
                    {myTeam.name}
                  </span>
                </div>

                <span className="font-display text-2xl font-bold text-slate-500">
                  VS
                </span>

                <div className="flex flex-col items-center gap-2">
                  {rivalTeam ? (
                    <>
                      <TeamLogo
                        logoUrl={rivalTeam.logo_url}
                        name={rivalTeam.name}
                        size="xl"
                      />

                      <span className="text-sm font-bold uppercase tracking-wide text-slate-200">
                        {rivalTeam.name}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">
                      Por determinar
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCard
                  icon={Trophy}
                  label="Ronda"
                  value={roundName(matchRound)}
                />

                <InfoCard
                  icon={Calendar}
                  label="Fecha"
                  value={formatDate(
                    nextMatchSchedule.date
                  )}
                />

                <InfoCard
                  icon={Clock}
                  label="Hora"
                  value={formatTime(
                    nextMatchSchedule.time
                  )}
                />

                <InfoCard
                  icon={Shield}
                  label="Estado"
                  value={matchStateLabel(nextMatch)}
                />
              </div>

              {/* Solo dejamos el botón del chat */}
              {bothHaveMatch && rivalTeam && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <BroadcastButton
                    variant="secondary"
                    size="md"
                    icon={
                      <MessageSquare className="h-4 w-4" />
                    }
                    onClick={() => {
                      setSelectedMatch(nextMatch);
                      setActiveTab('chat');
                      markMatchAsRead(nextMatch.id);
                    }}
                  >
                    Abrir chat del partido
                  </BroadcastButton>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-slate-500">
              No tienes ningún partido asignado todavía.
            </div>
          )}
        </div>
      )}

      {/* Chat */}
      {activeTab === 'chat' &&
        (nextMatch && bothHaveMatch ? (
          <MatchChat
            matchId={nextMatch.id}
            captainId={captain.id}
            captainName={captain.name}
            teamId={myTeam.id}
            onOpen={() => markMatchAsRead(nextMatch.id)}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-slate-500">
            El chat estará disponible cuando tengas
            un rival asignado.
          </div>
        ))}

      {/* Match detail */}
      {activeTab === 'match' &&
        selectedMatch && (
          <MatchDetailView match={selectedMatch} />
        )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {myMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-slate-500">
              No hay partidos en el historial todavía.
            </div>
          ) : (
            [...myMatches]
              .sort(
                (a, b) =>
                  getMatchTimestamp(a) -
                  getMatchTimestamp(b)
              )
              .map((m) => {
                const rival = teams.find(
                  (t) =>
                    t.id ===
                    (m.team1_id === myTeam.id
                      ? m.team2_id
                      : m.team1_id)
                );

                const won =
                  m.winner_id === myTeam.id;

                const r = matchesInRound(
                  tournament?.team_count ?? 64,
                  m.round_number
                );

                const schedule =
                  getMatchSchedule(m);

                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMatch(m);
                      setActiveTab('match');
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-sky-500/30"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          won
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : m.winner_id
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {won ? (
                          <Trophy className="h-5 w-5" />
                        ) : (
                          <Shield className="h-5 w-5" />
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-200">
                          {myTeam.name} vs{' '}
                          {rival?.name ??
                            'Por determinar'}
                        </p>

                        <p className="text-xs text-slate-500">
                          {roundName(r)} —{' '}
                          {formatDate(schedule.date)}{' '}
                          ·{' '}
                          {formatTime(schedule.time)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-bold uppercase tracking-wide ${
                        won
                          ? 'text-emerald-400'
                          : m.winner_id
                          ? 'text-red-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {m.winner_id
                        ? won
                          ? 'Ganaste'
                          : 'Perdiste'
                        : matchStateLabel(m)}
                    </span>
                  </button>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tarjeta de información.
 */
function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-slate-500">
        <Icon className="h-3.5 w-3.5" />

        <span className="text-[10px] font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>

      <p className="text-sm font-bold text-slate-200">
        {value}
      </p>
    </div>
  );
}
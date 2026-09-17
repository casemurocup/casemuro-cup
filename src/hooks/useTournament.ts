import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildBracketSkeleton } from '@/lib/bracket';
import type { Match, Team, Tournament } from '@/types/tournament';

interface TournamentData {
  tournament: Tournament | null;
  teams: Team[];
  matches: Match[];
  loading: boolean;
  error: string | null;
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Ha ocurrido un error inesperado.';
}

/**
 * Comprueba que una escritura haya afectado de verdad a alguna fila.
 *
 * PostgREST devuelve éxito (204) tanto si un UPDATE/DELETE cambia cien filas
 * como si no cambia ninguna. Cuando RLS filtra la fila porque quien llama no
 * es administrador, la operación "funciona" pero no hace nada, y la interfaz
 * acababa diciendo que todo había ido bien sin haber cambiado nada.
 *
 * Como estas operaciones se lanzan sobre filas que sabemos que existen, cero
 * filas afectadas solo puede significar que la base de datos lo ha rechazado.
 */
function assertAffected(rows: unknown[] | null, action: string): void {
  if (rows && rows.length > 0) return;

  throw new Error(
    `No se ha podido ${action}. Tu sesión ya no tiene permisos de ` +
      'administración: si has iniciado sesión como capitán en este mismo ' +
      'navegador, has reemplazado la sesión de administrador. Sal y vuelve ' +
      'a entrar en Administración.',
  );
}

/*
 * Cada pestaña abierta con Realtime ocupa una conexión, y el plan gratuito de
 * Supabase tiene un tope (unas 200 simultáneas). Como los capitanes y la
 * organización son pocos pero los visitantes pueden ser muchos, solo quienes
 * tienen sesión iniciada usan Realtime.
 *
 * El resto pregunta cada pocos segundos si algo ha cambiado. Para no gastar
 * transferencia, esa pregunta NO se trae el torneo entero: pide solo la marca
 * de tiempo más reciente y el número de filas de cada tabla (unos pocos
 * bytes), y únicamente cuando esa firma cambia se hace la recarga completa.
 */
const POLL_INTERVAL_MS = 15000;

async function fetchChangeSignature(tournamentId: string): Promise<string | null> {
  try {
    const [tournamentRes, teamsRes, matchesRes] = await Promise.all([
      supabase
        .from('tournaments')
        .select('updated_at')
        .eq('id', tournamentId)
        .maybeSingle(),
      supabase
        .from('teams')
        .select('updated_at', { count: 'exact' })
        .eq('tournament_id', tournamentId)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('matches')
        .select('updated_at', { count: 'exact' })
        .eq('tournament_id', tournamentId)
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);

    if (tournamentRes.error || teamsRes.error || matchesRes.error) return null;

    return [
      tournamentRes.data?.updated_at ?? '',
      teamsRes.count ?? 0,
      teamsRes.data?.[0]?.updated_at ?? '',
      matchesRes.count ?? 0,
      matchesRes.data?.[0]?.updated_at ?? '',
    ].join('|');
  } catch {
    return null;
  }
}

export function useTournament() {
  const [data, setData] = useState<TournamentData>({
    tournament: null,
    teams: [],
    matches: [],
    loading: true,
    error: null,
  });

  const loadAll = useCallback(async () => {
    try {
      const { data: tournaments, error: tError } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1);
      if (tError) throw tError;

      let tournament = tournaments?.[0] as Tournament | undefined;

      if (!tournament) {
        const { data: created, error: createError } = await supabase
          .from('tournaments')
          .insert({ name: 'CASEMURO CUP', team_count: 32, status: 'setup' })
          .select()
          .maybeSingle();
        if (createError) throw createError;
        tournament = created as Tournament;
      }

      const [{ data: teams, error: teamsError }, { data: matches, error: matchesError }] = await Promise.all([
        supabase.from('teams').select('*').eq('tournament_id', tournament.id).order('team_number', { ascending: true }),
        supabase.from('matches').select('*').eq('tournament_id', tournament.id).order('round_number', { ascending: true }).order('match_number', { ascending: true }),
      ]);
      if (teamsError) throw teamsError;
      if (matchesError) throw matchesError;

      setData({
        tournament,
        teams: (teams ?? []) as Team[],
        matches: (matches ?? []) as Match[],
        loading: false,
        error: null,
      });
    } catch (err) {
      setData((prev) => ({ ...prev, loading: false, error: friendlyError(err) }));
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /*
   * ¿Hay sesión iniciada? (capitán o administración)
   */
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setHasSession(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setHasSession(!!session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /*
   * Realtime: solo para quien tiene sesión.
   */
  useEffect(() => {
    const tournamentId = data.tournament?.id;
    if (!tournamentId || !hasSession) return;

    const channel = supabase
      .channel(`tournament-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `tournament_id=eq.${tournamentId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'captains' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_results' }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data.tournament?.id, hasSession, loadAll]);

  /*
   * Visitantes sin sesión: sondeo ligero en lugar de Realtime.
   *
   * No consulta nada mientras la pestaña está en segundo plano, y vuelve a
   * comprobar en cuanto el visitante la recupera.
   */
  useEffect(() => {
    const tournamentId = data.tournament?.id;
    if (!tournamentId || hasSession) return;

    let cancelled = false;
    let lastSignature: string | null = null;

    const check = async () => {
      if (cancelled || document.hidden) return;

      const signature = await fetchChangeSignature(tournamentId);
      if (cancelled || !signature) return;

      if (lastSignature !== null && signature !== lastSignature) {
        loadAll();
      }

      lastSignature = signature;
    };

    check();

    const intervalId = window.setInterval(check, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (!document.hidden) check();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [data.tournament?.id, hasSession, loadAll]);

  const clearError = useCallback(() => {
    setData((prev) => ({ ...prev, error: null }));
  }, []);

  const setTeamCount = useCallback(async (count: number) => {
    if (!data.tournament) return false;
    if (data.tournament.status !== 'setup') {
      setData((prev) => ({ ...prev, error: 'No puedes cambiar el número de equipos una vez generado el cuadro.' }));
      return false;
    }
    if (data.teams.length > count) {
      setData((prev) => ({ ...prev, error: `Ya hay ${data.teams.length} equipos registrados. Elimina equipos hasta llegar a ${count} antes de reducir el tamaño.` }));
      return false;
    }
    try {
      const { data: updated, error } = await supabase.from('tournaments').update({ team_count: count }).eq('id', data.tournament.id).select('id');
      if (error) throw error;
      assertAffected(updated, 'cambiar el número de equipos');
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, data.teams.length, loadAll]);

  /**
   * Cambia el formato del torneo (copa o liga).
   *
   * El número de equipos viaja en la misma actualización porque la
   * restricción de la base de datos los valida juntos: la copa solo admite
   * 32 o 64, y la liga entre 4 y 24. Hacerlo en dos pasos sería rechazado.
   */
  const setTournamentFormat = useCallback(async (
    format: 'cup' | 'league',
    teamCount: number,
  ) => {
    if (!data.tournament) return false;
    if (data.tournament.status !== 'setup') {
      setData((prev) => ({ ...prev, error: 'No puedes cambiar el formato con el torneo en marcha. Reinicia el torneo primero.' }));
      return false;
    }
    try {
      const { data: updated, error } = await supabase
        .from('tournaments')
        .update({ format, team_count: teamCount })
        .eq('id', data.tournament.id)
        .select('id');
      if (error) throw error;
      assertAffected(updated, 'cambiar el formato');
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, loadAll]);

  /**
   * Genera el calendario completo de la liga.
   */
  const generateLeagueFixtures = useCallback(async (doubleRound: boolean) => {
    if (!data.tournament) return false;
    try {
      const { error } = await supabase.rpc('generate_league_fixtures', {
        p_tournament_id: data.tournament.id,
        p_double_round: doubleRound,
      });
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, loadAll]);

  const setTournamentName = useCallback(async (name: string) => {
    if (!data.tournament) return false;
    try {
      const { error } = await supabase.from('tournaments').update({ name }).eq('id', data.tournament.id);
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, loadAll]);

  const addTeam = useCallback(async (name: string, logoUrl: string | null) => {
    if (!data.tournament) return false;
    if (data.teams.length >= data.tournament.team_count) {
      setData((prev) => ({ ...prev, error: 'Ya se ha alcanzado el número máximo de equipos.' }));
      return false;
    }
    try {
      const { error } = await supabase.from('teams').insert({
        tournament_id: data.tournament.id,
        name: name.trim(),
        logo_url: logoUrl,
      });
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, data.teams.length, loadAll]);

  const updateTeam = useCallback(async (id: string, updates: { name?: string; logo_url?: string | null }) => {
    try {
      const { data: updated, error } = await supabase.from('teams').update(updates).eq('id', id).select('id');
      if (error) throw error;
      assertAffected(updated, 'guardar el equipo');
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [loadAll]);

  const deleteTeam = useCallback(async (id: string) => {
    if (!data.tournament) return false;
    if (data.tournament.status !== 'setup') {
      setData((prev) => ({ ...prev, error: 'No puedes eliminar equipos una vez generado el cuadro. Reinicia el torneo primero.' }));
      return false;
    }
    try {
      const { data: deleted, error } = await supabase.from('teams').delete().eq('id', id).select('id');
      if (error) throw error;
      assertAffected(deleted, 'eliminar el equipo');
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, loadAll]);

  const clearAllTeams = useCallback(async () => {
    if (!data.tournament) return false;
    if (data.tournament.status !== 'setup') {
      setData((prev) => ({ ...prev, error: 'No puedes vaciar la lista una vez generado el cuadro. Reinicia el torneo primero.' }));
      return false;
    }
    try {
      const { error } = await supabase.from('teams').delete().eq('tournament_id', data.tournament.id);
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, loadAll]);

  const generateBracket = useCallback(async () => {
    if (!data.tournament) return false;
    if (data.teams.length !== data.tournament.team_count) {
      setData((prev) => ({ ...prev, error: 'Completa todos los equipos antes de generar el cuadro.' }));
      return false;
    }
    try {
      const skeleton = buildBracketSkeleton(data.tournament.team_count).map((m) => ({
        tournament_id: data.tournament!.id,
        round_number: m.round_number,
        match_number: m.match_number,
      }));

      const { error: deleteError } = await supabase.from('matches').delete().eq('tournament_id', data.tournament.id);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from('matches').insert(skeleton);
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('tournaments')
        .update({
          status: 'bracket',
          champion_team_id: null,
        })
        .eq('id', data.tournament.id);
      if (updateError) throw updateError;

      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, data.teams, loadAll]);

  const generateBracketWithDraw = useCallback(async (drawOrder: string[]) => {
    if (!data.tournament) return false;
    if (data.teams.length !== data.tournament.team_count) {
      setData((prev) => ({ ...prev, error: 'Completa todos los equipos antes de generar el cuadro.' }));
      return false;
    }
    if (drawOrder.length !== data.teams.length) {
      setData((prev) => ({ ...prev, error: 'El sorteo debe incluir todos los equipos.' }));
      return false;
    }
    try {
      const skeleton = buildBracketSkeleton(data.tournament.team_count).map((m) => ({
        tournament_id: data.tournament!.id,
        round_number: m.round_number,
        match_number: m.match_number,
      }));

      const { error: deleteError } = await supabase.from('matches').delete().eq('tournament_id', data.tournament.id);
      if (deleteError) throw deleteError;

      const { data: insertedMatches, error: insertError } = await supabase
        .from('matches')
        .insert(skeleton)
        .select('*')
        .order('round_number', { ascending: true })
        .order('match_number', { ascending: true });
      if (insertError) throw insertError;

      const firstRoundMatches = (insertedMatches as Match[]).filter((m) => m.round_number === 1);
      for (let i = 0; i < firstRoundMatches.length; i++) {
        const team1Id = drawOrder[i * 2] ?? null;
        const team2Id = drawOrder[i * 2 + 1] ?? null;
        const { error: assignError } = await supabase
          .from('matches')
          .update({ team1_id: team1Id, team2_id: team2Id })
          .eq('id', firstRoundMatches[i].id);
        if (assignError) throw assignError;
      }

      const { error: updateError } = await supabase
        .from('tournaments')
        .update({ status: 'bracket', champion_team_id: null })
        .eq('id', data.tournament.id);
      if (updateError) throw updateError;

      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, data.teams, loadAll]);

  const assignTeamToMatch = useCallback(async (matchId: string, slot: 1 | 2, teamId: string | null) => {
    try {
      const update = slot === 1 ? { team1_id: teamId } : { team2_id: teamId };
      const { error } = await supabase.from('matches').update(update).eq('id', matchId);
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [loadAll]);

  const selectWinner = useCallback(async (matchId: string, winnerId: string) => {
    try {
      const { error } = await supabase.rpc('advance_match_winner', { p_match_id: matchId, p_winner_id: winnerId });
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [loadAll]);

  const undoWinner = useCallback(async (matchId: string) => {
    try {
      const { error } = await supabase.rpc('undo_match_winner', { p_match_id: matchId });
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [loadAll]);

  const resetTournament = useCallback(async () => {
    if (!data.tournament) return false;
    try {
      const { error: deleteError } = await supabase.from('matches').delete().eq('tournament_id', data.tournament.id);
      if (deleteError) throw deleteError;

      const { data: updated, error: updateError } = await supabase
        .from('tournaments')
        .update({
          status: 'setup',
          champion_team_id: null,
        })
        .eq('id', data.tournament.id)
        .select('id');
      if (updateError) throw updateError;
      assertAffected(updated, 'reiniciar el torneo');

      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, loadAll]);

  return {
    ...data,
    clearError,
    setTeamCount,
    setTournamentName,
    setTournamentFormat,
    generateLeagueFixtures,
    addTeam,
    updateTeam,
    deleteTeam,
    clearAllTeams,
    generateBracket,
    generateBracketWithDraw,
    assignTeamToMatch,
    selectWinner,
    undoWinner,
    resetTournament,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildBracketSkeleton } from '@/lib/bracket';
import type { Match, Team, TeamCount, Tournament } from '@/types/tournament';

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

  useEffect(() => {
    const tournamentId = data.tournament?.id;
    if (!tournamentId) return;

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
  }, [data.tournament?.id, loadAll]);

  const clearError = useCallback(() => {
    setData((prev) => ({ ...prev, error: null }));
  }, []);

  const setTeamCount = useCallback(async (count: TeamCount) => {
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
      const { error } = await supabase.from('tournaments').update({ team_count: count }).eq('id', data.tournament.id);
      if (error) throw error;
      await loadAll();
      return true;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return false;
    }
  }, [data.tournament, data.teams.length, loadAll]);

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

  const uploadLogo = useCallback(async (file: File): Promise<string | null> => {
    if (!data.tournament) return null;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const path = `${data.tournament.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('team-logos').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from('team-logos').getPublicUrl(path);
      return publicUrl.publicUrl;
    } catch (err) {
      setData((prev) => ({ ...prev, error: friendlyError(err) }));
      return null;
    }
  }, [data.tournament]);

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
      const { error } = await supabase.from('teams').update(updates).eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
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

      const { error: updateError } = await supabase
        .from('tournaments')
        .update({
          status: 'setup',
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
  }, [data.tournament, loadAll]);

  return {
    ...data,
    clearError,
    setTeamCount,
    setTournamentName,
    uploadLogo,
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

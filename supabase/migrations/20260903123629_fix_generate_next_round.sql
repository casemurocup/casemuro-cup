/*
# Fix generate_next_round function

The previous version referenced `matchesInRound()` which is a TypeScript helper,
not a SQL function. Replace with the inline formula: team_count / 2^round_number.
Also fix the array length check to use the correct count.
*/

CREATE OR REPLACE FUNCTION generate_next_round(p_tournament_id uuid, p_round_number int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_max_round int;
  v_classified_teams uuid[];
  v_next_round int;
  v_next_match_count int;
  v_current_match_count int;
  v_classified_count int;
  v_match_num int;
  v_team_idx int := 1;
  v_date date;
  v_time time;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF v_tournament.id IS NULL THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  v_max_round := ROUND(LOG(2::numeric, v_tournament.team_count::numeric))::int;
  v_next_round := p_round_number + 1;

  IF v_next_round > v_max_round THEN
    RAISE EXCEPTION 'No hay siguiente ronda (ya es la final)';
  END IF;

  v_current_match_count := (v_tournament.team_count / power(2, p_round_number))::int;
  v_next_match_count := (v_tournament.team_count / power(2, v_next_round))::int;

  -- Obtener equipos clasificados de la ronda actual (orden por match_number)
  SELECT array_agg(winner_id ORDER BY match_number) INTO v_classified_teams
    FROM matches
    WHERE tournament_id = p_tournament_id
      AND round_number = p_round_number
      AND winner_id IS NOT NULL;

  v_classified_count := COALESCE(array_length(v_classified_teams, 1), 0);

  IF v_classified_count < v_current_match_count THEN
    RAISE EXCEPTION 'No todos los partidos de la ronda % tienen un equipo clasificado (% de %)', p_round_number, v_classified_count, v_current_match_count;
  END IF;

  -- Asignar fecha/hora oficial según la ronda
  v_date := CASE v_next_round
    WHEN 2 THEN '2026-09-11'::date
    WHEN 3 THEN '2026-09-12'::date
    WHEN 4 THEN '2026-09-12'::date
    WHEN 5 THEN '2026-09-13'::date
    WHEN 6 THEN '2026-09-13'::date
    ELSE NULL
  END;

  v_time := CASE v_next_round
    WHEN 2 THEN '23:00'::time
    WHEN 3 THEN '22:30'::time
    WHEN 4 THEN '23:00'::time
    WHEN 5 THEN '22:30'::time
    WHEN 6 THEN '23:00'::time
    ELSE NULL
  END;

  -- Crear o actualizar los partidos de la siguiente ronda
  FOR v_match_num IN 1..v_next_match_count LOOP
    -- Verificar si ya existe el partido
    IF NOT EXISTS (
      SELECT 1 FROM matches
        WHERE tournament_id = p_tournament_id
          AND round_number = v_next_round
          AND match_number = v_match_num
    ) THEN
      INSERT INTO matches (tournament_id, round_number, match_number, scheduled_date, scheduled_time)
      VALUES (p_tournament_id, v_next_round, v_match_num, v_date, v_time);
    END IF;

    -- Asignar equipos clasificados en orden
    UPDATE matches
      SET team1_id = v_classified_teams[v_team_idx],
          team2_id = v_classified_teams[v_team_idx + 1],
          scheduled_date = v_date,
          scheduled_time = v_time,
          updated_at = now()
      WHERE tournament_id = p_tournament_id
        AND round_number = v_next_round
        AND match_number = v_match_num;

    v_team_idx := v_team_idx + 2;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_next_round(uuid, int) TO anon, authenticated;

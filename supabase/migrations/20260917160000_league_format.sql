/*
# Formato de torneo: copa o liga

Hasta ahora el torneo era siempre una eliminatoria directa de 32 o 64 equipos.
Se añade el formato de liga (todos contra todos), eligiendo uno u otro al
configurar el torneo. La copa no cambia en nada.

1. Columnas nuevas en `tournaments`
  - `format` (texto) 'cup' | 'league', por defecto 'cup'
  - `double_round` (bool) en liga, si se juega ida y vuelta

2. Columnas nuevas en `matches`
  - `team1_score`, `team2_score` (int) — la copa solo necesitaba saber quién
    pasaba (`winner_id`), pero una liga necesita los goles para calcular
    puntos, diferencia y desempates.

3. `team_count` deja de estar limitado a 32/64
  - En copa se mantiene 32 o 64, porque el cuadro necesita una potencia de 2.
  - En liga se permite cualquier número entre 4 y 24. Si es impar, en cada
    jornada descansa un equipo.

4. Funciones nuevas
  - `generate_league_fixtures(p_tournament_id, p_double_round)` — genera el
    calendario completo por el método del círculo: cada equipo se enfrenta a
    todos los demás una vez (o dos, invirtiendo el campo, si es ida y vuelta).
  - `set_match_score(p_match_id, p_team1_score, p_team2_score)` — la
    organización anota el resultado de un partido de liga.
  - `resolve_incident_league_result(p_incident_id, p_team1_score, p_team2_score)`
    — valida el resultado que reportó un capitán y lo anota en el partido.

5. Notas sobre el estado del torneo
  - Se reutiliza el estado `bracket` para decir "torneo en marcha", también en
    liga. Añadir un estado nuevo obligaría a tocar todas las comprobaciones
    `status === 'bracket'` que ya existen en la interfaz sin ganar nada.

6. Seguridad
  - Todas las funciones nuevas son de administración y empiezan por
    `assert_admin()`, igual que el resto.
*/

-- ============================================================
-- tournaments: formato
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'cup',
  ADD COLUMN IF NOT EXISTS double_round boolean NOT NULL DEFAULT false;

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN ('cup', 'league'));

-- El cuadro de copa necesita una potencia de 2; la liga no.
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_team_count_check;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_team_count_by_format;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_team_count_by_format CHECK (
  (format = 'cup' AND team_count IN (32, 64))
  OR (format = 'league' AND team_count BETWEEN 4 AND 24)
);

-- ============================================================
-- matches: marcador
-- ============================================================

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS team1_score int,
  ADD COLUMN IF NOT EXISTS team2_score int;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_scores_non_negative;
ALTER TABLE matches ADD CONSTRAINT matches_scores_non_negative CHECK (
  (team1_score IS NULL OR team1_score >= 0)
  AND (team2_score IS NULL OR team2_score >= 0)
);

-- ============================================================
-- FUNCIÓN: generate_league_fixtures
--
-- Método del círculo: se fija el primer equipo y el resto rota una posición
-- en cada jornada. Con N equipos salen N-1 jornadas y cada equipo juega una
-- vez contra todos. Si N es impar se añade un hueco: el que queda emparejado
-- con ese hueco descansa esa jornada.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_league_fixtures(
  p_tournament_id uuid,
  p_double_round boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_ids uuid[];
  v_n int;
  v_rounds int;
  v_half int;
  v_round int;
  v_i int;
  v_home uuid;
  v_away uuid;
  v_match_num int;
  v_tmp uuid;
BEGIN
  PERFORM assert_admin();

  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF v_tournament.id IS NULL THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  IF v_tournament.format <> 'league' THEN
    RAISE EXCEPTION 'Este torneo no es una liga';
  END IF;

  SELECT array_agg(id ORDER BY team_number)
    INTO v_ids
    FROM teams
   WHERE tournament_id = p_tournament_id;

  v_n := COALESCE(array_length(v_ids, 1), 0);

  IF v_n < 4 THEN
    RAISE EXCEPTION 'Necesitas al menos 4 equipos para generar la liga (hay %)', v_n;
  END IF;

  -- Número impar: se añade un hueco para que cada jornada descanse uno.
  IF v_n % 2 = 1 THEN
    v_ids := v_ids || ARRAY[NULL::uuid];
    v_n := v_n + 1;
  END IF;

  v_rounds := v_n - 1;
  v_half := v_n / 2;

  DELETE FROM matches WHERE tournament_id = p_tournament_id;

  FOR v_round IN 1..v_rounds LOOP
    v_match_num := 0;

    FOR v_i IN 1..v_half LOOP
      v_home := v_ids[v_i];
      v_away := v_ids[v_n + 1 - v_i];

      -- Si alguno es el hueco, ese equipo descansa esta jornada.
      IF v_home IS NOT NULL AND v_away IS NOT NULL THEN
        v_match_num := v_match_num + 1;

        INSERT INTO matches (tournament_id, round_number, match_number, team1_id, team2_id)
        VALUES (p_tournament_id, v_round, v_match_num, v_home, v_away);
      END IF;
    END LOOP;

    -- Rotación: el primero se queda fijo, el resto gira una posición.
    v_tmp := v_ids[v_n];
    FOR v_i IN REVERSE v_n..3 LOOP
      v_ids[v_i] := v_ids[v_i - 1];
    END LOOP;
    v_ids[2] := v_tmp;
  END LOOP;

  -- Segunda vuelta: los mismos emparejamientos con el campo invertido.
  IF p_double_round THEN
    INSERT INTO matches (tournament_id, round_number, match_number, team1_id, team2_id)
    SELECT p_tournament_id, round_number + v_rounds, match_number, team2_id, team1_id
      FROM matches
     WHERE tournament_id = p_tournament_id
       AND round_number <= v_rounds;
  END IF;

  UPDATE tournaments
     SET status = 'bracket',
         double_round = p_double_round,
         champion_team_id = NULL,
         updated_at = now()
   WHERE id = p_tournament_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_league_fixtures(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_league_fixtures(uuid, boolean) TO authenticated;

-- ============================================================
-- FUNCIÓN: set_match_score
-- La organización anota el resultado de un partido de liga.
-- ============================================================

CREATE OR REPLACE FUNCTION set_match_score(
  p_match_id uuid,
  p_team1_score int,
  p_team2_score int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_winner uuid;
BEGIN
  PERFORM assert_admin();

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match.team1_id IS NULL OR v_match.team2_id IS NULL THEN
    RAISE EXCEPTION 'El partido no tiene los dos equipos asignados';
  END IF;

  IF p_team1_score IS NULL OR p_team2_score IS NULL
     OR p_team1_score < 0 OR p_team2_score < 0 THEN
    RAISE EXCEPTION 'Marcador inválido';
  END IF;

  -- En liga el empate es un resultado válido: winner_id queda a NULL.
  v_winner := CASE
    WHEN p_team1_score > p_team2_score THEN v_match.team1_id
    WHEN p_team2_score > p_team1_score THEN v_match.team2_id
    ELSE NULL
  END;

  UPDATE matches
     SET team1_score = p_team1_score,
         team2_score = p_team2_score,
         winner_id = v_winner,
         match_state = 'finished',
         updated_at = now()
   WHERE id = p_match_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_match_score(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_match_score(uuid, int, int) TO authenticated;

-- ============================================================
-- FUNCIÓN: resolve_incident_league_result
-- Valida el resultado reportado por un capitán y lo anota en el partido.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_incident_league_result(
  p_incident_id uuid,
  p_team1_score int,
  p_team2_score int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident incidents%ROWTYPE;
BEGIN
  PERFORM assert_admin();

  SELECT * INTO v_incident FROM incidents WHERE id = p_incident_id;
  IF v_incident.id IS NULL THEN
    RAISE EXCEPTION 'Incidencia no encontrada';
  END IF;

  IF v_incident.category <> 'resultado' THEN
    RAISE EXCEPTION 'Esta incidencia no es un reporte de resultado';
  END IF;

  IF v_incident.match_id IS NULL THEN
    RAISE EXCEPTION 'La incidencia no indica a qué partido corresponde';
  END IF;

  PERFORM set_match_score(v_incident.match_id, p_team1_score, p_team2_score);

  UPDATE incidents
     SET status = 'resolved',
         resolved_by = auth.uid(),
         resolved_at = now(),
         updated_at = now()
   WHERE id = p_incident_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_incident_league_result(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_incident_league_result(uuid, int, int) TO authenticated;

-- ============================================================
-- Las funciones de copa dejan claro que no valen para una liga
-- ============================================================

CREATE OR REPLACE FUNCTION assert_cup_format(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_format text;
BEGIN
  SELECT format INTO v_format FROM tournaments WHERE id = p_tournament_id;

  IF v_format = 'league' THEN
    RAISE EXCEPTION 'Esta operación es del cuadro de copa y este torneo es una liga';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assert_cup_format(uuid) TO authenticated, service_role;

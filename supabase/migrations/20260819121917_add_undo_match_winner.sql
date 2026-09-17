/*
# Añadir función para deshacer un resultado de partido

Permite revertir un resultado confirmado por si el organizador se equivocó.
Al deshacer un partido:
  1. Quita al ganador del hueco correspondiente en la siguiente ronda
     (o quita el campeón si era la final).
  2. Borra el ganador del partido.
  3. Borra los reportes de ambos equipos y deja el estado en 'pending'.
  4. Si el partido de la siguiente ronda ya tenía un ganador asignado
     (es decir, ya se avanzó más allá), lanza un error indicando que
     primero hay que deshacer los partidos posteriores.

Seguridad: hereda las políticas RLS existentes. Se ejecuta con privilegios
de invocador.
*/

CREATE OR REPLACE FUNCTION undo_match_winner(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_max_round int;
  v_next_round int;
  v_next_match_number int;
  v_next_match_id uuid;
  v_next_match matches%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match.winner_id IS NULL THEN
    RAISE EXCEPTION 'Este partido no tiene un ganador asignado';
  END IF;

  SELECT * INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;
  v_max_round := ROUND(LOG(2::numeric, v_tournament.team_count::numeric))::int;

  IF v_match.round_number = v_max_round THEN
    -- Era la final: solo quitar el campeón
    UPDATE tournaments
      SET champion_team_id = NULL,
          status = CASE WHEN status = 'completed' THEN 'bracket' ELSE status END,
          updated_at = now()
      WHERE id = v_tournament.id;
  ELSE
    v_next_round := v_match.round_number + 1;
    v_next_match_number := CEIL(v_match.match_number / 2.0)::int;

    SELECT * INTO v_next_match FROM matches
      WHERE tournament_id = v_match.tournament_id
        AND round_number = v_next_round
        AND match_number = v_next_match_number;

    -- Si el partido de la siguiente ronda ya tiene ganador, no se puede deshacer este primero
    IF v_next_match.winner_id IS NOT NULL THEN
      RAISE EXCEPTION 'No puedes deshacer este partido porque la siguiente ronda ya avanzó. Deshaz primero los partidos posteriores.';
    END IF;

    -- Quitar al ganador del hueco correspondiente en la siguiente ronda
    IF v_match.match_number % 2 = 1 THEN
      UPDATE matches SET team1_id = NULL, updated_at = now() WHERE id = v_next_match.id;
    ELSE
      UPDATE matches SET team2_id = NULL, updated_at = now() WHERE id = v_next_match.id;
    END IF;
  END IF;

  -- Borrar el ganador y los reportes del partido
  UPDATE matches
    SET winner_id = NULL,
        team1_reported_winner = NULL,
        team2_reported_winner = NULL,
        report_status = 'pending',
        updated_at = now()
    WHERE id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION undo_match_winner(uuid) TO anon, authenticated;

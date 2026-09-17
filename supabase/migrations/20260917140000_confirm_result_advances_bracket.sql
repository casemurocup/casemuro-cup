/*
# Validar un resultado y clasificar al ganador en el cuadro

Hasta ahora, `review_match_result()` solo marcaba el resultado reportado como
confirmado o rechazado, y quién pasaba de ronda se decidía aparte desde el
cuadro. Eran dos pasos para la misma decisión.

Esta migración añade `confirm_match_result()`, que hace las dos cosas a la vez:
la organización elige quién ha ganado y el equipo queda colocado en el hueco
que le toca de la siguiente ronda.

1. Nueva función `confirm_match_result(p_result_id, p_winner_team_id)`
  - Solo administración.
  - El ganador debe ser uno de los dos equipos del partido.
  - Si el partido YA tiene ganador, falla con un mensaje claro: primero hay
    que deshacerlo desde el cuadro (`undo_match_winner`). Así una doble
    pulsación no descoloca el cuadro.
  - Marca el resultado como `confirmed` y llama a `advance_match_winner()`,
    que es exactamente lo que ya hacía el cuadro al elegir ganador. El
    comportamiento del cuadro no cambia: solo cambia desde dónde se dispara.

2. Se mantiene `review_match_result()`
  - Sigue existiendo para confirmar o rechazar un resultado SIN tocar el
    cuadro. La administración la usa cuando el partido ya estaba clasificado
    o cuando el resultado reportado no es válido.

3. Seguridad
  - `assert_admin()` al entrar, igual que el resto de funciones de
    administración. Sin cambios en políticas RLS.
*/

CREATE OR REPLACE FUNCTION confirm_match_result(
  p_result_id uuid,
  p_winner_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result match_results%ROWTYPE;
  v_match matches%ROWTYPE;
BEGIN
  PERFORM assert_admin();

  SELECT * INTO v_result FROM match_results WHERE id = p_result_id;
  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Resultado no encontrado';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = v_result.match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match.team1_id IS NULL OR v_match.team2_id IS NULL THEN
    RAISE EXCEPTION 'El partido todavía no tiene los dos equipos asignados';
  END IF;

  IF p_winner_team_id IS DISTINCT FROM v_match.team1_id
     AND p_winner_team_id IS DISTINCT FROM v_match.team2_id THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos equipos del partido';
  END IF;

  IF v_match.winner_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este partido ya tiene un ganador clasificado. Deshazlo desde el cuadro antes de volver a validarlo.';
  END IF;

  UPDATE match_results
     SET status = 'confirmed',
         winner_team_id = p_winner_team_id,
         updated_at = now()
   WHERE id = p_result_id;

  -- Misma función que usa el cuadro al elegir ganador a mano: coloca al
  -- equipo en la siguiente ronda o lo corona campeón si era la final.
  PERFORM advance_match_winner(v_match.id, p_winner_team_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_match_result(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_match_result(uuid, uuid) TO authenticated;

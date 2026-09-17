/*
# Añadir sistema de reportes de resultados vía Discord

Esta migración prepara la base de datos para que un bot de Discord pueda
consultar los partidos y recibir los reportes de resultados de los equipos.

1. Columnas nuevas en `matches`
  - `team1_reported_winner` (uuid) — equipo que el representante del equipo 1
    marcó como ganador
  - `team2_reported_winner` (uuid) — equipo que el representante del equipo 2
    marcó como ganador
  - `report_status` (texto) — estado del reporte:
      'pending'   → ningún reporte todavía
      'reported'  → al menos un equipo ha reportado, falta el otro
      'confirmed' → ambos equipos reportan el mismo ganador → resultado confirmado
      'disputed'  → los dos equipos reportan ganadores distintos → requiere admin
  - `discord_message_id` (texto) — ID del mensaje de Discord publicado por el bot
    para este partido (para editar/actualizar cuando cambie el estado)

2. Columna nueva en `teams`
  - `discord_rep_id` (texto) — ID del usuario de Discord que es representante
    del equipo. Solo él puede reportar resultados en Discord.

3. Función `report_match_result(p_match_id, p_team_slot, p_winner_id)`
  - Recibe el slot (1 o 2) que está reportando y el equipo que ese representante
    marca como ganador.
  - Guarda el reporte en la columna correspondiente.
  - Si ambos equipos han reportado y coinciden → llama a advance_match_winner
    y marca el partido como 'confirmed'.
  - Si ambos han reportado y no coinciden → marca como 'disputed'.
  - Si solo uno ha reportado → marca como 'reported'.

4. Seguridad
  - Las nuevas columnas heredan las políticas RLS existentes (anon/authenticated
    pueden leer y escribir, igual que el resto de la tabla).
  - La función se ejecuta con privilegios de invocador (no SECURITY DEFINER)
    porque el bot la llamará a través del edge function con la service role key.
*/

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS team1_reported_winner uuid REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team2_reported_winner uuid REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS report_status text NOT NULL DEFAULT 'pending'
    CHECK (report_status IN ('pending', 'reported', 'confirmed', 'disputed')),
  ADD COLUMN IF NOT EXISTS discord_message_id text;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS discord_rep_id text;

CREATE OR REPLACE FUNCTION report_match_result(
  p_match_id uuid,
  p_team_slot int,
  p_winner_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match.winner_id IS NOT NULL THEN
    RETURN 'already_decided';
  END IF;

  IF p_team_slot = 1 THEN
    UPDATE matches SET team1_reported_winner = p_winner_id, updated_at = now() WHERE id = p_match_id;
  ELSIF p_team_slot = 2 THEN
    UPDATE matches SET team2_reported_winner = p_winner_id, updated_at = now() WHERE id = p_match_id;
  ELSE
    RAISE EXCEPTION 'Slot inválido (debe ser 1 o 2)';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF v_match.team1_reported_winner IS NOT NULL AND v_match.team2_reported_winner IS NOT NULL THEN
    IF v_match.team1_reported_winner = v_match.team2_reported_winner THEN
      UPDATE matches SET report_status = 'confirmed', updated_at = now() WHERE id = p_match_id;
      PERFORM advance_match_winner(p_match_id, v_match.team1_reported_winner);
      RETURN 'confirmed';
    ELSE
      UPDATE matches SET report_status = 'disputed', updated_at = now() WHERE id = p_match_id;
      RETURN 'disputed';
    END IF;
  ELSIF v_match.team1_reported_winner IS NOT NULL OR v_match.team2_reported_winner IS NOT NULL THEN
    UPDATE matches SET report_status = 'reported', updated_at = now() WHERE id = p_match_id;
    RETURN 'reported';
  ELSE
    UPDATE matches SET report_status = 'pending', updated_at = now() WHERE id = p_match_id;
    RETURN 'pending';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION report_match_result(uuid, int, uuid) TO anon, authenticated;

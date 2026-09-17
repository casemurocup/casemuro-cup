/*
# El resultado del partido se reporta como incidencia

Los capitanes reportan el resultado desde Incidencias, eligiendo la categoría
`resultado`. En ese caso el marcador y el enlace de prueba son obligatorios:
sin captura o clip, la organización no tiene con qué validar.

Contexto: existía un componente `ResultForm` que escribía en `match_results`,
pero nunca llegó a renderizarse en la interfaz (ningún componente lo
importaba), así que esa tabla jamás recibió una fila. Este es el primer camino
real para reportar un resultado.

1. Columnas nuevas en `incidents`
  - `score_own` (int) goles del equipo que reporta
  - `score_rival` (int) goles del rival

2. Restricción `incidents_result_requires_data`
  - Si `category = 'resultado'`, son obligatorios `match_id`, `evidence_url`
    (no vacío), `score_own` y `score_rival`. La validación vive en la base de
    datos, no solo en el formulario: así no se puede saltar llamando a la API.

3. Función `resolve_incident_result(p_incident_id, p_winner_team_id)`
  - Solo administración. Elige el ganador de una incidencia de tipo
    `resultado`, la marca como resuelta y clasifica al equipo en el cuadro
    reutilizando `advance_match_winner()`.
  - Si el partido ya tiene ganador, falla pidiendo que se deshaga primero
    desde el cuadro, para que una doble pulsación no lo descoloque.

4. Notas
  - `match_results` y `review_match_result()` no se eliminan: pueden seguir
    ahí sin estorbar, y borrar una tabla es irreversible.
*/

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS score_own int,
  ADD COLUMN IF NOT EXISTS score_rival int;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_scores_non_negative;
ALTER TABLE incidents ADD CONSTRAINT incidents_scores_non_negative CHECK (
  (score_own IS NULL OR score_own >= 0)
  AND (score_rival IS NULL OR score_rival >= 0)
);

-- Incidencias antiguas creadas con la categoría `resultado` cuando todavía
-- era solo texto: no tienen marcador ni prueba, así que no son reportes de
-- resultado válidos y la restricción de abajo las rechazaría.
--
-- No se borran: se reclasifican como `otro`, que es lo que realmente son.
-- Se conservan el título, la descripción, el enlace y el estado.
UPDATE incidents
   SET category = 'otro'
 WHERE category = 'resultado'
   AND (
     match_id IS NULL
     OR evidence_url IS NULL
     OR btrim(evidence_url) = ''
     OR score_own IS NULL
     OR score_rival IS NULL
   );

-- Un reporte de resultado sin partido, marcador o prueba no sirve de nada.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_result_requires_data;
ALTER TABLE incidents ADD CONSTRAINT incidents_result_requires_data CHECK (
  category <> 'resultado'
  OR (
    match_id IS NOT NULL
    AND evidence_url IS NOT NULL
    AND btrim(evidence_url) <> ''
    AND score_own IS NOT NULL
    AND score_rival IS NOT NULL
  )
);

-- ============================================================
-- FUNCIÓN: resolve_incident_result
-- La organización elige ganador y el equipo pasa de ronda.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_incident_result(
  p_incident_id uuid,
  p_winner_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident incidents%ROWTYPE;
  v_match matches%ROWTYPE;
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

  SELECT * INTO v_match FROM matches WHERE id = v_incident.match_id;
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

  UPDATE incidents
     SET status = 'resolved',
         resolved_by = auth.uid(),
         resolved_at = now(),
         updated_at = now()
   WHERE id = p_incident_id;

  -- Misma función que usa el cuadro al elegir ganador a mano.
  PERFORM advance_match_winner(v_match.id, p_winner_team_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_incident_result(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_incident_result(uuid, uuid) TO authenticated;

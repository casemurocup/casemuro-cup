/*
# Permitir borrar partidos que tienen incidencias de resultado

Reiniciar el torneo fallaba con 400 al borrar los partidos:

  DELETE /rest/v1/matches?tournament_id=eq... 400 (Bad Request)

Causa: `incidents.match_id` tiene `ON DELETE SET NULL`, así que al borrar un
partido Postgres pone a NULL el `match_id` de sus incidencias. Pero la
restricción `incidents_result_requires_data`, creada en la migración
`20260917150000`, exige que una incidencia de categoría `resultado` tenga
`match_id`. Las dos reglas se contradicen y la base de datos rechaza el
borrado completo.

Solución: separar las dos cosas que la restricción mezclaba.

  - Lo que debe cumplirse SIEMPRE (marcador y prueba en un reporte de
    resultado) se queda en la restricción.
  - Lo que solo debe cumplirse AL CREARLA (indicar de qué partido es) pasa a
    un trigger BEFORE INSERT. Así, cuando el partido desaparece más tarde, la
    incidencia sobrevive con `match_id` a NULL en vez de bloquear el borrado.

De esta forma no se pierde el historial: las incidencias siguen ahí después de
reiniciar el torneo, simplemente dejan de apuntar a un partido que ya no
existe. La alternativa habría sido borrarlas en cascada.
*/

-- La restricción deja de exigir `match_id`.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_result_requires_data;
ALTER TABLE incidents ADD CONSTRAINT incidents_result_requires_data CHECK (
  category <> 'resultado'
  OR (
    evidence_url IS NOT NULL
    AND btrim(evidence_url) <> ''
    AND score_own IS NOT NULL
    AND score_rival IS NOT NULL
  )
);

-- Exigir el partido solo al crear la incidencia.
CREATE OR REPLACE FUNCTION incidents_require_match_on_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.category = 'resultado' AND NEW.match_id IS NULL THEN
    RAISE EXCEPTION 'Un reporte de resultado tiene que indicar de qué partido es';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incidents_require_match ON incidents;
CREATE TRIGGER trg_incidents_require_match
  BEFORE INSERT ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION incidents_require_match_on_result();

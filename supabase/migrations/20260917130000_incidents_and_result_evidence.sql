/*
# Incidencias y enlace de evidencia en los resultados

Añade el sistema de incidencias (un capitán reporta un problema y le llega a
la organización) y permite adjuntar un ENLACE de evidencia al resultado que ya
reportaban los capitanes desde su partido.

Se usan enlaces externos (clip, captura subida a otro sitio) en lugar del
Storage de Supabase, para no consumir la cuota del plan gratuito.

1. Cambios en `match_results`
  - `evidence_url` (texto, opcional) — enlace a la prueba del resultado.

2. Nueva tabla `incidents`
  - `id` (uuid, PK)
  - `captain_id` (uuid, FK captains) quién la abre
  - `team_id` (uuid, FK teams) equipo del capitán en ese momento
  - `match_id` (uuid, FK matches, opcional) partido relacionado, si aplica
  - `category` (texto) 'rival' | 'horario' | 'tecnico' | 'resultado' | 'otro'
  - `subject` (texto) título breve
  - `description` (texto) explicación
  - `evidence_url` (texto, opcional) enlace a la prueba
  - `status` (texto) 'open' | 'reviewing' | 'resolved' | 'dismissed'
  - `resolution_notes` (texto) respuesta de la organización
  - `resolved_by` (uuid, FK auth.users), `resolved_at`
  - `created_at`, `updated_at`

3. Función `resolve_incident(p_incident_id, p_status, p_notes)`
  - Solo administración. Cambia el estado y deja la respuesta.

4. Seguridad
  - Una incidencia la ve únicamente el capitán que la abrió y la organización.
    No es pública ni la ve el equipo rival (a diferencia del chat, aquí puede
    haber una queja SOBRE el rival).
  - Al crearla, `captain_id` debe ser el de la sesión: no se puede abrir una
    incidencia en nombre de otro.
  - El capitán no puede cambiar el estado ni escribir la resolución; eso es
    exclusivo de `resolve_incident()`, igual que el resto de acciones de
    administración del proyecto.

5. Notas
  - No se toca ninguna tabla, política ni función existente, salvo añadir la
    columna `evidence_url` a `match_results`.
*/

-- ============================================================
-- match_results: enlace de evidencia
-- ============================================================

ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS evidence_url text;

-- ============================================================
-- TABLA: incidents
-- ============================================================

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id uuid NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'otro'
    CHECK (category IN ('rival', 'horario', 'tecnico', 'resultado', 'otro')),
  subject text NOT NULL,
  description text NOT NULL,
  evidence_url text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_captain ON incidents(captain_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Lectura: el capitán que la abrió y la organización. Nadie más.
DROP POLICY IF EXISTS "incidents_select_own_or_admin" ON incidents;
CREATE POLICY "incidents_select_own_or_admin" ON incidents FOR SELECT
  TO authenticated USING (
    is_admin() OR captain_id = auth.uid()
  );

-- Alta: solo un capitán aprobado, y siempre en su propio nombre y estado
-- 'open' (no puede abrirla ya resuelta ni con respuesta de la organización).
DROP POLICY IF EXISTS "incidents_insert_own" ON incidents;
CREATE POLICY "incidents_insert_own" ON incidents FOR INSERT
  TO authenticated WITH CHECK (
    captain_id = auth.uid()
    AND status = 'open'
    AND resolution_notes IS NULL
    AND resolved_by IS NULL
    AND EXISTS (
      SELECT 1 FROM captains c
       WHERE c.id = auth.uid()
         AND c.status = 'approved'
    )
  );

-- Edición: solo administración. El capitán no retoca lo que ya envió; si
-- necesita añadir algo, abre otra incidencia o lo cuenta en la resolución.
DROP POLICY IF EXISTS "incidents_update_admin" ON incidents;
CREATE POLICY "incidents_update_admin" ON incidents FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "incidents_delete_admin" ON incidents;
CREATE POLICY "incidents_delete_admin" ON incidents FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- FUNCIÓN: resolve_incident (solo administración)
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_incident(
  p_incident_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_admin();

  IF p_status NOT IN ('open', 'reviewing', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  UPDATE incidents
     SET status = p_status,
         resolution_notes = COALESCE(p_notes, resolution_notes),
         resolved_by = CASE
                         WHEN p_status IN ('resolved', 'dismissed') THEN auth.uid()
                         ELSE NULL
                       END,
         resolved_at = CASE
                         WHEN p_status IN ('resolved', 'dismissed') THEN now()
                         ELSE NULL
                       END,
         updated_at = now()
   WHERE id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incidencia no encontrada';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_incident(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_incident(uuid, text, text) TO authenticated;

-- ============================================================
-- FUNCIÓN: review_match_result (la organización valida un resultado)
--
-- El capitán reporta el resultado desde su partido; aquí la organización lo
-- da por bueno o lo rechaza. NO avanza al ganador de ronda: quién pasa se
-- sigue decidiendo desde el cuadro, como hasta ahora.
-- ============================================================

CREATE OR REPLACE FUNCTION review_match_result(
  p_result_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_admin();

  IF p_status NOT IN ('pending_review', 'confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  UPDATE match_results
     SET status = p_status,
         updated_at = now()
   WHERE id = p_result_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resultado no encontrado';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION review_match_result(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION review_match_result(uuid, text) TO authenticated;

-- ============================================================
-- Realtime: que la organización vea las incidencias al instante
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
  END IF;
END $$;

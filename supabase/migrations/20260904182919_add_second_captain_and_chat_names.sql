/*
# Soporte para doble capitán por equipo y nombres en el chat

1. Cambios en la tabla `captains`
- Añade la columna `captain_role` (text, valores 'primary' | 'secondary', por defecto 'primary').
- Permite que un equipo tenga hasta 2 capitanes: uno principal y uno secundario.

2. Cambios en la tabla `match_messages`
- Añade `captain_name` (text) para mostrar quién envió cada mensaje sin necesidad de JOIN.
- Añade `team_id` (uuid, FK teams) para saber de qué equipo es cada mensaje y poder
  alinear los mensajes por equipo en el chat (tu equipo a la derecha, rival a la izquierda).

3. Funciones actualizadas
- `assign_captain_to_team`: ahora asigna automáticamente el rol. Si el equipo ya tiene
  un capitán, el nuevo se asigna como 'secondary'. Si no tiene ninguno, es 'primary'.
  Si se le asigna null como team_id, se le quita el equipo y el rol se resetea a 'primary'.
- `update_captain_status`: sin cambios funcionales.
- Nueva función `unassign_captain_team`: quita el equipo de un capitán y resetea su rol.
  Si era el principal y hay un secundario, el secundario pasa a ser principal.

4. Backfill
- Rellena `captain_name` y `team_id` en los mensajes existentes usando los datos
  de la tabla `captains`.

5. Notas
- No se eliminan columnas ni se cambian tipos existentes.
- Las políticas RLS existentes siguen siendo válidas.
*/

-- ============================================================
-- Columna captain_role en captains
-- ============================================================

ALTER TABLE captains
  ADD COLUMN IF NOT EXISTS captain_role text NOT NULL DEFAULT 'primary'
  CHECK (captain_role IN ('primary', 'secondary'));

-- ============================================================
-- Columnas captain_name y team_id en match_messages
-- ============================================================

ALTER TABLE match_messages
  ADD COLUMN IF NOT EXISTS captain_name text NOT NULL DEFAULT '';

ALTER TABLE match_messages
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_match_messages_team ON match_messages(team_id);

-- Backfill: rellenar captain_name y team_id en mensajes existentes
UPDATE match_messages m
  SET captain_name = c.name,
      team_id = c.team_id
  FROM captains c
  WHERE m.captain_id = c.id;

-- ============================================================
-- Función: assign_captain_to_team (actualizada con rol automático)
-- ============================================================

CREATE OR REPLACE FUNCTION assign_captain_to_team(p_captain_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_count int;
BEGIN
  IF p_team_id IS NULL THEN
    -- Quitar equipo: resetear rol a primary
    UPDATE captains
      SET team_id = NULL,
          captain_role = 'primary',
          updated_at = now()
      WHERE id = p_captain_id;
  ELSE
    -- Contar cuántos capitanes ya tiene este equipo (excluyendo al actual)
    SELECT count(*) INTO v_existing_count
      FROM captains
      WHERE team_id = p_team_id
        AND id != p_captain_id;

    IF v_existing_count >= 2 THEN
      RAISE EXCEPTION 'Este equipo ya tiene 2 capitanes asignados';
    END IF;

    -- Si ya hay un capitán, el nuevo es secondary; si no, es primary
    UPDATE captains
      SET team_id = p_team_id,
          status = 'approved',
          captain_role = CASE WHEN v_existing_count > 0 THEN 'secondary' ELSE 'primary' END,
          updated_at = now()
      WHERE id = p_captain_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_captain_to_team(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- Función: unassign_captain_team (quita equipo y promueve secundario)
-- ============================================================

CREATE OR REPLACE FUNCTION unassign_captain_team(p_captain_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_role text;
BEGIN
  SELECT team_id, captain_role INTO v_team_id, v_role
    FROM captains WHERE id = p_captain_id;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  -- Quitar equipo al capitán
  UPDATE captains
    SET team_id = NULL,
        captain_role = 'primary',
        updated_at = now()
    WHERE id = p_captain_id;

  -- Si era el principal y hay un secundario, promoverlo
  IF v_role = 'primary' THEN
    UPDATE captains
      SET captain_role = 'primary',
          updated_at = now()
      WHERE team_id = v_team_id
        AND captain_role = 'secondary';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION unassign_captain_team(uuid) TO anon, authenticated;

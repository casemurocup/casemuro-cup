/*
# Corregir las guardas de privilegios (fallo de seguridad)

La migración `20260917090000_secure_rls_roles.sql` introdujo `is_service_role()`
comprobando, entre otras cosas, `current_user IN ('postgres', ...)`.

Eso es incorrecto: dentro de una función `SECURITY DEFINER`, `current_user` es
el DUEÑO de la función (`postgres`), no quien la invoca. Como los triggers de
guarda y `assert_admin()` son `SECURITY DEFINER`, `is_service_role()` devolvía
siempre `true` dentro de ellos y la comprobación se saltaba por completo.

Consecuencias del fallo (verificadas):
  - Un capitán podía auto-aprobarse y asignarse cualquier equipo.
  - Un capitán podía confirmar o rechazar resultados.
  - Un capitán podía reescribir mensajes del chat.
  - Un capitán autenticado podía ejecutar `classify_team`,
    `generate_next_round`, `assign_captain_to_team`, `update_captain_status` y
    `unassign_captain_team`, que son SECURITY DEFINER y por tanto saltan RLS.
  (`advance_match_winner` y `undo_match_winner` se libraban de rebote porque
   son SECURITY INVOKER y RLS les bloqueaba el UPDATE.)

1. Cambios
  - `is_service_role()` pasa a mirar únicamente el claim `role` del JWT de la
    petición, que `SECURITY DEFINER` no altera.
  - Las tres funciones de guarda (`captains_guard_privileged_columns`,
    `match_messages_guard_update`, `match_results_guard_status`) dejan de ser
    `SECURITY DEFINER`: no lo necesitan, porque `is_admin()` ya lo es.
  - `assert_admin()` deja de ser `SECURITY DEFINER` y de aceptar
    `is_service_role()`: hoy nada usa la service_role key (la integración con
    Discord se retiró en la migración anterior), así que administrar es
    exclusivamente tener fila en `admins`.

2. Notas
  - `is_admin()` nunca estuvo afectada: se apoya en `auth.uid()`, que lee el
    claim `sub` del JWT y es inmune a `SECURITY DEFINER`.
  - No cambia ninguna tabla, columna ni política RLS.
  - A partir de aquí, editar a mano filas de `captains`, `match_messages` o
    `match_results` desde el SQL Editor también pasa por las guardas. Si
    alguna vez necesitas saltártelas para una corrección puntual, usa
    `ALTER TABLE <tabla> DISABLE TRIGGER <trigger>` y vuelve a activarlo.
*/

-- ============================================================
-- is_service_role(): solo el claim del JWT
-- ============================================================

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
           NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role';
$$;

-- ============================================================
-- assert_admin(): administrar es tener fila en `admins`, y punto
-- ============================================================

CREATE OR REPLACE FUNCTION assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'No tienes permisos de administración para esta operación';
  END IF;
END;
$$;

-- ============================================================
-- Guardas de integridad (ya no son SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION captains_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'Solo la organización puede asignar el equipo de un capitán';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Solo la organización puede cambiar el estado de un capitán';
  END IF;

  IF NEW.captain_role IS DISTINCT FROM OLD.captain_role THEN
    RAISE EXCEPTION 'Solo la organización puede cambiar el rol de un capitán';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION match_messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.match_id IS DISTINCT FROM OLD.match_id
     OR NEW.captain_id IS DISTINCT FROM OLD.captain_id
     OR NEW.captain_name IS DISTINCT FROM OLD.captain_name
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo se puede marcar un mensaje como leído';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION match_results_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'confirmed' THEN
    RAISE EXCEPTION 'Este resultado ya ha sido confirmado por la organización';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Solo la organización puede validar o rechazar un resultado';
  END IF;

  IF NEW.match_id IS DISTINCT FROM OLD.match_id THEN
    RAISE EXCEPTION 'No se puede mover un resultado a otro partido';
  END IF;

  RETURN NEW;
END;
$$;

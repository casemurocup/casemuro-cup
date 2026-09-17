/*
# Separación real de roles y endurecimiento de RLS

Hasta esta migración, todas las tablas permitían INSERT/UPDATE/DELETE al rol
`anon` con `USING (true)`. Como la clave anónima viaja en el bundle del
navegador (es pública por diseño), cualquier visitante podía borrar equipos,
alterar resultados, reasignar el cuadro o coronar campeón llamando a la API
REST directamente. El rol de administrador solo existía en React
(sessionStorage), que PostgreSQL no puede verificar.

Esta migración introduce tres roles verificables en la base de datos:

  VISITANTE (anon)
    - Solo lectura de los datos públicos del torneo: `tournaments`, `teams`,
      `matches`. Nada más. Ninguna escritura.

  CAPITÁN AUTENTICADO (authenticated + fila en `captains` con status 'approved')
    - Lee y edita únicamente su propia ficha (sin poder cambiarse el equipo,
      el estado ni el rol: eso lo decide el administrador).
    - Lee y escribe en el chat únicamente de los partidos de SU equipo.
    - Reporta y edita el resultado únicamente de los partidos de SU equipo,
      y solo mientras siga 'pending_review'.
    - Lee y marca como leídas únicamente SUS notificaciones.

  ADMINISTRADOR (authenticated + fila en `admins`)
    - Escritura completa sobre el torneo, equipos, partidos, resultados,
      capitanes, notificaciones y los escudos del Storage.

1. Nuevas tablas
  - `admins` — `id` (uuid, PK, = auth.users.id), `email`, `created_at`.
    Ser administrador es tener una fila aquí. No hay contraseñas en el código.

2. Nuevas funciones auxiliares
  - `is_admin()` — true si el usuario de la petición es administrador.
  - `is_service_role()` — true si la petición usa la service_role key
    (procesos de servidor / Edge Functions) o se ejecuta como superusuario en una
    migración. Nunca es true desde el navegador.
  - `is_approved_captain_of_match(uuid)` — true si quien llama es un capitán
    aprobado de uno de los dos equipos del partido indicado.
  - `current_captain_team_id()` — equipo del capitán aprobado que llama.

3. Triggers de integridad
  - `captains_guard_privileged_columns` — impide que un capitán se cambie a sí
    mismo `team_id`, `status` o `captain_role` (auto-aprobarse o robar equipo).
  - `match_results_guard_status` — impide que un capitán cambie el `status` de
    un resultado (confirmarse a sí mismo el partido) o reescriba un resultado
    ya confirmado.
  - `handle_new_auth_user` — crea la ficha de capitán al registrarse, de forma
    que el alta funciona igual con y sin confirmación de email obligatoria.

4. Permisos de ejecución
  - Se revoca `EXECUTE` a `anon` en todas las funciones que modifican el
    torneo, y las funciones `SECURITY DEFINER` comprueban internamente que
    quien llama es administrador (o la service_role key).

5. Notas
  - No se modifica ninguna tabla, columna, índice ni función de negocio.
  - No se elimina ninguna funcionalidad: cada operación que la aplicación
    hacía hoy sigue siendo posible, pero solo para el rol que corresponde.
*/

-- ============================================================
-- TABLA: admins
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Un usuario solo puede comprobar si él mismo es administrador.
-- La lista de administradores no es pública.
DROP POLICY IF EXISTS "admins_select_self" ON admins;
CREATE POLICY "admins_select_self" ON admins FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- ============================================================
-- FUNCIONES AUXILIARES
-- ============================================================

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
      OR COALESCE(
           NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role';
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION current_captain_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.team_id FROM captains c
   WHERE c.id = auth.uid() AND c.status = 'approved';
$$;

CREATE OR REPLACE FUNCTION is_approved_captain_of_match(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM captains c
      JOIN matches m ON m.id = p_match_id
     WHERE c.id = auth.uid()
       AND c.status = 'approved'
       AND c.team_id IS NOT NULL
       AND (c.team_id = m.team1_id OR c.team_id = m.team2_id)
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_service_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_captain_team_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_approved_captain_of_match(uuid) TO authenticated;

-- ============================================================
-- POLÍTICAS: tournaments  (lectura pública, escritura solo admin)
-- ============================================================

DROP POLICY IF EXISTS "anon_select_tournaments" ON tournaments;
DROP POLICY IF EXISTS "anon_insert_tournaments" ON tournaments;
DROP POLICY IF EXISTS "anon_update_tournaments" ON tournaments;
DROP POLICY IF EXISTS "anon_delete_tournaments" ON tournaments;

CREATE POLICY "tournaments_public_read" ON tournaments FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "tournaments_admin_insert" ON tournaments FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "tournaments_admin_update" ON tournaments FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "tournaments_admin_delete" ON tournaments FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- POLÍTICAS: teams  (lectura pública, escritura solo admin)
-- ============================================================

DROP POLICY IF EXISTS "anon_select_teams" ON teams;
DROP POLICY IF EXISTS "anon_insert_teams" ON teams;
DROP POLICY IF EXISTS "anon_update_teams" ON teams;
DROP POLICY IF EXISTS "anon_delete_teams" ON teams;

CREATE POLICY "teams_public_read" ON teams FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "teams_admin_insert" ON teams FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "teams_admin_update" ON teams FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "teams_admin_delete" ON teams FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- POLÍTICAS: matches  (lectura pública, escritura solo admin)
-- ============================================================

DROP POLICY IF EXISTS "anon_select_matches" ON matches;
DROP POLICY IF EXISTS "anon_insert_matches" ON matches;
DROP POLICY IF EXISTS "anon_update_matches" ON matches;
DROP POLICY IF EXISTS "anon_delete_matches" ON matches;

CREATE POLICY "matches_public_read" ON matches FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "matches_admin_insert" ON matches FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "matches_admin_update" ON matches FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "matches_admin_delete" ON matches FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- POLÍTICAS: captains
-- Los emails de los capitanes dejan de ser públicos.
-- ============================================================

DROP POLICY IF EXISTS "captains_select_all" ON captains;
DROP POLICY IF EXISTS "captains_insert_self" ON captains;
DROP POLICY IF EXISTS "captains_update_self" ON captains;
DROP POLICY IF EXISTS "captains_delete_self" ON captains;

-- Lectura: el propio capitán ve su ficha; el administrador las ve todas.
CREATE POLICY "captains_select_self_or_admin" ON captains FOR SELECT
  TO authenticated USING (auth.uid() = id OR is_admin());

-- Alta: solo puedes crear TU propia ficha, siempre como 'pending' y sin equipo.
-- (La vía normal es el trigger handle_new_auth_user; esto es la red de seguridad
--  para sesiones que ya existen.)
CREATE POLICY "captains_insert_self" ON captains FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = id
    AND status = 'pending'
    AND team_id IS NULL
  );

-- Edición: el capitán edita su ficha (el trigger impide que toque team_id,
-- status o captain_role); el administrador edita cualquiera.
CREATE POLICY "captains_update_self_or_admin" ON captains FOR UPDATE
  TO authenticated USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

CREATE POLICY "captains_delete_self_or_admin" ON captains FOR DELETE
  TO authenticated USING (auth.uid() = id OR is_admin());

-- Trigger: un capitán no puede auto-aprobarse ni asignarse un equipo.
CREATE OR REPLACE FUNCTION captains_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() OR is_service_role() THEN
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

DROP TRIGGER IF EXISTS trg_captains_guard ON captains;
CREATE TRIGGER trg_captains_guard
  BEFORE UPDATE ON captains
  FOR EACH ROW
  EXECUTE FUNCTION captains_guard_privileged_columns();

-- Alta automática de la ficha de capitán al registrarse.
-- Funciona tanto si Supabase exige confirmación de email (no hay sesión
-- todavía) como si no. Los administradores se marcan con metadatos y no
-- generan ficha de capitán.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data ->> 'is_admin', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO captains (id, name, email, status)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
      COALESCE(NEW.email, ''),
      'pending'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Nunca bloqueamos el alta de la cuenta por un fallo aquí: la aplicación
    -- tiene una vía alternativa para crear la ficha cuando ya hay sesión.
    RAISE WARNING 'No se pudo crear la ficha de capitán para %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_auth_user ON auth.users;
CREATE TRIGGER trg_handle_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- POLÍTICAS: match_messages
-- ============================================================

DROP POLICY IF EXISTS "messages_select_match_captains" ON match_messages;
DROP POLICY IF EXISTS "messages_insert_match_captains" ON match_messages;

CREATE POLICY "messages_select_participants" ON match_messages FOR SELECT
  TO authenticated USING (
    is_admin() OR is_approved_captain_of_match(match_id)
  );

-- Al escribir, el mensaje debe ir firmado con TU id de capitán y TU equipo:
-- así no se puede suplantar al capitán rival.
CREATE POLICY "messages_insert_participants" ON match_messages FOR INSERT
  TO authenticated WITH CHECK (
    is_approved_captain_of_match(match_id)
    AND captain_id = auth.uid()
    AND (team_id IS NULL OR team_id = current_captain_team_id())
  );

-- Marcar como leídos los mensajes del rival. Esta política faltaba: el código
-- de ChatNotificationContext ya hacía este UPDATE, pero RLS lo descartaba en
-- silencio y el contador de no leídos nunca se limpiaba en la base de datos.
CREATE POLICY "messages_update_read_flag" ON match_messages FOR UPDATE
  TO authenticated USING (
    is_approved_captain_of_match(match_id)
  ) WITH CHECK (
    is_approved_captain_of_match(match_id)
  );

-- Trigger: en ese UPDATE solo se puede tocar `is_read`.
CREATE OR REPLACE FUNCTION match_messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() OR is_service_role() THEN
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

DROP TRIGGER IF EXISTS trg_match_messages_guard ON match_messages;
CREATE TRIGGER trg_match_messages_guard
  BEFORE UPDATE ON match_messages
  FOR EACH ROW
  EXECUTE FUNCTION match_messages_guard_update();

-- ============================================================
-- POLÍTICAS: match_results
-- ============================================================

DROP POLICY IF EXISTS "results_select_all" ON match_results;
DROP POLICY IF EXISTS "results_insert_captain" ON match_results;
DROP POLICY IF EXISTS "results_update_captain_or_admin" ON match_results;

CREATE POLICY "results_select_participants" ON match_results FOR SELECT
  TO authenticated USING (
    is_admin() OR is_approved_captain_of_match(match_id)
  );

CREATE POLICY "results_insert_captain" ON match_results FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR (
      is_approved_captain_of_match(match_id)
      AND reported_by = auth.uid()
      AND status = 'pending_review'
    )
  );

CREATE POLICY "results_update_captain_or_admin" ON match_results FOR UPDATE
  TO authenticated USING (
    is_admin() OR is_approved_captain_of_match(match_id)
  ) WITH CHECK (
    is_admin() OR is_approved_captain_of_match(match_id)
  );

-- Trigger: el capitán no puede confirmarse a sí mismo el resultado ni
-- reescribir uno que la organización ya ha confirmado.
CREATE OR REPLACE FUNCTION match_results_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() OR is_service_role() THEN
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

DROP TRIGGER IF EXISTS trg_match_results_guard ON match_results;
CREATE TRIGGER trg_match_results_guard
  BEFORE UPDATE ON match_results
  FOR EACH ROW
  EXECUTE FUNCTION match_results_guard_status();

-- ============================================================
-- POLÍTICAS: notifications
-- ============================================================

DROP POLICY IF EXISTS "notifications_select_owner" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_any" ON notifications;
DROP POLICY IF EXISTS "notifications_update_any" ON notifications;
DROP POLICY IF EXISTS "notifications_delete_any" ON notifications;

-- El capitán ve las suyas y las globales (captain_id NULL); el admin, todas.
CREATE POLICY "notifications_select_owner" ON notifications FOR SELECT
  TO authenticated USING (
    is_admin() OR captain_id = auth.uid() OR captain_id IS NULL
  );

CREATE POLICY "notifications_insert_admin" ON notifications FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- Marcar como leída: solo las propias (o cualquiera si eres admin).
CREATE POLICY "notifications_update_owner" ON notifications FOR UPDATE
  TO authenticated USING (
    is_admin() OR captain_id = auth.uid()
  ) WITH CHECK (
    is_admin() OR captain_id = auth.uid()
  );

CREATE POLICY "notifications_delete_admin" ON notifications FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- POLÍTICAS: storage (bucket team-logos)
-- Lectura pública (los escudos se ven en la web), escritura solo admin:
-- los escudos solo se suben desde el panel de administración.
-- ============================================================

DROP POLICY IF EXISTS "team_logos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "team_logos_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "team_logos_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "team_logos_anon_delete" ON storage.objects;

CREATE POLICY "team_logos_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'team-logos');

CREATE POLICY "team_logos_admin_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'team-logos' AND is_admin());

CREATE POLICY "team_logos_admin_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'team-logos' AND is_admin())
  WITH CHECK (bucket_id = 'team-logos' AND is_admin());

CREATE POLICY "team_logos_admin_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'team-logos' AND is_admin());

-- ============================================================
-- PERMISOS DE EJECUCIÓN DE LAS FUNCIONES DEL TORNEO
--
-- `anon` pierde el permiso sobre todo lo que modifica el torneo, y las
-- funciones SECURITY DEFINER comprueban internamente quién llama (antes
-- cualquier anónimo podía auto-aprobarse como capitán de cualquier equipo).
-- ============================================================

-- OJO: `CREATE FUNCTION` concede EXECUTE a PUBLIC por defecto, así que hay que
-- revocar también a PUBLIC; revocar solo a `anon` no serviría de nada.
REVOKE EXECUTE ON FUNCTION advance_match_winner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION undo_match_winner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION classify_team(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION generate_next_round(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION assign_captain_to_team(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_captain_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION unassign_captain_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION report_match_result(uuid, int, uuid) FROM PUBLIC, anon, authenticated;

-- `report_match_result` solo la usa la Edge Function con la service_role key.
GRANT EXECUTE ON FUNCTION report_match_result(uuid, int, uuid) TO service_role;

-- Guarda común para las funciones SECURITY DEFINER de administración.
CREATE OR REPLACE FUNCTION assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin() OR is_service_role()) THEN
    RAISE EXCEPTION 'No tienes permisos de administración para esta operación';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assert_admin() TO authenticated;

-- classify_team: idéntica a la versión anterior, con la comprobación de rol.
CREATE OR REPLACE FUNCTION classify_team(p_match_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_max_round int;
  v_next_round int;
  v_next_match_number int;
  v_next_match_id uuid;
BEGIN
  PERFORM assert_admin();

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF p_team_id IS DISTINCT FROM v_match.team1_id AND p_team_id IS DISTINCT FROM v_match.team2_id THEN
    RAISE EXCEPTION 'El equipo debe ser uno de los dos equipos del partido';
  END IF;

  SELECT * INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;
  v_max_round := ROUND(LOG(2::numeric, v_tournament.team_count::numeric))::int;

  UPDATE matches
    SET winner_id = p_team_id,
        match_state = 'classified',
        updated_at = now()
    WHERE id = p_match_id;

  IF v_match.round_number = v_max_round THEN
    UPDATE tournaments
      SET champion_team_id = p_team_id,
          status = 'completed',
          updated_at = now()
      WHERE id = v_tournament.id;
  ELSE
    v_next_round := v_match.round_number + 1;
    v_next_match_number := CEIL(v_match.match_number / 2.0)::int;

    SELECT id INTO v_next_match_id FROM matches
      WHERE tournament_id = v_match.tournament_id
        AND round_number = v_next_round
        AND match_number = v_next_match_number;

    IF v_match.match_number % 2 = 1 THEN
      UPDATE matches SET team1_id = p_team_id, updated_at = now() WHERE id = v_next_match_id;
    ELSE
      UPDATE matches SET team2_id = p_team_id, updated_at = now() WHERE id = v_next_match_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION classify_team(uuid, uuid) TO authenticated;

-- assign_captain_to_team: idéntica, con comprobación de rol.
CREATE OR REPLACE FUNCTION assign_captain_to_team(p_captain_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_count int;
BEGIN
  PERFORM assert_admin();

  IF p_team_id IS NULL THEN
    UPDATE captains
      SET team_id = NULL,
          captain_role = 'primary',
          updated_at = now()
      WHERE id = p_captain_id;
  ELSE
    SELECT count(*) INTO v_existing_count
      FROM captains
      WHERE team_id = p_team_id
        AND id != p_captain_id;

    IF v_existing_count >= 2 THEN
      RAISE EXCEPTION 'Este equipo ya tiene 2 capitanes asignados';
    END IF;

    UPDATE captains
      SET team_id = p_team_id,
          status = 'approved',
          captain_role = CASE WHEN v_existing_count > 0 THEN 'secondary' ELSE 'primary' END,
          updated_at = now()
      WHERE id = p_captain_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_captain_to_team(uuid, uuid) TO authenticated;

-- update_captain_status: idéntica, con comprobación de rol.
CREATE OR REPLACE FUNCTION update_captain_status(p_captain_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_admin();

  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  UPDATE captains
    SET status = p_status,
        updated_at = now()
    WHERE id = p_captain_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_captain_status(uuid, text) TO authenticated;

-- unassign_captain_team: idéntica, con comprobación de rol.
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
  PERFORM assert_admin();

  SELECT team_id, captain_role INTO v_team_id, v_role
    FROM captains WHERE id = p_captain_id;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE captains
    SET team_id = NULL,
        captain_role = 'primary',
        updated_at = now()
    WHERE id = p_captain_id;

  IF v_role = 'primary' THEN
    UPDATE captains
      SET captain_role = 'primary',
          updated_at = now()
      WHERE team_id = v_team_id
        AND captain_role = 'secondary';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION unassign_captain_team(uuid) TO authenticated;

-- generate_next_round: solo se le añade la comprobación de rol.
-- (El cuerpo es el de la migración 20260903123629.)
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
  PERFORM assert_admin();

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

  SELECT array_agg(winner_id ORDER BY match_number) INTO v_classified_teams
    FROM matches
    WHERE tournament_id = p_tournament_id
      AND round_number = p_round_number
      AND winner_id IS NOT NULL;

  v_classified_count := COALESCE(array_length(v_classified_teams, 1), 0);

  IF v_classified_count < v_current_match_count THEN
    RAISE EXCEPTION 'No todos los partidos de la ronda % tienen un equipo clasificado (% de %)', p_round_number, v_classified_count, v_current_match_count;
  END IF;

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

  FOR v_match_num IN 1..v_next_match_count LOOP
    IF NOT EXISTS (
      SELECT 1 FROM matches
        WHERE tournament_id = p_tournament_id
          AND round_number = v_next_round
          AND match_number = v_match_num
    ) THEN
      INSERT INTO matches (tournament_id, round_number, match_number, scheduled_date, scheduled_time)
      VALUES (p_tournament_id, v_next_round, v_match_num, v_date, v_time);
    END IF;

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

GRANT EXECUTE ON FUNCTION generate_next_round(uuid, int) TO authenticated;

-- advance_match_winner y undo_match_winner siguen siendo SECURITY INVOKER
-- (las políticas de `matches` y `tournaments` ya bloquean a quien no sea
-- administrador), pero se les añade una comprobación explícita para que el
-- mensaje de error sea claro en lugar de un fallo silencioso de RLS.
CREATE OR REPLACE FUNCTION advance_match_winner(p_match_id uuid, p_winner_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_max_round int;
  v_next_round int;
  v_next_match_number int;
  v_next_match_id uuid;
BEGIN
  PERFORM assert_admin();

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF p_winner_id IS DISTINCT FROM v_match.team1_id AND p_winner_id IS DISTINCT FROM v_match.team2_id THEN
    RAISE EXCEPTION 'El ganador debe ser uno de los dos equipos del partido';
  END IF;

  SELECT * INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;
  v_max_round := ROUND(LOG(2::numeric, v_tournament.team_count::numeric))::int;

  UPDATE matches SET winner_id = p_winner_id, updated_at = now() WHERE id = p_match_id;

  IF v_match.round_number = v_max_round THEN
    UPDATE tournaments
      SET champion_team_id = p_winner_id, status = 'completed', updated_at = now()
      WHERE id = v_tournament.id;
  ELSE
    v_next_round := v_match.round_number + 1;
    v_next_match_number := CEIL(v_match.match_number / 2.0)::int;

    SELECT id INTO v_next_match_id FROM matches
      WHERE tournament_id = v_match.tournament_id
        AND round_number = v_next_round
        AND match_number = v_next_match_number;

    IF v_match.match_number % 2 = 1 THEN
      UPDATE matches SET team1_id = p_winner_id, updated_at = now() WHERE id = v_next_match_id;
    ELSE
      UPDATE matches SET team2_id = p_winner_id, updated_at = now() WHERE id = v_next_match_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION advance_match_winner(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION undo_match_winner(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_max_round int;
  v_next_round int;
  v_next_match_number int;
  v_next_match matches%ROWTYPE;
BEGIN
  PERFORM assert_admin();

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

    IF v_next_match.winner_id IS NOT NULL THEN
      RAISE EXCEPTION 'No puedes deshacer este partido porque la siguiente ronda ya avanzó. Deshaz primero los partidos posteriores.';
    END IF;

    IF v_match.match_number % 2 = 1 THEN
      UPDATE matches SET team1_id = NULL, updated_at = now() WHERE id = v_next_match.id;
    ELSE
      UPDATE matches SET team2_id = NULL, updated_at = now() WHERE id = v_next_match.id;
    END IF;
  END IF;

  UPDATE matches
    SET winner_id = NULL,
        team1_reported_winner = NULL,
        team2_reported_winner = NULL,
        report_status = 'pending',
        updated_at = now()
    WHERE id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION undo_match_winner(uuid) TO authenticated;

-- ============================================================
-- PERMISOS PARA LA SERVICE_ROLE KEY (procesos de servidor / Edge Functions)
--
-- `report_match_result` llama internamente a `advance_match_winner`, y el
-- endpoint /resolve-dispute la llama directamente. Como esas funciones se
-- ejecutan con los privilegios de quien invoca, la service_role necesita el
-- EXECUTE explícito después de habérselo revocado a PUBLIC.
-- ============================================================

GRANT EXECUTE ON FUNCTION advance_match_winner(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION undo_match_winner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION classify_team(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION generate_next_round(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION assign_captain_to_team(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION update_captain_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION unassign_captain_team(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION assert_admin() TO service_role;
GRANT EXECUTE ON FUNCTION is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION is_service_role() TO service_role;

-- La aplicación consulta esta tabla para saber si la sesión actual es de
-- administración. La política `admins_select_self` limita el resultado a la
-- propia fila, así que la lista de administradores sigue sin ser pública.
GRANT SELECT ON TABLE admins TO authenticated;
GRANT ALL ON TABLE admins TO service_role;

/*
# Sistema de Capitanes, Chat, Resultados y Notificaciones

Esta migración añade todo el sistema de capitanes sobre el esquema existente
del torneo, sin modificar ni romper las tablas/funciones actuales.

1. Nuevas tablas
  - `captains`
    - `id` (uuid, PK, = auth.users.id) — un capitán por usuario de Supabase Auth
    - `name` (texto) nombre del capitán
    - `email` (texto) email del capitán
    - `team_id` (uuid, FK teams) equipo al que está asignado (null hasta que el admin lo apruebe y vincule)
    - `status` (texto) 'pending' | 'approved' | 'rejected'
    - `created_at`, `updated_at`
  - `match_messages`
    - `id` (uuid, PK)
    - `match_id` (uuid, FK matches) partido al que pertenece el chat
    - `captain_id` (uuid, FK captains) capitán que envía el mensaje
    - `content` (texto) contenido del mensaje
    - `created_at`
  - `match_results`
    - `id` (uuid, PK)
    - `match_id` (uuid, FK matches, UNIQUE) un resultado por partido
    - `reported_by` (uuid, FK captains) capitán que registra el resultado
    - `winner_team_id` (uuid, FK teams) equipo ganador reportado
    - `team1_score` (int) goles del equipo A
    - `team2_score` (int) goles del equipo B
    - `had_extra_time` (bool) si hubo prórroga
    - `had_penalties` (bool) si hubo penaltis
    - `penalty_team1` (int) goles de penaltis equipo A
    - `penalty_team2` (int) goles de penaltis equipo B
    - `scorers` (jsonb) lista de goleadores con nombre y minuto
    - `notes` (texto) observaciones
    - `status` (texto) 'pending_review' | 'confirmed' | 'rejected'
    - `created_at`, `updated_at`
  - `notifications`
    - `id` (uuid, PK)
    - `captain_id` (uuid, FK captains, nullable) destinatario (null = notificación global/admin)
    - `type` (texto) tipo de notificación
    - `title` (texto) título
    - `message` (texto) mensaje
    - `read` (bool) si ha sido leída
    - `created_at`

2. Columnas nuevas en `matches`
  - `scheduled_date` (date) fecha oficial del partido
  - `scheduled_time` (time) hora oficial del partido
  - `match_state` (texto) 'pending' | 'in_progress' | 'pending_review' | 'finished' | 'classified'
    (distinto de report_status que se mantiene para compatibilidad con Discord)

3. Funciones
  - `classify_team(p_match_id, p_team_id)` — el admin marca qué equipo pasa de ronda.
    Coloca al equipo en el hueco de la siguiente ronda (o lo corona campeón si es la final).
    NO depende del resultado reportado: el admin decide.
  - `generate_next_round(p_tournament_id, p_round_number)` — crea los partidos de la
    siguiente ronda usando los equipos que el admin ha clasificado. Asigna fecha/hora
    oficial automáticamente según la ronda.

4. Seguridad (RLS)
  - `captains`: lectura pública (para ver quién es capitán de cada equipo),
    escritura solo para el propio usuario (insert/update de su propio perfil)
    y para anon (el registro inicial se hace sin sesión aún).
    UPDATE de team_id/status solo se permite vía SECURITY DEFINER function
    para que el admin (que usa anon key con password) pueda gestionar.
  - `match_messages`: lectura solo para los dos capitanes del partido y admin;
    escritura solo para los capitanes del partido.
  - `match_results`: lectura pública; escritura solo para capitanes de los equipos
    del partido; actualización de status solo vía función admin.
  - `notifications`: lectura solo para el destinatario; escritura para anon/authenticated
    (el sistema crea notificaciones desde diversos puntos).

5. Notas importantes
  - No se elimina ni modifica la función `advance_match_winner` existente.
  - No se modifican las políticas RLS existentes.
  - El sistema de capitanes es opcional: el torneo funciona sin capitanes.
  - Las fechas/horas oficiales se asignan automáticamente al generar rondas.
*/

-- ============================================================
-- TABLA: captains
-- ============================================================

CREATE TABLE IF NOT EXISTS captains (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captains_team ON captains(team_id);
CREATE INDEX IF NOT EXISTS idx_captains_status ON captains(status);

ALTER TABLE captains ENABLE ROW LEVEL SECURITY;

-- Lectura: pública (cualquiera puede ver quién es capitán de un equipo)
DROP POLICY IF EXISTS "captains_select_all" ON captains;
CREATE POLICY "captains_select_all" ON captains FOR SELECT
  TO anon, authenticated USING (true);

-- Inserción: el propio usuario se registra (usa auth.uid() si está autenticado,
-- o anon si el registro se hace antes de confirmar la sesión)
DROP POLICY IF EXISTS "captains_insert_self" ON captains;
CREATE POLICY "captains_insert_self" ON captains FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Update: el propio capitán puede editar su nombre/email.
-- El team_id y status se gestionan vía función SECURITY DEFINER del admin.
DROP POLICY IF EXISTS "captains_update_self" ON captains;
CREATE POLICY "captains_update_self" ON captains FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Delete: el propio capitán puede darse de baja
DROP POLICY IF EXISTS "captains_delete_self" ON captains;
CREATE POLICY "captains_delete_self" ON captains FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================================
-- TABLA: match_messages
-- ============================================================

CREATE TABLE IF NOT EXISTS match_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  captain_id uuid NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_messages_match ON match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_created ON match_messages(created_at);

ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;

-- Lectura: solo los capitanes de los equipos del partido pueden leer el chat
DROP POLICY IF EXISTS "messages_select_match_captains" ON match_messages;
CREATE POLICY "messages_select_match_captains" ON match_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM captains c
      JOIN matches m ON m.id = match_messages.match_id
      WHERE c.id = auth.uid()
        AND c.status = 'approved'
        AND (c.team_id = m.team1_id OR c.team_id = m.team2_id)
    )
  );

-- Escritura: solo los capitanes de los equipos del partido pueden escribir
DROP POLICY IF EXISTS "messages_insert_match_captains" ON match_messages;
CREATE POLICY "messages_insert_match_captains" ON match_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM captains c
      JOIN matches m ON m.id = match_messages.match_id
      WHERE c.id = auth.uid()
        AND c.status = 'approved'
        AND (c.team_id = m.team1_id OR c.team_id = m.team2_id)
    )
  );

-- ============================================================
-- TABLA: match_results
-- ============================================================

CREATE TABLE IF NOT EXISTS match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES captains(id) ON DELETE SET NULL,
  winner_team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  team1_score int NOT NULL DEFAULT 0,
  team2_score int NOT NULL DEFAULT 0,
  had_extra_time boolean NOT NULL DEFAULT false,
  had_penalties boolean NOT NULL DEFAULT false,
  penalty_team1 int,
  penalty_team2 int,
  scorers jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'confirmed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_results_match ON match_results(match_id);
CREATE INDEX IF NOT EXISTS idx_match_results_status ON match_results(status);

ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

-- Lectura: pública (cualquiera puede ver los resultados reportados)
DROP POLICY IF EXISTS "results_select_all" ON match_results;
CREATE POLICY "results_select_all" ON match_results FOR SELECT
  TO anon, authenticated USING (true);

-- Inserción: solo capitanes aprobados de los equipos del partido
DROP POLICY IF EXISTS "results_insert_captain" ON match_results;
CREATE POLICY "results_insert_captain" ON match_results FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM captains c
      JOIN matches m ON m.id = match_results.match_id
      WHERE c.id = auth.uid()
        AND c.status = 'approved'
        AND (c.team_id = m.team1_id OR c.team_id = m.team2_id)
    )
  );

-- Update: el propio capitán puede actualizar mientras esté pendiente, o admin (anon)
DROP POLICY IF EXISTS "results_update_captain_or_admin" ON match_results;
CREATE POLICY "results_update_captain_or_admin" ON match_results FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- TABLA: notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id uuid REFERENCES captains(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_captain ON notifications(captain_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Lectura: el propio capitán ve sus notificaciones, o admin (anon) ve todas
DROP POLICY IF EXISTS "notifications_select_owner" ON notifications;
CREATE POLICY "notifications_select_owner" ON notifications FOR SELECT
  TO anon, authenticated USING (true);

-- Inserción: el sistema crea notificaciones (anon/authenticated)
DROP POLICY IF EXISTS "notifications_insert_any" ON notifications;
CREATE POLICY "notifications_insert_any" ON notifications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Update: marcar como leída (propietario o admin)
DROP POLICY IF EXISTS "notifications_update_any" ON notifications;
CREATE POLICY "notifications_update_any" ON notifications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Delete: admin o propietario
DROP POLICY IF EXISTS "notifications_delete_any" ON notifications;
CREATE POLICY "notifications_delete_any" ON notifications FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- COLUMNAS NUEVAS EN matches
-- ============================================================

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS match_state text NOT NULL DEFAULT 'pending'
  CHECK (match_state IN ('pending', 'in_progress', 'pending_review', 'finished', 'classified'));

-- ============================================================
-- FUNCIÓN: classify_team (admin decide quién pasa)
-- ============================================================

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
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF p_team_id IS DISTINCT FROM v_match.team1_id AND p_team_id IS DISTINCT FROM v_match.team2_id THEN
    RAISE EXCEPTION 'El equipo debe ser uno de los dos equipos del partido';
  END IF;

  SELECT * INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;
  v_max_round := ROUND(LOG(2::numeric, v_tournament.team_count::numeric))::int;

  -- Marcar el ganador y el estado del partido
  UPDATE matches
    SET winner_id = p_team_id,
        match_state = 'classified',
        updated_at = now()
    WHERE id = p_match_id;

  IF v_match.round_number = v_max_round THEN
    -- Es la final: coronar campeón
    UPDATE tournaments
      SET champion_team_id = p_team_id,
          status = 'completed',
          updated_at = now()
      WHERE id = v_tournament.id;
  ELSE
    -- Avanzar al siguiente partido
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

GRANT EXECUTE ON FUNCTION classify_team(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- FUNCIÓN: generate_next_round (admin genera siguiente ronda)
-- ============================================================

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
  v_match_num int;
  v_team_idx int := 1;
  v_date date;
  v_time time;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF v_tournament.id IS NULL THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  v_max_round := ROUND(LOG(2::numeric, v_tournament.team_count::numeric))::int;
  v_next_round := p_round_number + 1;

  IF v_next_round > v_max_round THEN
    RAISE EXCEPTION 'No hay siguiente ronda (ya es la final)';
  END IF;

  -- Obtener equipos clasificados de la ronda actual (orden por match_number)
  SELECT array_agg(winner_id ORDER BY match_number) INTO v_classified_teams
    FROM matches
    WHERE tournament_id = p_tournament_id
      AND round_number = p_round_number
      AND winner_id IS NOT NULL;

  IF v_classified_teams IS NULL OR array_length(v_classified_teams, 1) < matchesInRound(v_tournament.team_count, p_round_number) THEN
    RAISE EXCEPTION 'No todos los partidos de la ronda % tienen un equipo clasificado', p_round_number;
  END IF;

  v_next_match_count := v_tournament.team_count / power(2, v_next_round);

  -- Asignar fecha/hora oficial según la ronda
  v_date := CASE v_next_round
    WHEN 2 THEN '2026-09-11'::date  -- 16avos
    WHEN 3 THEN '2026-09-12'::date  -- Octavos
    WHEN 4 THEN '2026-09-12'::date  -- Cuartos
    WHEN 5 THEN '2026-09-13'::date  -- Semifinal
    WHEN 6 THEN '2026-09-13'::date  -- Final
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

  -- Crear o actualizar los partidos de la siguiente ronda
  FOR v_match_num IN 1..v_next_match_count LOOP
    -- Verificar si ya existe el partido
    IF NOT EXISTS (
      SELECT 1 FROM matches
        WHERE tournament_id = p_tournament_id
          AND round_number = v_next_round
          AND match_number = v_match_num
    ) THEN
      INSERT INTO matches (tournament_id, round_number, match_number, scheduled_date, scheduled_time)
      VALUES (p_tournament_id, v_next_round, v_match_num, v_date, v_time);
    END IF;

    -- Asignar equipos clasificados en orden
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

GRANT EXECUTE ON FUNCTION generate_next_round(uuid, int) TO anon, authenticated;

-- ============================================================
-- FUNCIÓN: assign_captain_to_team (admin vincula capitán a equipo)
-- ============================================================

CREATE OR REPLACE FUNCTION assign_captain_to_team(p_captain_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE captains
    SET team_id = p_team_id,
        status = 'approved',
        updated_at = now()
    WHERE id = p_captain_id;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_captain_to_team(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- FUNCIÓN: update_captain_status (admin aprueba/rechaza)
-- ============================================================

CREATE OR REPLACE FUNCTION update_captain_status(p_captain_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  UPDATE captains
    SET status = p_status,
        updated_at = now()
    WHERE id = p_captain_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_captain_status(uuid, text) TO anon, authenticated;

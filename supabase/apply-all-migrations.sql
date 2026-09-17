-- ============================================================
-- CASEMURO CUP — todas las migraciones en un solo archivo
--
-- Generado automaticamente a partir de supabase/migrations/.
-- Pega TODO este contenido en el SQL Editor de Supabase y ejecutalo.
--
-- Es seguro volver a ejecutarlo: las migraciones son idempotentes.
-- No lo edites a mano; la fuente de verdad es supabase/migrations/.
-- ============================================================


-- ############################################################
-- ## 20260815162523_create_tournament_schema.sql
-- ############################################################

/*
# Crear esquema del torneo de eliminatoria directa

Esta migración crea toda la estructura de datos para gestionar un torneo de
eliminatoria directa (32 o 64 equipos): configuración del torneo, equipos
participantes y los partidos del cuadro, además de un espacio de
almacenamiento público para los escudos de los equipos.

1. Nuevas tablas
  - `tournaments`
    - `id` (uuid, clave primaria)
    - `name` (texto) nombre del torneo
    - `team_count` (int) 32 o 64 equipos
    - `status` (texto) 'setup' | 'draw_in_progress' | 'bracket' | 'completed'
    - `draw_pool` (uuid[]) equipos restantes por sortear, en orden aleatorio
    - `current_draw_match` (int) número de partido que toca sortear
    - `champion_team_id` (uuid) equipo campeón una vez finalizado
    - `created_at`, `updated_at`
  - `teams`
    - `id` (uuid, clave primaria)
    - `tournament_id` (uuid) torneo al que pertenece
    - `team_number` (int) identificador interno secuencial y estable
    - `name` (texto) nombre del equipo
    - `logo_url` (texto) url pública del escudo subido
    - `created_at`
  - `matches`
    - `id` (uuid, clave primaria)
    - `tournament_id` (uuid)
    - `round_number` (int) ronda (1 = primera ronda del cuadro)
    - `match_number` (int) posición del partido dentro de la ronda
    - `team1_id`, `team2_id` (uuid) equipos enfrentados (null hasta sorteo/clasificación)
    - `winner_id` (uuid) equipo ganador (null hasta que se decide)
    - `created_at`, `updated_at`

2. Función `advance_match_winner`
  - Marca el ganador de un partido y automáticamente coloca su escudo/nombre
    en el hueco correspondiente del partido de la siguiente ronda, o marca
    al equipo como campeón si el partido era la final.

3. Seguridad
  - RLS activado en las 3 tablas. Esta aplicación no tiene inicio de sesión
    (es una herramienta de administración de uso compartido), por lo que las
    políticas permiten lectura y escritura a los roles `anon` y `authenticated`.
  - NOTA: estas políticas permisivas iniciales son sustituidas por la migración
    `20260917090000_secure_rls_roles.sql`, que separa visitante/capitán/admin.
  - Bucket de almacenamiento público `team-logos` para los escudos, con
    políticas equivalentes (lectura pública, escritura para anon/authenticated).

4. Datos iniciales
  - Se crea un torneo vacío por defecto de 32 equipos, necesario para que la
    aplicación arranque. Los equipos de ejemplo están en `supabase/seed.sql`.
*/

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Copa del Torneo',
  team_count int NOT NULL DEFAULT 32 CHECK (team_count IN (32, 64)),
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'draw_in_progress', 'bracket', 'completed')),
  draw_pool uuid[] NOT NULL DEFAULT '{}',
  current_draw_match int NOT NULL DEFAULT 1,
  champion_team_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_number int NOT NULL,
  name text NOT NULL,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  match_number int NOT NULL,
  team1_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  team2_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  winner_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_number, match_number)
);

CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tournaments_champion_team_fkey'
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT tournaments_champion_team_fkey
      FOREIGN KEY (champion_team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION assign_team_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.team_number IS NULL THEN
    SELECT COALESCE(MAX(team_number), 0) + 1 INTO NEW.team_number
    FROM teams WHERE tournament_id = NEW.tournament_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_team_number ON teams;
CREATE TRIGGER trg_assign_team_number
  BEFORE INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION assign_team_number();

CREATE OR REPLACE FUNCTION advance_match_winner(p_match_id uuid, p_winner_id uuid)
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
BEGIN
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

GRANT EXECUTE ON FUNCTION advance_match_winner(uuid, uuid) TO anon, authenticated;

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tournaments" ON tournaments;
CREATE POLICY "anon_select_tournaments" ON tournaments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tournaments" ON tournaments;
CREATE POLICY "anon_insert_tournaments" ON tournaments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tournaments" ON tournaments;
CREATE POLICY "anon_update_tournaments" ON tournaments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tournaments" ON tournaments;
CREATE POLICY "anon_delete_tournaments" ON tournaments FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_teams" ON teams;
CREATE POLICY "anon_select_teams" ON teams FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_teams" ON teams;
CREATE POLICY "anon_insert_teams" ON teams FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_teams" ON teams;
CREATE POLICY "anon_update_teams" ON teams FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_teams" ON teams;
CREATE POLICY "anon_delete_teams" ON teams FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_matches" ON matches;
CREATE POLICY "anon_select_matches" ON matches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_matches" ON matches;
CREATE POLICY "anon_insert_matches" ON matches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_matches" ON matches;
CREATE POLICY "anon_update_matches" ON matches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_matches" ON matches;
CREATE POLICY "anon_delete_matches" ON matches FOR DELETE TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('team-logos', 'team-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "team_logos_public_read" ON storage.objects;
CREATE POLICY "team_logos_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'team-logos');
DROP POLICY IF EXISTS "team_logos_anon_insert" ON storage.objects;
CREATE POLICY "team_logos_anon_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'team-logos');
DROP POLICY IF EXISTS "team_logos_anon_update" ON storage.objects;
CREATE POLICY "team_logos_anon_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'team-logos') WITH CHECK (bucket_id = 'team-logos');
DROP POLICY IF EXISTS "team_logos_anon_delete" ON storage.objects;
CREATE POLICY "team_logos_anon_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'team-logos');

DO $$
DECLARE
  v_count int;
BEGIN
  -- Crea el torneo por defecto si la base de datos está vacía.
  -- (Los equipos de demostración se han movido a `supabase/seed.sql`,
  --  que es opcional y no se ejecuta automáticamente.)
  SELECT COUNT(*) INTO v_count FROM tournaments;
  IF v_count = 0 THEN
    INSERT INTO tournaments (name, team_count, status)
    VALUES ('CASEMURO CUP', 32, 'setup');
  END IF;
END $$;


-- ############################################################
-- ## 20260815162544_fix_function_search_path.sql
-- ############################################################

/*
# Fijar search_path en funciones

Ajuste de seguridad menor: fija `search_path = public` en las funciones
`assign_team_number` y `advance_match_winner` para que no dependan de un
search_path mutable por rol.
*/

ALTER FUNCTION assign_team_number() SET search_path = public;
ALTER FUNCTION advance_match_winner(uuid, uuid) SET search_path = public;


-- ############################################################
-- ## 20260817142824_add_discord_reporting.sql
-- ############################################################

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


-- ############################################################
-- ## 20260819121917_add_undo_match_winner.sql
-- ############################################################

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


-- ############################################################
-- ## 20260903123610_add_captain_system.sql
-- ############################################################

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


-- ############################################################
-- ## 20260903123629_fix_generate_next_round.sql
-- ############################################################

/*
# Fix generate_next_round function

The previous version referenced `matchesInRound()` which is a TypeScript helper,
not a SQL function. Replace with the inline formula: team_count / 2^round_number.
Also fix the array length check to use the correct count.
*/

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

  -- Obtener equipos clasificados de la ronda actual (orden por match_number)
  SELECT array_agg(winner_id ORDER BY match_number) INTO v_classified_teams
    FROM matches
    WHERE tournament_id = p_tournament_id
      AND round_number = p_round_number
      AND winner_id IS NOT NULL;

  v_classified_count := COALESCE(array_length(v_classified_teams, 1), 0);

  IF v_classified_count < v_current_match_count THEN
    RAISE EXCEPTION 'No todos los partidos de la ronda % tienen un equipo clasificado (% de %)', p_round_number, v_classified_count, v_current_match_count;
  END IF;

  -- Asignar fecha/hora oficial según la ronda
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


-- ############################################################
-- ## 20260904180635_enable_realtime_chat.sql
-- ############################################################

/*
# Activar Realtime en tablas del sistema de capitanes

1. Cambios
- Añade las tablas `match_messages` y `notifications` a la publicación `supabase_realtime`
  para que los cambios en estas tablas se emitan en tiempo real a través de WebSockets.
- Esto permite que el chat del partido se actualice al instante sin necesidad de refrescar,
  y que las notificaciones aparezcan en tiempo real.

2. Notas
- No se modifican políticas RLS ni estructura de tablas.
- Solo se añaden las tablas a la publicación de realtime.
- Es seguro porque las políticas RLS ya controlan qué datos puede ver cada usuario.
*/

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['match_messages', 'notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- ############################################################
-- ## 20260904181557_enable_realtime_all_tables.sql
-- ############################################################

/*
# Activar Realtime en todas las tablas del torneo

1. Cambios
- Añade las tablas `tournaments`, `teams`, `matches`, `captains` y `match_results`
  a la publicación `supabase_realtime` para que cualquier cambio en estas tablas
  se emita en tiempo real a través de WebSockets.

2. Motivo
- Permite que todos los visitantes de la web vean los cambios al instante:
  cuando el admin añade/edita/elimina equipos, genera el cuadro, marca resultados,
  clasifica equipos, o asigna capitanes, todas las pantallas conectadas se actualizan
  sin necesidad de refrescar la página.

3. Notas
- No se modifican políticas RLS ni estructura de tablas.
- Las políticas RLS existentes controlan qué datos puede ver cada usuario.
- Las tablas `match_messages` y `notifications` ya fueron añadidas en una migración anterior.
*/

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tournaments', 'teams', 'matches', 'captains', 'match_results'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- ############################################################
-- ## 20260904182919_add_second_captain_and_chat_names.sql
-- ############################################################

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


-- ############################################################
-- ## 20260905163410_add_is_read_to_messages.sql
-- ############################################################

/*
# Marcar mensajes del chat como leídos/no leídos

1. Cambios en la tabla `match_messages`
- Añade la columna `is_read` (boolean, por defecto false).
- Los mensajes que envía un capitán se marcan como is_read=false para que el
  destinatario (el otro equipo) vea que tiene mensajes nuevos.
- Cuando un capitán abre el chat, se marcan como leídos todos los mensajes
  del partido que no son suyos.

2. Índice
- Índice en (match_id, is_read) para consultar mensajes no leídos rápidamente.

3. Notas
- No se eliminan columnas ni se cambian tipos existentes.
- Las políticas RLS existentes siguen siendo válidas.
*/

ALTER TABLE match_messages
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_match_messages_unread
  ON match_messages(match_id, is_read)
  WHERE is_read = false;


-- ############################################################
-- ## 20260917090000_secure_rls_roles.sql
-- ############################################################

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


-- ############################################################
-- ## 20260917100000_remove_discord_integration.sql
-- ############################################################

/*
# Retirar la integración con Discord

El torneo ya no usa Discord: se han eliminado del repositorio el bot
(`discord-bot/`) y la Edge Function `discord-api`. Esta migración limpia lo
que quedaba en la base de datos para dar servicio exclusivamente a ese bot.

1. Se elimina
  - `report_match_result(uuid, int, uuid)` — solo la llamaba la Edge Function
    con la service_role key. Los resultados se reportan desde el panel del
    capitán (tabla `match_results`) y los valida la organización.
  - `teams.discord_rep_id` — id de Discord del representante del equipo.
  - `matches.discord_message_id` — id del mensaje publicado por el bot.

2. Se MANTIENE a propósito
  - `matches.report_status` y `matches.team1_reported_winner` /
    `team2_reported_winner`. Aunque nacieron con el sistema de Discord, el
    cuadro de la web los sigue leyendo para marcar los partidos en disputa
    (`BracketMatch.tsx`, `MatchCard.tsx`). Borrarlos cambiaría la interfaz,
    así que se dejan como están: simplemente ya nada los rellena
    automáticamente y la organización sigue pudiendo usarlos.
  - `undo_match_winner`, que limpia esas columnas al deshacer un resultado.

3. Seguridad
  - No cambia ninguna política RLS.
*/

DROP FUNCTION IF EXISTS report_match_result(uuid, int, uuid);

ALTER TABLE teams   DROP COLUMN IF EXISTS discord_rep_id;
ALTER TABLE matches DROP COLUMN IF EXISTS discord_message_id;


-- ############################################################
-- ## 20260917110000_add_change_tracking.sql
-- ############################################################

/*
# Marcas de cambio fiables para detectar actualizaciones

Los visitantes sin sesión dejan de usar Realtime (ver `useTournament.ts`) y
pasan a preguntar cada pocos segundos, con una consulta mínima, si algo ha
cambiado. Para que esa consulta sea de fiar, `updated_at` tiene que moverse
SIEMPRE que se modifica una fila.

Hoy no es así:
  - `teams` no tiene columna `updated_at`.
  - Varias escrituras desde la aplicación actualizan filas de `matches` sin
    tocar `updated_at` (por ejemplo al asignar los equipos del sorteo a los
    partidos de la primera ronda).

1. Cambios
  - Nueva columna `teams.updated_at` (timestamptz, por defecto now()).
  - Nueva función `set_updated_at()` y triggers BEFORE UPDATE en
    `tournaments`, `teams` y `matches`, que ponen `updated_at = now()` en
    cada modificación.

2. Notas
  - No cambia ninguna política RLS ni ningún dato existente.
  - Las funciones que ya asignaban `updated_at = now()` a mano siguen
    funcionando igual: el trigger escribe el mismo valor.
  - `teams.created_at` no se toca.
*/

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON tournaments;
CREATE TRIGGER trg_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_matches_updated_at ON matches;
CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ############################################################
-- ## 20260917120000_fix_privilege_guard.sql
-- ############################################################

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


-- ############################################################
-- ## 20260917130000_incidents_and_result_evidence.sql
-- ############################################################

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


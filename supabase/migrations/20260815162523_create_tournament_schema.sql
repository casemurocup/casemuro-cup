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

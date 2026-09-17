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

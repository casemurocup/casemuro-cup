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

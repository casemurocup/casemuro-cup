/*
# Fijar search_path en funciones

Ajuste de seguridad menor: fija `search_path = public` en las funciones
`assign_team_number` y `advance_match_winner` para que no dependan de un
search_path mutable por rol.
*/

ALTER FUNCTION assign_team_number() SET search_path = public;
ALTER FUNCTION advance_match_winner(uuid, uuid) SET search_path = public;

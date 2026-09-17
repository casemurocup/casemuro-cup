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

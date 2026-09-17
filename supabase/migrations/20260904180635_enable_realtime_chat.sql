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

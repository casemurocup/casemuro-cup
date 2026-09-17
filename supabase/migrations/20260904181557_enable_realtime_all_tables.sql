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

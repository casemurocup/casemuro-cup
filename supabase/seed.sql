/*
# Datos opcionales de ejemplo

Este archivo NO se ejecuta automáticamente con las migraciones. Ejecútalo a
mano (SQL Editor de Supabase) solo si quieres rellenar el torneo con equipos
de prueba. Antes estaban dentro de la primera migración, lo que obligaba a
borrarlos a mano en cada proyecto nuevo.

El panel de administración también tiene un botón "equipos demo" que hace lo
mismo desde la interfaz.
*/

INSERT INTO teams (tournament_id, name)
SELECT t.id, v.name
  FROM (SELECT id FROM tournaments ORDER BY created_at LIMIT 1) t
 CROSS JOIN (VALUES
    ('Real Madrid'),
    ('Barcelona'),
    ('Atlético Madrid'),
    ('Valencia'),
    ('Sevilla'),
    ('Athletic Club'),
    ('Real Sociedad'),
    ('Villarreal')
 ) AS v(name)
 WHERE NOT EXISTS (SELECT 1 FROM teams);

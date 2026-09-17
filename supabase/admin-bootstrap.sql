/*
# Dar de alta al administrador

Ser administrador = tener una fila en la tabla `admins`. No hay ninguna
contraseña en el código de la aplicación.

PASOS
-----

1. En el panel de Supabase: Authentication → Users → "Add user" →
   "Create new user".
     - Email:    el que uses como cuenta de administración
                 (ej. admin@casemurocup.com)
     - Password: la contraseña que escribirás en la pantalla
                 "Administración" de la web
     - Marca "Auto Confirm User" para no tener que confirmar el email.

2. Ejecuta este SQL sustituyendo el email por el que acabas de crear.

3. Pon ese mismo email en la variable de entorno VITE_ADMIN_EMAIL del hosting
   (Cloudflare Pages / Vercel) y en tu .env local.

Para cambiar la contraseña de administrador en el futuro: Authentication →
Users → el usuario → "Reset password" (o "Update password"). No hay que tocar
ni el código ni volver a desplegar.
*/

INSERT INTO admins (id, email)
SELECT u.id, u.email
  FROM auth.users u
 WHERE u.email = 'CAMBIA_ESTO@ejemplo.com'
ON CONFLICT (id) DO NOTHING;

-- Comprobación: debe devolver una fila.
SELECT * FROM admins;

# Casemuro Cup

Aplicación web del torneo de eliminatoria directa Casemuro Cup: cuadro,
sorteo en directo, panel de administración, panel de capitanes con chat y
reporte de resultados.

Stack: **Vite + React + TypeScript + Tailwind** en el frontend y **Supabase**
(PostgreSQL, Auth, Realtime, Storage) en el backend.

---

## 1. Requisitos

- Node.js 20 o superior (ver `.nvmrc`)
- Una cuenta gratuita de [Supabase](https://supabase.com)

## 2. Puesta en marcha en local

```bash
npm install
cp .env.example .env   # y rellena los valores
npm run dev
```

Otros comandos:

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprueba tipos y genera `dist/` |
| `npm run preview` | Sirve el `dist/` generado |
| `npm run lint` | ESLint |
| `npm run typecheck` | Solo comprobación de tipos |

Convención del proyecto: los módulos se importan con el alias `@/`, que apunta
a `src/` (por ejemplo `@/components/Bracket/Bracket`), en lugar de rutas
relativas profundas.

## 3. Variables de entorno

| Variable | Obligatoria | Dónde se consigue |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Sí | Supabase → Project Settings → Data API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Sí | Supabase → Project Settings → API Keys → `anon` |
| `VITE_ADMIN_EMAIL` | Sí (para el panel de admin) | El email de la cuenta administradora que crees en el paso 4 |

La `anon key` es pública por diseño: viaja en el navegador. Quien protege los
datos son las políticas RLS de PostgreSQL, no esa clave.

**Nunca** pongas la `service_role key` en el frontend ni en ninguna variable
`VITE_*`: todo lo que empieza por `VITE_` acaba dentro del JavaScript que se
descarga el visitante.

## 4. Configurar Supabase desde cero

1. Crea un proyecto nuevo en Supabase (plan Free).
2. Aplica las migraciones, en orden, con una de estas dos vías:
   - **Supabase CLI** (recomendado):
     ```bash
     npx supabase link --project-ref <tu-project-ref>
     npx supabase db push
     ```
   - **Manual**: SQL Editor → pega el contenido de cada archivo de
     `supabase/migrations/` **en orden alfabético** y ejecútalo.
3. Crea la cuenta de administración: Authentication → Users → Add user →
   Create new user, marcando *Auto Confirm User*. Después ejecuta
   `supabase/admin-bootstrap.sql` (cambiando el email) en el SQL Editor.
4. Pon ese email en `VITE_ADMIN_EMAIL`. La contraseña de administrador es la
   de esa cuenta de Supabase: para cambiarla no hace falta tocar el código.
5. *(Opcional)* `supabase/seed.sql` añade 8 equipos de ejemplo.
6. *(Opcional)* Si quieres que los capitanes entren sin confirmar el email:
   Authentication → Providers → Email → desactiva *Confirm email*.

### Roles

| Rol | Cómo se identifica | Qué puede hacer |
| --- | --- | --- |
| Visitante | Sin sesión (`anon`) | Solo leer torneo, equipos y partidos |
| Capitán | Cuenta de Supabase Auth + fila en `captains` con `status = 'approved'` | Su ficha, el chat y el resultado de los partidos de **su** equipo |
| Administrador | Cuenta de Supabase Auth + fila en `admins` | Todo |

Estos permisos están aplicados en PostgreSQL (RLS + triggers + funciones
`SECURITY DEFINER`), no solo en la interfaz.

## 5. Despliegue

Ver la tabla de configuración exacta más abajo. El proyecto es una SPA
estática: cualquier hosting de sitios estáticos sirve.

### Cloudflare Workers (lo que está en uso)

| Ajuste | Valor |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Deploy command | `npx wrangler deploy` |

`wrangler.jsonc` declara los assets y el enrutado de SPA
(`not_found_handling: "single-page-application"`).

⚠️ Las variables `VITE_*` van en **Settings → Build → Build variables**, no en
las *Variables and Secrets* de runtime: Vite las incrusta al compilar, y para
cuando el Worker se ejecuta ya no hay nada que inyectar.

⚠️ No añadas un `public/_redirects`. En Workers, la regla `/* /index.html 200`
choca con `not_found_handling` y el despliegue se rechaza con
*"Infinite loop detected in this rule"*. En Cloudflare **Pages** sí hace falta.

### Vercel

`vercel.json` ya trae la configuración (build, output y rewrites). Solo hay
que añadir las variables de entorno en Settings → Environment Variables.

En ambos casos hay que configurar `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` y `VITE_ADMIN_EMAIL`, y **volver a desplegar** después
de añadirlas (Vite las incrusta en tiempo de build).

## 6. Consumo del plan gratuito de Supabase

El límite que antes se podía tocar en un torneo con mucha audiencia era el de
**conexiones simultáneas de Realtime** (unas 200 en el plan Free), porque cada
pestaña abierta ocupaba una.

Cómo está resuelto en `src/hooks/useTournament.ts`:

- **Capitanes y organización** (con sesión iniciada) usan **Realtime**: ven los
  cambios al instante, igual que siempre.
- **Visitantes** (sin sesión) consultan cada `POLL_INTERVAL_MS` (15 s) una
  firma diminuta —la marca de tiempo más reciente y el número de filas de
  `tournaments`, `teams` y `matches`, unos pocos bytes— y solo recargan el
  torneo completo cuando esa firma cambia. Con la pestaña en segundo plano no
  consultan nada.

Para que la detección sea exacta, la migración
`20260917110000_add_change_tracking.sql` añade triggers que actualizan
`updated_at` en cada escritura.

Si algún día quieres más inmediatez para los visitantes, baja
`POLL_INTERVAL_MS`; si quieres gastar menos transferencia, súbelo. El panel
*Usage* de Supabase te dice cuánto estás consumiendo de cada límite.

## 7. Estructura

```
src/
  components/   Admin, Auth, Bracket, Captain, Home, Layout, Rules, Teams, UI
  context/      Estado global (torneo, auth de capitán, notificaciones, presentación)
  hooks/        useTournament (datos + Realtime + Storage)
  lib/          Cliente de Supabase y utilidades del cuadro
  types/        Tipos compartidos
supabase/
  migrations/   Esquema, funciones y políticas RLS
  seed.sql      Equipos de ejemplo (opcional)
  admin-bootstrap.sql  Alta del administrador
```

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y rellénalas (o configúralas en tu hosting).',
  );
}

/**
 * Email de la cuenta de administración (Supabase Auth).
 *
 * La contraseña NO está en el código: es la contraseña de esa cuenta de
 * Supabase, y es lo que se escribe en la pantalla "Administración".
 */
export const adminEmail: string = import.meta.env.VITE_ADMIN_EMAIL ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

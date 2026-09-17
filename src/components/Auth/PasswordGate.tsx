import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, ShieldCheck, UserRound } from 'lucide-react';
import { adminEmail, supabase } from '@/lib/supabase';

const STORAGE_KEY = 'casemuro-access';

export type AccessRole = 'admin' | 'user';

export function getAccessRole(): AccessRole | null {
  const role = sessionStorage.getItem(STORAGE_KEY);
  if (role === 'admin' || role === 'user') return role;
  if (role === 'granted') return 'admin';
  return null;
}

export function grantAccess(role: AccessRole) {
  sessionStorage.setItem(STORAGE_KEY, role);
}

export function revokeAccess() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Comprueba que la sesión actual de Supabase pertenece a un administrador.
 *
 * La marca de sessionStorage solo controla qué pinta React; los permisos
 * reales los da esta fila de la tabla `admins`, que es la que consultan las
 * políticas RLS de PostgreSQL.
 */
export async function isAdminSession(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return false;

  const { data } = await supabase
    .from('admins')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  return !!data;
}

interface PasswordGateProps {
  onSuccess: (role: AccessRole) => void;
  onCaptainAccess?: () => void;
}

export function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [mode, setMode] = useState<'choose' | 'admin'>('choose');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);

  const enterAsUser = () => {
    grantAccess('user');
    onSuccess('user');
  };

  const fail = () => {
    setError(true);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  /**
   * La contraseña de administrador es la de la cuenta de Supabase indicada en
   * VITE_ADMIN_EMAIL. Así el acceso de administración lo verifica PostgreSQL
   * (políticas RLS sobre la tabla `admins`) y no solo el navegador.
   */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking) return;

    if (!adminEmail) {
      console.error(
        '[PasswordGate] Falta la variable de entorno VITE_ADMIN_EMAIL.',
      );
      fail();
      return;
    }

    setChecking(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password,
    });

    if (signInError) {
      setChecking(false);
      fail();
      return;
    }

    if (!(await isAdminSession())) {
      await supabase.auth.signOut();
      setChecking(false);
      fail();
      return;
    }

    setChecking(false);
    grantAccess('admin');
    onSuccess('admin');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-100 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/5 blur-3xl" />
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>

      <div className={`relative w-full max-w-md ${shake ? 'animate-shake' : ''}`}>
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="relative flex h-16 w-24 items-center justify-center overflow-hidden rounded-xl ring-1 ring-accent-500/40">
            <img src="/image.png" alt="Casemuro Cup" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-[0.12em] text-white">CASEMURO CUP</h1>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-accent-400">Selecciona tu acceso</p>
          </div>
        </div>

        {mode === 'choose' ? (
          <div className="rounded-2xl border border-slate-800 bg-ink-200/80 p-6 backdrop-blur-xl">
            <p className="mb-5 text-center text-sm leading-relaxed text-slate-400">
              Elige cómo quieres entrar al torneo.
            </p>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={enterAsUser}
                className="group flex items-center gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent-500/50 hover:bg-slate-800"
              >
                <UserRound className="h-6 w-6 shrink-0 text-slate-300 transition group-hover:text-accent-400" />
                <div>
                  <span className="block font-display text-lg font-bold uppercase tracking-wide text-slate-100">Entrar como usuario</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">Consulta el cuadro y las normas.</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('admin')}
                className="group flex items-center gap-4 rounded-xl border border-accent-500/30 bg-accent-500/10 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent-500/60 hover:bg-accent-500/15"
              >
                <KeyRound className="h-6 w-6 shrink-0 text-accent-400" />
                <div>
                  <span className="block font-display text-lg font-bold uppercase tracking-wide text-slate-100">Administración</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">Gestiona equipos y resultados.</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-accent-500/25 bg-ink-200/80 p-6 backdrop-blur-xl">
            <button type="button" onClick={() => setMode('choose')} className="mb-5 text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:text-accent-400">
              Volver a elegir acceso
            </button>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
              <Lock className="h-4 w-4 text-accent-400" /> Contraseña de administrador
            </label>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(event) => {
                setPassword(event.target.value);
                setError(false);
              }}
              placeholder="Introduce la contraseña"
              className={`w-full rounded-lg border bg-slate-900/60 px-4 py-3 text-slate-100 placeholder-slate-600 outline-none transition focus:ring-2 ${error ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700 focus:border-accent-500/50 focus:ring-accent-500/30'}`}
            />
            {error && <p className="mt-2 text-sm text-red-400">Contraseña incorrecta</p>}
            <button type="submit" disabled={checking} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent-500 to-accent-400 px-5 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 transition hover:from-accent-400 hover:to-accent-300">
              <ShieldCheck className="h-4 w-4" /> Entrar como administrador
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

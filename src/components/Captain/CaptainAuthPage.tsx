import { useState, type FormEvent } from 'react';
import { ArrowLeft, Lock, Mail, UserRound, UserPlus, LogIn, ShieldCheck } from 'lucide-react';
import { useCaptainAuth } from '@/context/CaptainAuthContext';
import { showToast } from '@/components/UI/Toast';

interface CaptainAuthPageProps {
  onBack: () => void;
}

export function CaptainAuthPage({ onBack }: CaptainAuthPageProps) {
  const { signIn, signUp } = useCaptainAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === 'register') {
      if (!name.trim()) {
        setError('Introduce tu nombre.');
        setSubmitting(false);
        return;
      }
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        setSubmitting(false);
        return;
      }

      const { error: signUpError } = await signUp(name, email, password);
      setSubmitting(false);
      if (signUpError) {
        setError(signUpError);
        return;
      }
      setRegistered(true);
      showToast('Solicitud de capitán enviada', 'success');
    } else {
      const { error: signInError } = await signIn(email, password);
      setSubmitting(false);
      if (signInError) {
        setError(signInError);
      }
    }
  };

  if (registered) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-100 px-4">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative w-full max-w-md rounded-2xl border border-emerald-500/25 bg-ink-200/80 p-8 text-center backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">Solicitud enviada</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Tu solicitud de capitán ha sido registrada. La organización debe aprobarla antes de que puedas acceder a tu panel. Recibirás acceso una vez sea aprobada.
          </p>
          <button
            onClick={onBack}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-bold uppercase tracking-wide text-slate-300 transition hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-100 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/5 blur-3xl" />
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="relative flex h-16 w-24 items-center justify-center overflow-hidden rounded-xl ring-1 ring-accent-500/40">
            <img src="/image.png" alt="Casemuro Cup" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-[0.12em] text-white">CASEMURO CUP</h1>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-sky-400">Acceso de Capitán</p>
          </div>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
              mode === 'login' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <LogIn className="h-4 w-4" /> Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition ${
              mode === 'register' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <UserPlus className="h-4 w-4" /> Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-ink-200/80 p-6 backdrop-blur-xl">
          {mode === 'register' && (
            <div className="mb-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
                <UserRound className="h-4 w-4 text-sky-400" /> Nombre del capitán (Usuario de Discord)
              </label>
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu usuario de discord"
                className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 placeholder-slate-600 outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
              <Mail className="h-4 w-4 text-sky-400" /> Email
            </label>
            <input
              type="email"
              value={email}
              autoFocus={mode === 'login'}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 placeholder-slate-600 outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/30"
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300">
              <Lock className="h-4 w-4 text-sky-400" /> Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 placeholder-slate-600 outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/30"
            />
          </div>

          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-sky-500 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:from-sky-500 hover:to-sky-400 disabled:opacity-50"
          >
            {mode === 'login' ? (
              <><LogIn className="h-4 w-4" /> {submitting ? 'Entrando...' : 'Entrar'}</>
            ) : (
              <><UserPlus className="h-4 w-4" /> {submitting ? 'Enviando...' : 'Enviar solicitud'}</>
            )}
          </button>

          {mode === 'register' && (
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
              Al registrarte, tu solicitud queda como <span className="font-bold text-amber-400">pendiente</span>. La organización debe aprobarla antes de que puedas acceder.
            </p>
          )}
        </form>

        <button
          onClick={onBack}
          className="mt-4 flex w-full items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:text-sky-400"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a elegir acceso
        </button>
      </div>
    </div>
  );
}

import { Ban, Clock3, Crown, Gamepad2, Globe2, Goal, Handshake, RefreshCw, ShieldAlert, Users, Waypoints } from 'lucide-react';

const RULES = [
  { icon: Users, title: 'Mínimo 6 jugadores', detail: 'No hay defaults. Se juegan todos los partidos salvo que haya menos de 6 jugadores en plantilla.' },
  { icon: Globe2, title: 'Equipos con gente que juegue en España', detail: 'Por tema de ping y los fallos de EA.' },
  { icon: Gamepad2, title: 'Ser jugador de Next Gen', detail: '' },
  { icon: Ban, title: 'Sin restricciones', detail: '' },
  { icon: Goal, title: 'CLQ obligatorio', detail: 'En caso de no llevar CLQ se da el partido por perdido.' },
  { icon: Clock3, title: 'Empate a los 90 minutos', detail: 'Siempre habrá prórroga y penaltis.' },
  { icon: ShieldAlert, title: 'No se permite molestar al portero en las faltas', detail: 'En caso de estar un jugador dentro del área pequeña al lanzar la falta (+1 gol rival).' },
  { icon: Waypoints, title: 'No se permiten cambios en vivo', detail: 'En caso de hacerlo, partido por perdido.' },
  { icon: RefreshCw, title: 'Reinicios por equipo: 1 reinicio/equipo', detail: 'Antes del minuto 10 hay descanso. En caso de salir en otro momento del partido: +1 gol rival.' },
  { icon: Handshake, title: 'Tiempo de cortesía', detail: 'Si pasan 15 minutos y el rival no da señal para invitar, se da por perdido el partido.' },
  { icon: Crown, title: 'Capitanes', detail: 'Todos los partidos deben reportar el resultado en Discord.' },
];

export function RulesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-accent-500/25 bg-gradient-to-br from-ink-100 via-ink-200 to-ink-300 px-6 py-10 text-center sm:px-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-25" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative">
          <img src="/image.png" alt="Casemuro Cup" className="mx-auto mb-5 w-full max-w-[420px] object-contain drop-shadow-[0_0_28px_rgba(244,185,66,0.25)]" />
          <div className="mx-auto inline-flex -skew-x-6 items-center border-y-2 border-accent-400 bg-accent-500 px-8 py-2 shadow-[0_0_28px_rgba(244,185,66,0.18)]">
            <h1 className="skew-x-6 font-display text-4xl font-extrabold uppercase tracking-[0.18em] text-slate-950 sm:text-5xl">Normas</h1>
          </div>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-slate-400">Consulta las reglas oficiales de la competición antes de disputar tu partido.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-accent-500/20 bg-black/25 p-4 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map(({ icon: Icon, title, detail }, index) => (
            <article key={title} className="group flex gap-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4 transition hover:-translate-y-0.5 hover:border-accent-500/40 hover:bg-slate-900/70">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent-500/60 bg-accent-500/10 text-accent-400 transition group-hover:bg-accent-500/20">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-500/70">{String(index + 1).padStart(2, '0')}</span>
                <h2 className="font-display text-lg font-bold uppercase leading-tight tracking-wide text-slate-100">{title}</h2>
                {detail && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{detail}</p>}
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-800 pt-5 text-center text-xs font-bold uppercase tracking-widest text-accent-400">
          <Crown className="h-4 w-4" /> Respeta las normas y disfruta de la competición
        </div>
      </section>
    </div>
  );
}

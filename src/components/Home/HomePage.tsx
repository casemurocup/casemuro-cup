import { Trophy, Settings, LayoutGrid, ArrowRight, Users, Activity, Zap, ScrollText, UserCog } from 'lucide-react';
import { useTournamentContext } from '@/context/TournamentContext';
import { StatCard } from '@/components/UI/StatCard';
import { BroadcastButton } from '@/components/UI/BroadcastButton';
import { ParticleField } from '@/components/UI/ParticleField';
import type { View } from '@/types/tournament';

interface HomePageProps {
  onNavigate: (view: View) => void;
  isAdmin: boolean;
}

export function HomePage({ onNavigate, isAdmin }: HomePageProps) {
  const { tournament, teams, matches, loading } = useTournamentContext();

  if (loading || !tournament) {
    return <div className="flex h-full items-center justify-center py-20 text-slate-500">Cargando...</div>;
  }

  const pending = matches.filter((m) => m.team1_id && m.team2_id && !m.winner_id).length;
  const played = matches.filter((m) => m.winner_id).length;
  const champion = tournament.champion_team_id ? teams.find((t) => t.id === tournament.champion_team_id) : null;

  const navCards: { view: View; title: string; desc: string; icon: typeof Settings; accent: string; glow: string }[] = [
    ...(isAdmin
      ? [{ view: 'admin' as View, title: 'Administración', desc: 'Gestiona los equipos participantes', icon: Settings, accent: 'from-accent-500/15 to-accent-500/5 border-accent-500/25', glow: 'group-hover:shadow-accent-500/10' }]
      : []),
    { view: 'competitions', title: 'Competiciones', desc: 'Consulta el cuadro, la clasificación y los resultados', icon: LayoutGrid, accent: 'from-cream-500/10 to-cream-500/5 border-cream-500/20', glow: 'group-hover:shadow-cream-500/10' },
    { view: 'rules', title: 'Normas', desc: 'Revisa las reglas oficiales del torneo', icon: ScrollText, accent: 'from-amber-500/10 to-amber-500/5 border-amber-500/20', glow: 'group-hover:shadow-amber-500/10' },
    { view: 'captain', title: 'Capitán', desc: 'Accede al panel de capitán para gestionar partidos', icon: UserCog, accent: 'from-sky-500/10 to-sky-500/5 border-sky-500/20', glow: 'group-hover:shadow-sky-500/10' },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-accent-500/15 bg-gradient-to-br from-ink-100 via-ink-200 to-ink-300 p-8 sm:p-14">
        <ParticleField count={35} />
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-spotlight" />
        <div className="absolute -right-32 -top-32 h-96 w-96 animate-glow-pulse rounded-full bg-accent-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 animate-glow-pulse rounded-full bg-cream-500/5 blur-3xl" style={{ animationDelay: '1s' }} />

        <div className="relative">
          {/* Badge */}
          <div className="mb-5 inline-flex animate-slide-up items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-400" style={{ animationDelay: '0.1s' }}>
            <Zap className="h-3.5 w-3.5" /> Eliminatoria Directa
          </div>

          {/* Casemuro Cup logo */}
          <div className="mb-6 flex animate-slide-up justify-center" style={{ animationDelay: '0.3s' }}>
            <div className="relative w-full max-w-[420px]">
              <img src="/image.png" alt="Casemuro Cup" className="relative z-10 h-auto w-full object-contain drop-shadow-[0_0_28px_rgba(244,185,66,0.28)]" />
              <div className="absolute inset-1/4 rounded-full bg-accent-500/20 blur-3xl" />
            </div>
          </div>

          {/* Info */}
          <p className="mt-2 flex animate-slide-up flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-400" style={{ animationDelay: '0.5s' }}>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-accent-400" /> {tournament.team_count} equipos</span>
            <span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-accent-400" /> {statusBadge(tournament.status)}</span>
            <span className="flex items-center gap-1.5"><Trophy className="h-4 w-4 text-accent-400" /> {teams.length} registrados</span>
          </p>

          {champion && (
            <div className="mt-6 flex animate-scale-in justify-center" style={{ animationDelay: '0.9s' }}>
              <div className="inline-flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 glow-gold">
                <Trophy className="h-6 w-6 text-amber-400" />
                <span className="font-display text-xl font-bold text-gold-gradient">Campeón: {champion.name}</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="mt-8 flex animate-slide-up flex-wrap justify-center gap-3" style={{ animationDelay: '1s' }}>
            {isAdmin && (
              <BroadcastButton variant="secondary" size="lg" icon={<Settings className="h-5 w-5" />} onClick={() => onNavigate('admin')}>
                Administración
              </BroadcastButton>
            )}
            <BroadcastButton variant="primary" size="lg" icon={<LayoutGrid className="h-5 w-5" />} onClick={() => onNavigate('competitions')}>
              Ver Cuadro
            </BroadcastButton>
            <BroadcastButton variant="secondary" size="lg" icon={<ScrollText className="h-5 w-5" />} onClick={() => onNavigate('rules')}>
              Ver Normas
            </BroadcastButton>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Equipos" value={teams.length} accent="accent" />
        <StatCard label="Partidos" value={matches.length} accent="sky" />
        <StatCard label="Jugados" value={played} accent="slate" />
        <StatCard label="Pendientes" value={pending} accent="amber" />
      </div>

      {/* Nav cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {navCards.map(({ view, title, desc, icon: Icon, accent, glow }, idx) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`group relative animate-slide-up overflow-hidden rounded-2xl border bg-gradient-to-br p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${accent} ${glow}`}
            style={{ animationDelay: `${1.2 + idx * 0.15}s` }}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-200/50 ring-1 ring-cream-500/15 transition-transform duration-300 group-hover:scale-110">
              <Icon className="h-6 w-6 text-slate-100" />
            </div>
            <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">{title}</h3>
            <p className="mt-1 text-sm text-slate-400">{desc}</p>
            <div className="mt-4 flex items-center gap-1 text-sm font-bold uppercase tracking-wide text-slate-300 transition-all duration-300 group-hover:gap-3 group-hover:text-accent-400">
              Acceder <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}

function statusBadge(status: string): string {
  switch (status) {
    case 'setup': return 'En configuración';
    case 'draw_in_progress': return 'Configurando';
    case 'bracket': return 'En competición';
    case 'completed': return 'Finalizado';
    default: return status;
  }
}

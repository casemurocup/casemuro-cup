import { Trophy, Sparkles, Crown } from 'lucide-react';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { useTournamentContext } from '@/context/TournamentContext';
import { ParticleField } from '@/components/UI/ParticleField';
import { useEffect, useState } from 'react';

export function ChampionScreen() {
  const { tournament, teams } = useTournamentContext();
  const champion = tournament?.champion_team_id ? teams.find((t) => t.id === tournament.champion_team_id) : null;
  const [pieces, setPieces] = useState<{ left: number; delay: number; color: string; size: number }[]>([]);

  useEffect(() => {
    const colors = ['#f4b942', '#ffd166', '#fef3c7', '#d99a24', '#ffffff', '#b7791f', '#fffbea'];
    const arr = Array.from({ length: 80 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 3,
      color: colors[i % colors.length],
      size: 4 + Math.random() * 6,
    }));
    setPieces(arr);
  }, []);

  if (!champion) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 p-8 text-center sm:p-14">
      <ParticleField count={40} />
      <div className="absolute inset-0 bg-spotlight" style={{ '--accent-rgb': '245, 158, 11' } as React.CSSProperties} />

      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="absolute top-[-10px] rounded-sm"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size * 1.5}px`,
              backgroundColor: p.color,
              animation: `confetti-fall ${2.5 + p.delay}s ease-in ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>

      {/* Content */}
      <div className="relative">
        {/* Crown + Trophy */}
        <div className="mb-6 flex justify-center">
          <div className="relative animate-zoom-in">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-500/15 ring-2 ring-amber-500/40 glow-gold">
              <Trophy className="h-12 w-12 text-amber-400" />
            </div>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <Crown className="h-8 w-8 text-amber-400 animate-float-slow" />
            </div>
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/30 animate-pulse-ring" />
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 animate-pulse-ring" style={{ animationDelay: '0.5s' }} />
          </div>
        </div>

        {/* Badge */}
        <div className="mb-4 inline-flex animate-slide-up items-center gap-2 rounded-full bg-amber-500/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400" style={{ animationDelay: '0.3s' }}>
          <Sparkles className="h-3.5 w-3.5" /> Campeón del Torneo
        </div>

        {/* Champion name */}
        <h2 className="animate-slide-up font-display text-5xl font-extrabold uppercase tracking-wide text-gold-gradient sm:text-7xl" style={{ animationDelay: '0.5s' }}>
          {champion.name}
        </h2>

        <p className="mt-3 animate-slide-up text-xl font-medium text-amber-300" style={{ animationDelay: '0.7s' }}>¡Enhorabuena!</p>

        {/* Giant logo */}
        <div className="mt-8 flex animate-zoom-in justify-center" style={{ animationDelay: '0.9s' }}>
          <div className="relative">
            <TeamLogo logoUrl={champion.logo_url} name={champion.name} size="3xl" glow />
            <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-2xl animate-glow-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

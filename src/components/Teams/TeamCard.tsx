import { Pencil, Trash2 } from 'lucide-react';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { formatTeamNumber } from '@/lib/bracket';
import type { Team } from '@/types/tournament';

interface TeamCardProps {
  team: Team;
  teamCount: number;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
  disabled?: boolean;
}

export function TeamCard({ team, teamCount, onEdit, onDelete, disabled }: TeamCardProps) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-cream-500/10 bg-ink-100/60 p-3 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-500/30 hover:bg-ink-100 hover:shadow-lg hover:shadow-accent-500/5">
      <div className="transition-transform duration-300 group-hover:scale-105">
        <TeamLogo logoUrl={team.logo_url} name={team.name} size="md" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100">{team.name}</p>
        <p className="font-display text-xs font-medium uppercase tracking-wider text-slate-500">ID: {formatTeamNumber(team.team_number, teamCount)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => onEdit(team)}
          className="rounded-lg p-2 text-slate-400 transition-all duration-200 hover:bg-slate-800 hover:text-accent-400"
          aria-label="Editar equipo"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(team)}
          disabled={disabled}
          className="rounded-lg p-2 text-slate-400 transition-all duration-200 hover:bg-slate-800 hover:text-red-400 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
          aria-label="Eliminar equipo"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

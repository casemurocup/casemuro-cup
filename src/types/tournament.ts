export type TeamCount = 32 | 64;

export type TournamentStatus =
  | 'setup'
  | 'draw_in_progress'
  | 'bracket'
  | 'completed';

export interface Tournament {
  id: string;
  name: string;
  team_count: TeamCount;
  status: TournamentStatus;
  draw_pool: string[];
  current_draw_match: number;
  champion_team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  tournament_id: string;
  team_number: number;
  name: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type MatchState =
  | 'pending'
  | 'in_progress'
  | 'pending_review'
  | 'finished'
  | 'classified';

export interface Match {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_id: string | null;
  team1_reported_winner: string | null;
  team2_reported_winner: string | null;
  report_status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  scheduled_date: string | null;
  scheduled_time: string | null;
  match_state: MatchState;
  created_at: string;
  updated_at: string;
}

export type CaptainStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export type CaptainRole =
  | 'primary'
  | 'secondary';

export interface Captain {
  id: string;
  name: string;
  email: string;
  team_id: string | null;
  status: CaptainStatus;
  captain_role: CaptainRole;
  created_at: string;
  updated_at: string;
}

export interface MatchMessage {
  id: string;
  match_id: string;
  captain_id: string;
  captain_name: string;
  team_id: string | null;
  content: string;
  created_at: string;
}

export type MatchResultStatus =
  | 'pending_review'
  | 'confirmed'
  | 'rejected';

export interface Scorer {
  player: string;
  minute: number | null;
}

export interface MatchResult {
  id: string;
  match_id: string;
  reported_by: string | null;
  winner_team_id: string | null;
  team1_score: number;
  team2_score: number;
  had_extra_time: boolean;
  had_penalties: boolean;
  penalty_team1: number | null;
  penalty_team2: number | null;
  scorers: Scorer[];
  notes: string | null;
  evidence_url: string | null;
  status: MatchResultStatus;
  created_at: string;
  updated_at: string;
}

export type IncidentCategory =
  | 'rival'
  | 'horario'
  | 'tecnico'
  | 'resultado'
  | 'otro';

export type IncidentStatus =
  | 'open'
  | 'reviewing'
  | 'resolved'
  | 'dismissed';

export interface Incident {
  id: string;
  captain_id: string;
  team_id: string | null;
  match_id: string | null;
  category: IncidentCategory;
  subject: string;
  description: string;
  evidence_url: string | null;
  score_own: number | null;
  score_rival: number | null;
  status: IncidentStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  captain_id: string | null;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export type MatchStatus =
  | 'pending'
  | 'ready'
  | 'completed';

export type View =
  | 'home'
  | 'admin'
  | 'draw'
  | 'bracket'
  | 'rules'
  | 'incidents'
  | 'captain'
  | 'match'
  | 'register-captain';
import { useState, type FormEvent } from 'react';
import { Plus, X, ClipboardList, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/UI/Toast';
import { TeamLogo } from '@/components/UI/TeamLogo';
import type { Match, Team, MatchResult, Scorer } from '@/types/tournament';

interface ResultFormProps {
  match: Match;
  myTeam: Team;
  rivalTeam: Team | null;
  captainId: string;
  existingResult: MatchResult | null;
  onSubmitted: () => void;
}

export function ResultForm({ match, myTeam, rivalTeam, captainId, existingResult, onSubmitted }: ResultFormProps) {
  const [team1Score, setTeam1Score] = useState(existingResult?.team1_score ?? 0);
  const [team2Score, setTeam2Score] = useState(existingResult?.team2_score ?? 0);
  const [hadExtraTime, setHadExtraTime] = useState(existingResult?.had_extra_time ?? false);
  const [hadPenalties, setHadPenalties] = useState(existingResult?.had_penalties ?? false);
  const [penaltyTeam1, setPenaltyTeam1] = useState(existingResult?.penalty_team1 ?? 0);
  const [penaltyTeam2, setPenaltyTeam2] = useState(existingResult?.penalty_team2 ?? 0);
  const [scorers, setScorers] = useState<Scorer[]>(existingResult?.scorers ?? []);
  const [notes, setNotes] = useState(existingResult?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const winnerId = team1Score > team2Score ? match.team1_id : team2Score > team1Score ? match.team2_id : null;

  const addScorer = () => setScorers((prev) => [...prev, { player: '', minute: null }]);
  const updateScorer = (idx: number, field: keyof Scorer, value: string | number | null) => {
    setScorers((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };
  const removeScorer = (idx: number) => setScorers((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rivalTeam) return;
    setSubmitting(true);

    const payload = {
      match_id: match.id,
      reported_by: captainId,
      winner_team_id: winnerId,
      team1_score: team1Score,
      team2_score: team2Score,
      had_extra_time: hadExtraTime,
      had_penalties: hadPenalties,
      penalty_team1: hadPenalties ? penaltyTeam1 : null,
      penalty_team2: hadPenalties ? penaltyTeam2 : null,
      scorers: scorers.filter((s) => s.player.trim()),
      notes: notes.trim() || null,
      status: 'pending_review',
    };

    if (existingResult) {
      const { error } = await supabase.from('match_results').update(payload).eq('id', existingResult.id);
      if (error) {
        showToast('Error al actualizar resultado', 'error');
      } else {
        showToast('Resultado actualizado', 'success');
        onSubmitted();
      }
    } else {
      const { error } = await supabase.from('match_results').insert(payload);
      if (error) {
        showToast('Error al registrar resultado', 'error');
      } else {
        showToast('Resultado registrado', 'success');
        onSubmitted();
      }
    }
    setSubmitting(false);
  };

  const alreadySubmitted = existingResult && existingResult.status !== 'rejected';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-sky-400" />
        <h3 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">Registrar resultado</h3>
      </div>

      {alreadySubmitted && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <CheckCircle2 className="h-4 w-4" />
          Ya has enviado un resultado. Está pendiente de revisión por la organización.
        </div>
      )}

      {/* Score input */}
      <div className="flex items-center justify-center gap-6 py-4">
        <div className="flex flex-col items-center gap-2">
          <TeamLogo logoUrl={myTeam.logo_url} name={myTeam.name} size="lg" />
          <span className="text-xs font-bold uppercase tracking-wide text-slate-300">{myTeam.name}</span>
          <input
            type="number"
            min={0}
            value={team1Score}
            onChange={(e) => setTeam1Score(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-16 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center text-2xl font-bold text-slate-100 outline-none focus:border-sky-500/50"
          />
        </div>
        <span className="font-display text-xl font-bold text-slate-500">-</span>
        <div className="flex flex-col items-center gap-2">
          {rivalTeam ? (
            <>
              <TeamLogo logoUrl={rivalTeam.logo_url} name={rivalTeam.name} size="lg" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-300">{rivalTeam.name}</span>
              <input
                type="number"
                min={0}
                value={team2Score}
                onChange={(e) => setTeam2Score(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center text-2xl font-bold text-slate-100 outline-none focus:border-sky-500/50"
              />
            </>
          ) : (
            <span className="text-sm text-slate-500">Sin rival</span>
          )}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={hadExtraTime} onChange={(e) => setHadExtraTime(e.target.checked)} className="accent-sky-500" />
          Prórroga
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={hadPenalties} onChange={(e) => setHadPenalties(e.target.checked)} className="accent-sky-500" />
          Penaltis
        </label>
      </div>

      {hadPenalties && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{myTeam.name} (penaltis)</label>
            <input
              type="number"
              min={0}
              value={penaltyTeam1}
              onChange={(e) => setPenaltyTeam1(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center text-lg font-bold text-slate-100 outline-none focus:border-sky-500/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{rivalTeam?.name ?? 'Rival'} (penaltis)</label>
            <input
              type="number"
              min={0}
              value={penaltyTeam2}
              onChange={(e) => setPenaltyTeam2(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center text-lg font-bold text-slate-100 outline-none focus:border-sky-500/50"
            />
          </div>
        </div>
      )}

      {/* Scorers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-400">Goleadores</span>
          <button type="button" onClick={addScorer} className="flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </button>
        </div>
        <div className="space-y-2">
          {scorers.map((s, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                value={s.player}
                onChange={(e) => updateScorer(idx, 'player', e.target.value)}
                placeholder="Nombre del jugador"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500/50"
              />
              <input
                type="number"
                min={1}
                max={120}
                value={s.minute ?? ''}
                onChange={(e) => updateScorer(idx, 'minute', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Min"
                className="w-20 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-center text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500/50"
              />
              <button type="button" onClick={() => removeScorer(idx)} className="flex items-center justify-center rounded-lg border border-slate-700 px-2 text-slate-500 hover:text-red-400">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {scorers.length === 0 && <p className="text-xs text-slate-600">Sin goleadores registrados.</p>}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Observaciones sobre el partido..."
          className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500/50"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !rivalTeam}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-sky-500 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:from-sky-500 hover:to-sky-400 disabled:opacity-40"
      >
        {submitting ? 'Enviando...' : existingResult ? 'Actualizar resultado' : 'Enviar resultado'}
      </button>
    </form>
  );
}

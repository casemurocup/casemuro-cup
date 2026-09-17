import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import {
  AlertTriangle,
  ExternalLink,
  Link2,
  Send,
  ShieldAlert,
  UserCog,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useCaptainAuth } from '@/context/CaptainAuthContext';
import { useTournamentContext } from '@/context/TournamentContext';
import { showToast } from '@/components/UI/Toast';
import { BroadcastButton } from '@/components/UI/BroadcastButton';

import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABEL,
  INCIDENT_STATUS_LABEL,
  isSafeUrl,
} from '@/lib/incidents';

import type {
  Incident,
  IncidentCategory,
  View,
} from '@/types/tournament';

/**
 * Aviso para quien entra sin ser capitán aprobado.
 *
 * Mantiene el mismo formato que los avisos del sorteo y del modo
 * presentación, para que la pestaña no desentone.
 */
function NotACaptainNotice({
  title,
  message,
  onNavigate,
}: {
  title: string;
  message: string;
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-accent-400" />

      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
        {title}
      </h1>

      <p className="mt-2 max-w-md text-sm text-slate-400">
        {message}
      </p>

      <button
        onClick={() => onNavigate('captain')}
        className="mt-6 flex items-center gap-2 rounded-xl border border-accent-500/30 bg-accent-500/10 px-6 py-3 text-sm font-bold uppercase tracking-wide text-accent-400 transition hover:bg-accent-500/20"
      >
        <UserCog className="h-4 w-4" /> Ir a Capitán
      </button>
    </div>
  );
}

export function IncidentsPage({
  onNavigate,
}: {
  onNavigate: (view: View) => void;
}) {
  const { captain, loading: authLoading } = useCaptainAuth();
  const { teams, matches } = useTournamentContext();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [category, setCategory] = useState<IncidentCategory>('rival');
  const [matchId, setMatchId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [scoreOwn, setScoreOwn] = useState(0);
  const [scoreRival, setScoreRival] = useState(0);

  /**
   * En modo resultado el formulario cambia: hay que elegir partido, poner el
   * marcador y adjuntar prueba obligatoriamente.
   */
  const isResult = category === 'resultado';

  const isApproved =
    !!captain && captain.status === 'approved';

  const myTeam =
    teams.find((t) => t.id === captain?.team_id) ?? null;

  /**
   * Partidos del equipo, para poder señalar a cuál se refiere la incidencia.
   */
  const myMatches = myTeam
    ? matches.filter(
        (m) =>
          m.team1_id === myTeam.id || m.team2_id === myTeam.id,
      )
    : [];

  const load = useCallback(async () => {
    if (!isApproved) {
      setIncidents([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      showToast('No se pudieron cargar las incidencias', 'error');
      setLoading(false);
      return;
    }

    setIncidents((data ?? []) as Incident[]);
    setLoading(false);
  }, [isApproved]);

  useEffect(() => {
    load();

    if (!isApproved) return;

    const channel = supabase
      .channel('incidents-captain')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isApproved, load]);

  const rivalTeamFor = (id: string) => {
    const match = matches.find((m) => m.id === id);
    if (!match) return null;

    const rivalId =
      match.team1_id === myTeam?.id ? match.team2_id : match.team1_id;

    return teams.find((t) => t.id === rivalId) ?? null;
  };

  const matchLabel = (id: string) => {
    const match = matches.find((m) => m.id === id);
    if (!match) return 'Partido';

    const rivalId =
      match.team1_id === myTeam?.id
        ? match.team2_id
        : match.team1_id;

    const rival =
      teams.find((t) => t.id === rivalId)?.name ?? 'Por decidir';

    return `Ronda ${match.round_number} · vs ${rival}`;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!captain || submitting) return;

    const cleanDescription = description.trim();
    const cleanUrl = evidenceUrl.trim();

    const rival = matchId ? rivalTeamFor(matchId) : null;

    /*
     * En un reporte de resultado el título se genera solo con el marcador:
     * pedirle además un titular al capitán sería ruido.
     */
    const cleanSubject = isResult
      ? `Resultado: ${myTeam?.name ?? 'Mi equipo'} ${scoreOwn} - ${scoreRival} ${rival?.name ?? 'Rival'}`
      : subject.trim();

    if (isResult && !matchId) {
      showToast('Elige de qué partido es el resultado', 'error');
      return;
    }

    if (!isResult && !cleanSubject) {
      showToast('Ponle un título a la incidencia', 'error');
      return;
    }

    if (!isResult && !cleanDescription) {
      showToast('Explica qué ha pasado', 'error');
      return;
    }

    if (isResult && !cleanUrl) {
      showToast('Para reportar un resultado tienes que adjuntar una prueba', 'error');
      return;
    }

    if (cleanUrl && !isSafeUrl(cleanUrl)) {
      showToast('El enlace debe empezar por http:// o https://', 'error');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('incidents').insert({
      captain_id: captain.id,
      team_id: captain.team_id,
      match_id: matchId || null,
      category,
      subject: cleanSubject,
      description: cleanDescription,
      evidence_url: cleanUrl || null,
      score_own: isResult ? scoreOwn : null,
      score_rival: isResult ? scoreRival : null,
    });

    setSubmitting(false);

    if (error) {
      showToast('No se pudo enviar la incidencia', 'error');
      return;
    }

    showToast(
      isResult
        ? 'Resultado enviado a la organización'
        : 'Incidencia enviada a la organización',
    );
    setSubject('');
    setDescription('');
    setEvidenceUrl('');
    setMatchId('');
    setScoreOwn(0);
    setScoreRival(0);
    setCategory('rival');
    load();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    );
  }

  if (!captain) {
    return (
      <NotACaptainNotice
        onNavigate={onNavigate}
        title="Incidencias"
        message="Las incidencias las abren los capitanes. Inicia sesión como capitán para poder reportar un problema a la organización."
      />
    );
  }

  if (!isApproved) {
    return (
      <NotACaptainNotice
        onNavigate={onNavigate}
        title="Incidencias"
        message="Tu cuenta de capitán todavía no está aprobada por la organización. En cuanto lo esté, podrás abrir incidencias desde aquí."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* CABECERA */}
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
          Incidencias
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Reporta un problema a la organización. Solo lo veis tú y la
          administración.
        </p>
      </div>

      {/* FORMULARIO */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-accent-400" />

          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
            {isResult ? 'Reportar resultado' : 'Nueva incidencia'}
          </h2>
        </div>

        {/* CATEGORIA */}
        <div className="flex flex-wrap gap-2">
          {INCIDENT_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                category === c.value
                  ? 'border-accent-500/50 bg-accent-500/15 text-accent-400'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* PARTIDO */}
        {myMatches.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              {isResult
                ? 'Partido jugado'
                : 'Partido relacionado (opcional)'}
            </label>

            <select
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/30"
            >
              <option value="">
                {isResult ? 'Elige el partido' : 'Ninguno en concreto'}
              </option>

              {myMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m.id)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* MARCADOR (solo en modo resultado) */}
        {isResult && (
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Marcador final
            </label>

            <div className="flex items-center justify-center gap-5 rounded-lg border border-slate-800 bg-slate-950/40 py-5">
              <div className="flex flex-col items-center gap-2">
                <span className="max-w-[9rem] truncate text-xs font-bold uppercase tracking-wide text-slate-300">
                  {myTeam?.name ?? 'Tu equipo'}
                </span>

                <input
                  type="number"
                  min={0}
                  value={scoreOwn}
                  onChange={(e) =>
                    setScoreOwn(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-center text-2xl font-bold text-slate-100 outline-none transition focus:border-accent-500/50"
                />
              </div>

              <span className="font-display text-xl font-bold text-slate-500">
                -
              </span>

              <div className="flex flex-col items-center gap-2">
                <span className="max-w-[9rem] truncate text-xs font-bold uppercase tracking-wide text-slate-300">
                  {matchId
                    ? (rivalTeamFor(matchId)?.name ?? 'Rival')
                    : 'Rival'}
                </span>

                <input
                  type="number"
                  min={0}
                  value={scoreRival}
                  onChange={(e) =>
                    setScoreRival(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-center text-2xl font-bold text-slate-100 outline-none transition focus:border-accent-500/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* ASUNTO (el resultado genera el suyo con el marcador) */}
        {!isResult && (
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Título
            </label>

            <input
              type="text"
              value={subject}
              maxLength={120}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Resume el problema en una línea"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
        )}

        {/* DESCRIPCION */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
            {isResult ? 'Comentarios (opcional)' : 'Qué ha pasado'}
          </label>

          <textarea
            value={description}
            rows={isResult ? 2 : 4}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              isResult
                ? 'Prórroga, penaltis, goleadores, cualquier detalle que quieras añadir.'
                : 'Explícalo con el mayor detalle posible: cuándo, con quién y qué ocurrió.'
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/30"
          />
        </div>

        {/* ENLACE */}
        <div>
          <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Link2 className="h-4 w-4 text-accent-400" /> Enlace de prueba{' '}
            {isResult ? (
              <span className="text-red-400">(obligatorio)</span>
            ) : (
              '(opcional)'
            )}
          </label>

          <input
            type="url"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="https://... (clip, captura, vídeo)"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/30"
          />

          <p className="mt-1.5 text-xs text-slate-500">
            Sube la captura o el clip donde quieras (Imgur, Streamable, Drive...)
            y pega aquí el enlace. No se sube nada a la web.
          </p>
        </div>

        <BroadcastButton
          type="submit"
          disabled={submitting}
          icon={<Send className="h-4 w-4" />}
        >
          {submitting
            ? 'Enviando...'
            : isResult
              ? 'Enviar resultado'
              : 'Enviar incidencia'}
        </BroadcastButton>
      </form>

      {/* HISTORIAL */}
      <div className="space-y-3">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
          Tus incidencias
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500">Cargando incidencias...</p>
        ) : incidents.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 py-12 text-center text-sm text-slate-500">
            Todavía no has abierto ninguna incidencia.
          </div>
        ) : (
          incidents.map((incident) => {
            const badge = INCIDENT_STATUS_LABEL[incident.status];

            return (
              <div
                key={incident.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-bold uppercase tracking-wide text-slate-100">
                      {incident.subject}
                    </h3>

                    <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">
                      {INCIDENT_CATEGORY_LABEL[incident.category]}
                      {incident.match_id &&
                        ` · ${matchLabel(incident.match_id)}`}
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {incident.category === 'resultado' &&
                  incident.score_own != null && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-2.5">
                      <span className="text-xs uppercase tracking-wider text-slate-500">
                        Marcador
                      </span>

                      <span className="font-display text-lg font-bold text-slate-100">
                        {incident.score_own}{' '}
                        <span className="text-slate-600">-</span>{' '}
                        {incident.score_rival}
                      </span>
                    </div>
                  )}

                {incident.description && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                    {incident.description}
                  </p>
                )}

                {incident.evidence_url && (
                  <a
                    href={incident.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 transition hover:border-accent-500/40 hover:text-accent-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver prueba
                  </a>
                )}

                {incident.resolution_notes && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Respuesta de la organización
                    </p>

                    <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-200/90">
                      {incident.resolution_notes}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-600">
                  {new Date(incident.created_at).toLocaleString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';

import { Check, ChevronDown, X, Undo2 } from 'lucide-react';

import { TeamLogo } from '@/components/UI/TeamLogo';
import { matchStatus } from '@/lib/bracket';
import { useTournamentContext } from '@/context/TournamentContext';

import type { Match, Team } from '@/types/tournament';

/* ============================================================
   PROPS
============================================================ */

interface BracketMatchProps {
  match: Match;
  isAdmin?: boolean;

  /*
   * Tamaño real de la tarjeta para esta ronda. Todo el
   * dimensionamiento interno (filas, escudos, padding) se deriva
   * de estos dos valores, nunca de constantes fijas.
   */
  width?: number;
  height?: number;
}

/* ============================================================
   COMPONENTE
============================================================ */

export function BracketMatch({ match, isAdmin = false, width = 96, height = 68 }: BracketMatchProps) {
  const { teams, matches, selectWinner, assignTeamToMatch, undoWinner } = useTournamentContext();

  const [openSlot, setOpenSlot] = useState<1 | 2 | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);

  const team1 = teams.find((team) => team.id === match.team1_id) ?? null;
  const team2 = teams.find((team) => team.id === match.team2_id) ?? null;

  const status = matchStatus(match);

  /* ==========================================================
     EQUIPOS DISPONIBLES
  ========================================================== */

  const isTeamUsedInFirstRound = (teamId: string) => {
    return matches.some(
      (otherMatch) =>
        otherMatch.id !== match.id &&
        otherMatch.round_number === 1 &&
        (otherMatch.team1_id === teamId || otherMatch.team2_id === teamId),
    );
  };

  const availableTeams = teams.filter(
    (team) =>
      !isTeamUsedInFirstRound(team.id) && team.id !== match.team1_id && team.id !== match.team2_id,
  );

  /* ==========================================================
     GANADOR
  ========================================================== */

  const handlePickWinner = async (teamId: string) => {
    if (!isAdmin || status !== 'ready') return;

    setPicking(teamId);
    try {
      await selectWinner(match.id, teamId);
    } finally {
      setPicking(null);
    }
  };

  /* ==========================================================
     ASIGNAR EQUIPO
  ========================================================== */

  const handleAssignTeam = async (slot: 1 | 2, teamId: string | null) => {
    setOpenSlot(null);
    await assignTeamToMatch(match.id, slot, teamId);
  };

  /* ==========================================================
     DESHACER
  ========================================================== */

  const handleUndo = async () => {
    setUndoing(true);
    try {
      await undoWinner(match.id);
    } finally {
      setUndoing(false);
    }
  };

  /* ==========================================================
     DIMENSIONADO INTERNO
     Todo se deriva de `width`/`height` con una única fórmula, de
     forma que dos filas + separador + padding SIEMPRE quepan
     dentro de la tarjeta, sea cual sea la ronda o la resolución.
  ========================================================== */

  const cardPadding = Math.max(3, Math.round(height * 0.05));
  const rowGap = Math.max(2, Math.round(height * 0.015));
  const dividerSpace = 1;

  const innerHeight = height - cardPadding * 2 - rowGap - dividerSpace;
  const slotHeight = Math.max(20, Math.floor(innerHeight / 2));

  // El escudo llena casi toda su fila (antes se quedaba en ~85% de
  // una fila ya de por sí pequeña, así que en 32avos era ilegible y
  // en cuartos/semifinal/final sobraba mucho hueco vacío alrededor).
  const logoSize = Math.min(130, Math.max(24, Math.round(slotHeight * 0.96)));
  const badgeSize = Math.max(10, Math.round(logoSize * 0.4));

  // Un slot "por definir" no tiene contenido real que mostrar, así que
  // no debe crecer tanto como un escudo asignado: en cuartos/semifinal/
  // final eso se vería como una mancha vacía enorme. Se queda en un
  // tamaño modesto y constante, con el mismo tope que antes.
  const placeholderSize = Math.min(logoSize, 44);

  /* ==========================================================
     SLOT
  ========================================================== */

  const renderSlot = (team: Team | null, slot: 1 | 2) => {
    const isWinner = !!team && match.winner_id === team.id;
    const isLoser = !!team && !!match.winner_id && match.winner_id !== team.id;
    const isPicking = !!team && picking === team.id;
    const isOpen = openSlot === slot;

    const canAssign = isAdmin && match.round_number === 1 && !match.winner_id && !team;
    const canRemove = isAdmin && match.round_number === 1 && !match.winner_id && !!team;

    /* ========================================================
       SLOT VACÍO
    ======================================================== */

    if (!team) {
      if (!canAssign) {
        return (
          <div className="flex w-full items-center justify-center" style={{ height: `${slotHeight}px` }}>
            <div
              className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-700 bg-slate-900/50"
              style={{ width: `${placeholderSize}px`, height: `${placeholderSize}px` }}
            />
          </div>
        );
      }

      return (
        <div className="relative w-full" style={{ height: `${slotHeight}px` }}>
          <button
            type="button"
            onClick={() => setOpenSlot(isOpen ? null : slot)}
            className={`
              flex h-full w-full items-center justify-center rounded-md transition-all
              ${isOpen ? 'bg-accent-500/10 ring-1 ring-accent-400/50' : 'hover:bg-slate-800/70'}
            `}
            aria-label="Seleccionar equipo"
          >
            <div
              className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-700"
              style={{ width: `${placeholderSize}px`, height: `${placeholderSize}px` }}
            >
              <ChevronDown
                size={Math.max(10, Math.round(placeholderSize * 0.45))}
                className={`text-slate-600 transition-transform ${isOpen ? 'rotate-180 text-accent-400' : ''}`}
              />
            </div>
          </button>

          {/* ==================================================
              DROPDOWN
          ================================================== */}

          {isOpen && (
            <div className="absolute left-1/2 top-[calc(100%+6px)] z-[1000] w-[190px] -translate-x-1/2 overflow-hidden rounded-xl border border-accent-500/25 bg-[#10131c] shadow-[0_15px_45px_rgba(0,0,0,0.65)]">
              <div className="border-b border-slate-800 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Seleccionar equipo
              </div>

              <div className="max-h-[220px] overflow-y-auto p-1">
                {availableTeams.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs text-slate-600">
                    No hay equipos disponibles
                  </div>
                ) : (
                  availableTeams.map((availableTeam) => (
                    <button
                      key={availableTeam.id}
                      type="button"
                      onClick={() => handleAssignTeam(slot, availableTeam.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-800"
                    >
                      <TeamLogo logoUrl={availableTeam.logo_url} name={availableTeam.name} size="xs" />

                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
                        {availableTeam.name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ========================================================
       EQUIPO
    ======================================================== */

    return (
      <div
        className={`
          group/slot relative flex w-full items-center justify-center rounded-md transition-all
          ${isWinner ? 'bg-emerald-500/10' : status === 'ready' ? 'hover:bg-accent-500/10' : ''}
        `}
        style={{ height: `${slotHeight}px` }}
      >
        {/* ====================================================
            BOTÓN DEL ESCUDO
            El tamaño real (logoSize) es la única fuente de verdad:
            nada se agranda por transform, así que nunca puede
            salirse del contenedor.
        ==================================================== */}

        <button
          type="button"
          onClick={() => handlePickWinner(team.id)}
          disabled={status !== 'ready' || picking !== null}
          className="relative flex shrink-0 items-center justify-center rounded-full outline-none"
          style={{ width: `${logoSize}px`, height: `${logoSize}px` }}
          title={status === 'ready' ? `Elegir ${team.name}` : team.name}
        >
          {/* TeamLogo recibe el tamaño real en píxeles (no un token fijo),
              así que crece y encoge exactamente con la ronda. */}
          <TeamLogo logoUrl={team.logo_url} name={team.name} size={logoSize} glow={isWinner} grayscale={isLoser} />

          {/* ==================================================
              ANIMACIÓN AL ELEGIR
          ================================================== */}

          {isPicking && (
            <div className="pointer-events-none absolute inset-[-2px] rounded-full ring-2 ring-accent-400 animate-pulse" />
          )}

          {/* ==================================================
              CHECK DEL GANADOR
          ================================================== */}

          {isWinner && (
            <div
              className="pointer-events-none absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
            >
              <Check size={Math.max(8, Math.round(badgeSize * 0.55))} className="stroke-[3] text-white" />
            </div>
          )}
        </button>

        {/* ====================================================
            QUITAR EQUIPO
        ==================================================== */}

        {canRemove && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleAssignTeam(slot, null);
            }}
            className="absolute right-0 top-1/2 z-20 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900 text-slate-600 opacity-0 transition-all hover:text-red-400 group-hover/slot:opacity-100"
            title="Quitar equipo"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    );
  };

  /* ==========================================================
     CARD
  ========================================================== */

  return (
    <div
      className={`
        bracket-match group relative overflow-visible rounded-xl border bg-[#0d1018]
        shadow-[0_5px_18px_rgba(0,0,0,0.22)] transition-all duration-200
        ${
          status === 'ready'
            ? 'border-accent-500/50 shadow-[0_0_20px_rgba(99,102,241,0.10)]'
            : status === 'completed'
              ? 'border-emerald-500/20'
              : 'border-slate-800'
        }
        ${match.report_status === 'disputed' ? 'border-red-500/60' : ''}
      `}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        padding: `${cardPadding}px`,
      }}
    >
      {/* ======================================================
          BRILLO READY
      ====================================================== */}

      {status === 'ready' && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-accent-400/10" />
      )}

      {/* ======================================================
          DISPUTED
      ====================================================== */}

      {match.report_status === 'disputed' && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-red-500/[0.03]" />
      )}

      {/* ======================================================
          CONTENIDO
      ====================================================== */}

      <div className="relative flex h-full w-full flex-col justify-center" style={{ gap: `${rowGap}px` }}>
        {renderSlot(team1, 1)}

        <div className="mx-1 shrink-0 border-t border-slate-800/80" />

        {renderSlot(team2, 2)}
      </div>

      {/* ======================================================
          DESHACER RESULTADO
      ====================================================== */}

      {match.winner_id && status === 'completed' && isAdmin && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoing}
          title="Deshacer resultado"
          className="absolute -right-2 -top-2 z-50 flex h-5 w-5 items-center justify-center rounded-full border border-slate-800 bg-[#0d1018] text-slate-500 opacity-0 transition hover:text-amber-400 group-hover:opacity-100 disabled:opacity-50"
        >
          <Undo2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

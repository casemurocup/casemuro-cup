import { useState } from 'react';
import {
  Check,
  Lock,
  Clock,
  X,
  ChevronDown,
  Undo2,
} from 'lucide-react';

import { TeamLogo } from '@/components/UI/TeamLogo';
import { matchStatus } from '@/lib/bracket';
import { useTournamentContext } from '@/context/TournamentContext';

import type {
  Match,
  Team,
} from '@/types/tournament';

interface MatchCardProps {
  match: Match;
  compact?: boolean;
  shieldOnly?: boolean;
}

export function MatchCard({
  match,
  compact = false,
  shieldOnly = false,
}: MatchCardProps) {
  const {
    teams,
    matches,
    selectWinner,
    assignTeamToMatch,
    undoWinner,
  } = useTournamentContext();

  const [picking, setPicking] =
    useState<string | null>(null);

  const [openSlot, setOpenSlot] =
    useState<1 | 2 | null>(null);

  const [undoing, setUndoing] =
    useState(false);

  const t1 =
    teams.find(
      (team) =>
        team.id === match.team1_id,
    ) ?? null;

  const t2 =
    teams.find(
      (team) =>
        team.id === match.team2_id,
    ) ?? null;

  const status =
    matchStatus(match);

  const assignedToOtherMatch = (
    teamId: string,
  ): boolean => {
    return matches.some(
      (m) =>
        m.id !== match.id &&
        m.round_number === 1 &&
        (
          m.team1_id === teamId ||
          m.team2_id === teamId
        ),
    );
  };

  const availableTeams =
    teams.filter(
      (team) =>
        !assignedToOtherMatch(
          team.id,
        ) &&
        team.id !== match.team1_id &&
        team.id !== match.team2_id,
    );

  const handlePick = async (
    winnerId: string,
  ) => {
    setPicking(winnerId);

    try {
      await selectWinner(
        match.id,
        winnerId,
      );
    } finally {
      setPicking(null);
    }
  };

  const handleAssign = async (
    slot: 1 | 2,
    teamId: string | null,
  ) => {
    setOpenSlot(null);

    await assignTeamToMatch(
      match.id,
      slot,
      teamId,
    );
  };

  const handleUndo = async () => {
    setUndoing(true);

    try {
      await undoWinner(
        match.id,
      );
    } finally {
      setUndoing(false);
    }
  };

  const Row = ({
    team,
    slot,
    isWinner,
    isLoser,
  }: {
    team: Team | null;
    slot: 1 | 2;
    isWinner: boolean;
    isLoser: boolean;
  }) => {
    const canAssign =
      match.round_number === 1 &&
      !match.winner_id &&
      !team;

    const isOpen =
      openSlot === slot;

    if (!team) {
      if (canAssign) {
        return (
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenSlot(
                  isOpen
                    ? null
                    : slot,
                )
              }
              className={`
                flex
                w-full
                items-center
                justify-center
                gap-2
                rounded-lg
                px-2
                py-2
                transition-all
                ${
                  isOpen
                    ? 'bg-slate-800/80 ring-1 ring-accent-500/40'
                    : 'hover:bg-slate-800/40'
                }
              `}
            >
              <div
                className="
                  h-8
                  w-8
                  shrink-0
                  rounded-full
                  border-2
                  border-dashed
                  border-slate-700
                "
              />

              {!shieldOnly && (
                <span
                  className="
                    flex-1
                    text-left
                    text-sm
                    font-medium
                    italic
                    text-slate-500
                  "
                >
                  {isOpen
                    ? 'Seleccionar equipo...'
                    : 'Asignar equipo'}
                </span>
              )}

              <ChevronDown
                className={`
                  h-3.5
                  w-3.5
                  shrink-0
                  text-slate-500
                  transition-transform
                  ${
                    isOpen
                      ? 'rotate-180'
                      : ''
                  }
                `}
              />
            </button>

            {isOpen && (
              <div
                className="
                  absolute
                  left-0
                  right-0
                  top-full
                  z-[100]
                  mt-1
                  max-h-56
                  overflow-y-auto
                  rounded-xl
                  border
                  border-accent-500/20
                  bg-ink-100
                  shadow-2xl
                "
              >
                {availableTeams.length ===
                0 ? (
                  <div
                    className="
                      px-3
                      py-3
                      text-sm
                      text-slate-500
                    "
                  >
                    No hay equipos disponibles
                  </div>
                ) : (
                  availableTeams.map(
                    (team) => (
                      <button
                        type="button"
                        key={team.id}
                        onClick={() =>
                          handleAssign(
                            slot,
                            team.id,
                          )
                        }
                        className="
                          flex
                          w-full
                          items-center
                          gap-3
                          px-3
                          py-2.5
                          text-left
                          transition
                          hover:bg-slate-800
                        "
                      >
                        <TeamLogo
                          logoUrl={
                            team.logo_url
                          }
                          name={
                            team.name
                          }
                          size="xs"
                        />

                        <span
                          className="
                            min-w-0
                            flex-1
                            truncate
                            text-sm
                            font-medium
                            text-slate-200
                          "
                        >
                          {team.name}
                        </span>
                      </button>
                    ),
                  )
                )}
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          className="
            flex
            items-center
            justify-center
            py-2
          "
        >
          <div
            className="
              h-8
              w-8
              rounded-full
              bg-slate-800/70
              ring-1
              ring-slate-700/50
            "
          />
        </div>
      );
    }

    const isPicking =
      picking === team.id;

    const canRemove =
      match.round_number === 1 &&
      !match.winner_id &&
      !isWinner;

    return (
      <div
        className={`
          group/row
          relative
          flex
          w-full
          items-center
          justify-center
          rounded-lg
          px-2
          py-1.5
          transition-all
          duration-200
          ${
            isWinner
              ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
              : 'hover:bg-slate-800/40'
          }
          ${
            status === 'ready'
              ? 'cursor-pointer'
              : 'cursor-default'
          }
        `}
      >
        <button
          type="button"
          onClick={() =>
            status === 'ready' &&
            handlePick(team.id)
          }
          disabled={
            status !== 'ready' ||
            picking !== null
          }
          className="
            relative
            flex
            items-center
            justify-center
            rounded-full
            outline-none
          "
          title={
            status === 'ready'
              ? `Elegir ${team.name}`
              : team.name
          }
        >
          <div className="relative">
            <TeamLogo
              logoUrl={
                team.logo_url
              }
              name={team.name}
              size="sm"
              glow={isWinner}
              grayscale={isLoser}
            />

            {isWinner && (
              <>
                <div className="winner-burst-ring animate-winner-burst" />

                <div
                  className="
                    winner-burst-ring
                    animate-winner-burst
                  "
                  style={{
                    animationDelay:
                      '0.15s',
                  }}
                />
              </>
            )}

            {isPicking && (
              <div
                className="
                  absolute
                  inset-0
                  rounded-full
                  ring-2
                  ring-accent-400
                  animate-pulse
                "
              />
            )}
          </div>
        </button>

        {!shieldOnly && (
          <span
            className={`
              ml-2
              min-w-0
              flex-1
              truncate
              text-sm
              font-semibold
              ${
                isWinner
                  ? 'text-emerald-400'
                  : isLoser
                    ? 'text-slate-600 line-through'
                    : 'text-slate-200'
              }
            `}
          >
            {team.name}
          </span>
        )}

        {shieldOnly &&
          isWinner && (
            <div
              className="
                absolute
                -right-1
                -top-1
                flex
                h-4
                w-4
                items-center
                justify-center
                rounded-full
                bg-emerald-500
                shadow-lg
              "
            >
              <Check
                className="
                  h-2.5
                  w-2.5
                  text-white
                "
              />
            </div>
          )}

        {!shieldOnly &&
          isWinner && (
            <span
              className="
                ml-1
                flex
                items-center
                gap-1
                rounded-md
                bg-emerald-500/20
                px-1.5
                py-0.5
                text-[9px]
                font-bold
                uppercase
                tracking-wide
                text-emerald-400
              "
            >
              <Check className="h-3 w-3" />
              Clasificado
            </span>
          )}

        {!shieldOnly &&
          isLoser && (
            <span
              className="
                ml-1
                flex
                items-center
                gap-1
                text-[9px]
                font-bold
                uppercase
                tracking-wide
                text-slate-600
              "
            >
              <X className="h-3 w-3" />
              Eliminado
            </span>
          )}

        {canRemove && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();

              handleAssign(
                slot,
                null,
              );
            }}
            className="
              absolute
              -right-1
              -top-1
              z-20
              flex
              h-5
              w-5
              items-center
              justify-center
              rounded-full
              bg-slate-900
              text-slate-600
              opacity-0
              shadow
              transition
              hover:text-red-400
              group-hover/row:opacity-100
            "
            title="Quitar equipo"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={`
        group
        relative
        overflow-visible
        rounded-xl
        border
        bg-ink-100/95
        p-1.5
        backdrop-blur-sm
        transition-all
        duration-300
        ${
          openSlot
            ? 'z-[90]'
            : ''
        }
        ${
          status === 'completed'
            ? 'border-slate-800'
            : match.report_status ===
                'disputed'
              ? 'border-red-500/50'
              : status === 'ready'
                ? 'border-accent-500/50 shadow-[0_0_18px_rgba(99,102,241,0.08)]'
                : 'border-slate-800'
        }
        ${
          compact
            ? 'min-w-[86px] w-[86px]'
            : 'min-w-[220px]'
        }
      `}
    >
      {status === 'ready' && (
        <div
          className="
            light-beam
            animate-beam-sweep
          "
          style={{
            animationDuration: '4s',
            animationIterationCount:
              'infinite',
          }}
        />
      )}

      <div
        className="
          relative
          mb-0.5
          flex
          items-center
          justify-between
          px-1
        "
      >
        <span
          className="
            font-display
            text-[8px]
            font-bold
            uppercase
            tracking-widest
            text-slate-700
          "
        >
          P
          {String(
            match.match_number,
          ).padStart(2, '0')}
        </span>

        <div className="flex items-center gap-1">
          {status === 'completed' && (
            <button
              type="button"
              onClick={
                handleUndo
              }
              disabled={
                undoing
              }
              title="Deshacer resultado"
              className="
                flex
                h-5
                w-5
                items-center
                justify-center
                rounded
                text-slate-600
                transition
                hover:text-amber-400
                disabled:opacity-50
              "
            >
              <Undo2 className="h-3 w-3" />
            </button>
          )}

          {match.report_status ===
            'reported' && (
            <span
              className="
                text-[8px]
                font-bold
                uppercase
                tracking-wide
                text-amber-400
              "
            >
              Reportado
            </span>
          )}

          {match.report_status ===
            'disputed' && (
            <span
              className="
                text-[8px]
                font-bold
                uppercase
                tracking-wide
                text-red-400
                animate-glow-pulse
              "
            >
              Disputa
            </span>
          )}

          {match.report_status ===
            'confirmed' &&
            !match.winner_id && (
              <span
                className="
                  text-[8px]
                  font-bold
                  uppercase
                  tracking-wide
                  text-emerald-400
                "
              >
                OK
              </span>
            )}

          <StatusBadge
            status={status}
          />
        </div>
      </div>

      <div className="relative">
        <Row
          team={t1}
          slot={1}
          isWinner={
            match.winner_id ===
            t1?.id
          }
          isLoser={
            !!match.winner_id &&
            match.winner_id !==
              t1?.id &&
            !!t1
          }
        />

        <div
          className="
            my-0.5
            border-t
            border-dashed
            border-slate-800
          "
        />

        <Row
          team={t2}
          slot={2}
          isWinner={
            match.winner_id ===
            t2?.id
          }
          isLoser={
            !!match.winner_id &&
            match.winner_id !==
              t2?.id &&
            !!t2
          }
        />
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  if (
    status === 'completed'
  ) {
    return (
      <Lock
        className="
          h-2.5
          w-2.5
          text-slate-600
        "
      />
    );
  }

  if (
    status === 'ready'
  ) {
    return (
      <span
        className="
          text-[8px]
          font-bold
          uppercase
          tracking-wide
          text-accent-400
          animate-glow-pulse
        "
      >
        ¡Elige!
      </span>
    );
  }

  return (
    <Clock
      className="
        h-2.5
        w-2.5
        text-slate-700
      "
    />
  );
}
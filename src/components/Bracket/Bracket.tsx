import {
  useLayoutEffect,
  useRef,
} from 'react';

import {
  Trophy,
  LayoutGrid,
  Dices,
} from 'lucide-react';

import { useTournamentContext } from '@/context/TournamentContext';

import { ChampionScreen } from '@/components/Bracket/ChampionScreen';
import { BracketMatch } from '@/components/Bracket/BracketMatch';

import { StatCard } from '@/components/UI/StatCard';
import { BroadcastButton } from '@/components/UI/BroadcastButton';
import { ParticleField } from '@/components/UI/ParticleField';

import {
  groupMatchesByRound,
  roundName,
  matchesInRound,
  totalRounds,
} from '@/lib/bracket';

import type { View } from '@/types/tournament';

interface BracketProps {
  onNavigate?: (view: View) => void;
  isAdmin?: boolean;
}

/* ============================================================
   CONFIGURACIÓN VISUAL DE LAS RONDAS
============================================================ */

const ROUND_CONFIG = {
  1: { width: 92, height: 66 },
  2: { width: 106, height: 76 },
  3: { width: 122, height: 88 },
  4: { width: 190, height: 130 },
  5: { width: 240, height: 160 },
  6: { width: 380, height: 260 },
} as const;

function getRoundConfig(round: number) {
  return (
    ROUND_CONFIG[
      round as keyof typeof ROUND_CONFIG
    ] ?? ROUND_CONFIG[6]
  );
}

/* ============================================================
   CONSTANTES
============================================================ */

const BASE_CENTER_GAP = 70;
const COLUMN_GAP = 84;
const HEADER_HEIGHT = 62;
const BRACKET_SIDE_PADDING = 36;

const FINAL_OFFSET_Y = 28;

const TROPHY_GAP = 72;
const TROPHY_VISUAL_RADIUS = 44;

const BOTTOM_PADDING = 40;

/* ============================================================
   POSICIÓN VERTICAL
============================================================ */

function getMatchCenterY(
  round: number,
  index: number,
): number {
  const spacing =
    BASE_CENTER_GAP *
    Math.pow(2, round - 1);

  return (
    index * spacing +
    spacing / 2
  );
}

function getFinalCenterY(
  rounds: number,
): number {
  const semifinalRound =
    rounds - 1;

  const semifinalCenterY =
    getMatchCenterY(
      semifinalRound,
      0,
    );

  return (
    semifinalCenterY +
    FINAL_OFFSET_Y
  );
}

function getTrophyCenterY(
  rounds: number,
): number {
  return (
    getFinalCenterY(rounds) +
    getRoundConfig(rounds).height /
      2 +
    TROPHY_GAP
  );
}

/* ============================================================
   PARTIDOS POR LADO
============================================================ */

function matchesPerSide(
  teamCount: number,
  round: number,
): number {
  const total =
    matchesInRound(
      teamCount,
      round,
    );

  if (
    round ===
    totalRounds(teamCount)
  ) {
    return 1;
  }

  return Math.ceil(total / 2);
}

/* ============================================================
   NOMBRE DE RONDA
============================================================ */

function getRoundLabel(
  teamCount: number,
  round: number,
): string {
  const rounds =
    totalRounds(teamCount);

  if (round === rounds) {
    return 'FINAL';
  }

  const teamsInSide =
    teamCount /
    Math.pow(2, round);

  switch (teamsInSide) {
    case 32:
      return '32AVOS';

    case 16:
      return '16AVOS';

    case 8:
      return 'OCTAVOS';

    case 4:
      return 'CUARTOS';

    case 2:
      return 'SEMIFINAL';

    default:
      return roundName(
        matchesInRound(
          teamCount,
          round,
        ),
      );
  }
}

/* ============================================================
   COLUMNAS
============================================================ */

interface ColumnInfo {
  column: number;
  round: number;
  side:
    | 'left'
    | 'center'
    | 'right';
}

function buildColumns(
  rounds: number,
): ColumnInfo[] {
  const columns: ColumnInfo[] = [];

  for (
    let round = 1;
    round < rounds;
    round++
  ) {
    columns.push({
      column: round - 1,
      round,
      side: 'left',
    });
  }

  columns.push({
    column: rounds - 1,
    round: rounds,
    side: 'center',
  });

  for (
    let round = rounds - 1;
    round >= 1;
    round--
  ) {
    columns.push({
      column:
        rounds +
        (rounds - 1 - round),
      round,
      side: 'right',
    });
  }

  return columns;
}

/* ============================================================
   CONECTORES
============================================================ */

const CONNECTOR_STROKE = {
  fill: 'none',
  stroke:
    'rgba(100,116,139,0.48)',
  strokeWidth: 1,
  vectorEffect:
    'non-scaling-stroke' as const,
};

function pairConnectorPath(
  exitX: number,
  firstY: number,
  secondY: number,
  midX: number,
): string {
  return `M ${exitX} ${firstY} H ${midX} V ${secondY} H ${exitX}`;
}

function bridgeConnectorPath(
  midX: number,
  y: number,
  entryX: number,
): string {
  return `M ${midX} ${y} H ${entryX}`;
}

function finalConnectorPath(
  exitX: number,
  matchY: number,
  midX: number,
  finalY: number,
  entryX: number,
): string {
  return `M ${exitX} ${matchY} H ${midX} V ${finalY} H ${entryX}`;
}

/* ============================================================
   VIEWPORT
============================================================ */

interface BracketViewportProps {
  bracketWidth: number;
  contentHeight: number;
  focusY: number;
  children: React.ReactNode;
}

function BracketViewport({
  bracketWidth,
  contentHeight,
  focusY,
  children,
}: BracketViewportProps) {
  const viewportRef =
    useRef<HTMLDivElement>(
      null,
    );

  useLayoutEffect(() => {
    const viewport =
      viewportRef.current;

    if (!viewport) return;

    const maxScrollLeft =
      viewport.scrollWidth -
      viewport.clientWidth;

    if (maxScrollLeft > 0) {
      viewport.scrollLeft =
        maxScrollLeft / 2;
    }

    const maxScrollTop =
      viewport.scrollHeight -
      viewport.clientHeight;

    if (maxScrollTop > 0) {
      const centeredTop =
        focusY -
        viewport.clientHeight / 2;

      viewport.scrollTop =
        Math.min(
          maxScrollTop,
          Math.max(
            0,
            centeredTop,
          ),
        );
    } else {
      viewport.scrollTop = 0;
    }
  }, [
    bracketWidth,
    contentHeight,
    focusY,
  ]);

  return (
    <div
      ref={viewportRef}
      className="
        relative
        w-full
        overflow-auto
        overscroll-contain
        rounded-2xl
        border
        border-slate-700/80
        bg-[#080b12]
        shadow-[0_20px_70px_rgba(0,0,0,0.45)]
      "
      style={{
        height:
          'min(78vh, 840px)',
        minHeight: '600px',
        scrollbarGutter:
          'stable both-edges',
      }}
    >
      <div
        className="relative"
        style={{
          width: `${bracketWidth}px`,
          height: `${contentHeight}px`,
          minWidth: `${bracketWidth}px`,
          minHeight: `${contentHeight}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   BRACKET
============================================================ */

export function Bracket({
  onNavigate,
  isAdmin = false,
}: BracketProps) {
  const {
    tournament,
    matches,
    teams,
    loading,
  } = useTournamentContext();

  /* ==========================================================
     LOADING
  ========================================================== */

  if (loading || !tournament) {
    return (
      <div className="flex h-full items-center justify-center py-20 text-slate-500">
        Cargando...
      </div>
    );
  }

  /* ==========================================================
     SETUP
     
     IMPORTANTE:
     La ruleta ya NO vive aquí.
     Está en la pestaña "Sorteo".
  ========================================================== */

  if (tournament.status === 'setup') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
            Cuadro de Eliminatoria
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            El cuadro se generará una vez
            finalice el sorteo de los
            enfrentamientos.
          </p>
        </div>

        <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-accent-500/15 bg-ink-100/60 py-20 text-center">
          <ParticleField count={20} />

          <div className="absolute inset-0 bg-spotlight" />

          <div className="relative">
            <LayoutGrid className="h-14 w-14 animate-float-slow text-accent-400" />
          </div>

          <div className="relative">
            <p className="text-lg font-medium text-slate-300">
              El cuadro todavía no está
              disponible.
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Primero debes realizar el
              sorteo de los enfrentamientos.
            </p>
          </div>

          {isAdmin &&
            onNavigate && (
              <BroadcastButton
                variant="primary"
                size="lg"
                icon={
                  <Dices className="h-5 w-5" />
                }
                onClick={() =>
                  onNavigate('draw')
                }
                className="relative"
              >
                Ir al Sorteo
              </BroadcastButton>
            )}

          {!isAdmin && (
            <p className="relative text-sm text-slate-600">
              El organizador está
              preparando el torneo.
            </p>
          )}

          <div className="relative mt-2 text-xs text-slate-600">
            {teams.length} /{' '}
            {tournament.team_count}{' '}
            equipos registrados
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
     DATOS
  ========================================================== */

  const teamCount =
    Number(tournament.team_count);

  const rounds =
    totalRounds(
      tournament.team_count,
    );

  const byRound =
    groupMatchesByRound(matches);

  const played =
    matches.filter(
      (match) =>
        !!match.winner_id,
    ).length;

  const pending =
    matches.filter(
      (match) =>
        !!match.team1_id &&
        !!match.team2_id &&
        !match.winner_id,
    ).length;

  const columns =
    buildColumns(rounds);

  /* ==========================================================
     POSICIONES HORIZONTALES — IZQUIERDA
  ========================================================== */

  const leftColumnX: number[] = [];

  {
    let cursor =
      BRACKET_SIDE_PADDING;

    for (
      let round = 1;
      round <= rounds;
      round++
    ) {
      leftColumnX.push(
        cursor,
      );

      cursor +=
        getRoundConfig(
          round,
        ).width;

      if (round < rounds) {
        cursor += COLUMN_GAP;
      }
    }
  }

  const finalX =
    leftColumnX[rounds - 1];

  const finalWidth =
    getRoundConfig(rounds).width;

  const leftBracketWidth =
    finalX -
    BRACKET_SIDE_PADDING;

  const bracketWidth =
    BRACKET_SIDE_PADDING +
    leftBracketWidth +
    finalWidth +
    leftBracketWidth +
    BRACKET_SIDE_PADDING;

  /* ==========================================================
     POSICIONES HORIZONTALES — DERECHA
  ========================================================== */

  const rightColumnX: Record<
    number,
    number
  > = {};

  for (
    let round = 1;
    round < rounds;
    round++
  ) {
    const width =
      getRoundConfig(round)
        .width;

    const leftX =
      leftColumnX[
        round - 1
      ];

    rightColumnX[round] =
      bracketWidth -
      leftX -
      width;
  }

  /* ==========================================================
     ALTURA
  ========================================================== */

  const firstRoundCount =
    matchesPerSide(
      tournament.team_count,
      1,
    );

  const firstRoundLastCenter =
    getMatchCenterY(
      1,
      firstRoundCount - 1,
    );

  const bottomOfFirstRound =
    firstRoundLastCenter +
    getRoundConfig(1).height /
      2;

  const bottomOfTrophy =
    getTrophyCenterY(rounds) +
    TROPHY_VISUAL_RADIUS;

  const contentHeight =
    HEADER_HEIGHT +
    Math.max(
      bottomOfFirstRound,
      bottomOfTrophy,
    ) +
    BOTTOM_PADDING;

  /* ==========================================================
     FINAL
  ========================================================== */

  const finalCenterY =
    HEADER_HEIGHT +
    getFinalCenterY(rounds);

  const trophyCenterY =
    HEADER_HEIGHT +
    getTrophyCenterY(rounds);

  /* ==========================================================
     CONECTORES
     
     Ya NO usamos useMemo aquí.
     Esto evita tener un hook que solo se ejecutaba
     cuando el torneo estaba fuera de setup.
  ========================================================== */

  const connectors: React.ReactNode[] =
    [];

  /* ============================================================
     LADO IZQUIERDO
  ============================================================ */

  for (
    let round = 1;
    round < rounds;
    round++
  ) {
    const count =
      matchesPerSide(
        tournament.team_count,
        round,
      );

    const currentConfig =
      getRoundConfig(round);

    const currentX =
      leftColumnX[
        round - 1
      ];

    const exitX =
      currentX +
      currentConfig.width;

    const midX =
      exitX +
      COLUMN_GAP / 2;

    if (
      round ===
      rounds - 1
    ) {
      const semifinalY =
        HEADER_HEIGHT +
        getMatchCenterY(
          round,
          0,
        );

      connectors.push(
        <path
          key="L-FINAL"
          d={finalConnectorPath(
            exitX,
            semifinalY,
            midX,
            finalCenterY,
            finalX,
          )}
          {...CONNECTOR_STROKE}
        />,
      );

      continue;
    }

    const nextX =
      leftColumnX[round];

    for (
      let index = 0;
      index < count;
      index += 2
    ) {
      const firstY =
        HEADER_HEIGHT +
        getMatchCenterY(
          round,
          index,
        );

      const secondY =
        HEADER_HEIGHT +
        getMatchCenterY(
          round,
          index + 1,
        );

      const pairY =
        (firstY + secondY) /
        2;

      connectors.push(
        <path
          key={`L-P-${round}-${index}`}
          d={pairConnectorPath(
            exitX,
            firstY,
            secondY,
            midX,
          )}
          {...CONNECTOR_STROKE}
        />,
      );

      connectors.push(
        <path
          key={`L-N-${round}-${index}`}
          d={bridgeConnectorPath(
            midX,
            pairY,
            nextX,
          )}
          {...CONNECTOR_STROKE}
        />,
      );
    }
  }

  /* ============================================================
     LADO DERECHO
  ============================================================ */

  for (
    let round = 1;
    round < rounds;
    round++
  ) {
    const count =
      matchesPerSide(
        tournament.team_count,
        round,
      );

    const currentX =
      rightColumnX[round];

    const exitX = currentX;

    const midX =
      exitX -
      COLUMN_GAP / 2;

    if (
      round ===
      rounds - 1
    ) {
      const semifinalY =
        HEADER_HEIGHT +
        getMatchCenterY(
          round,
          0,
        );

      connectors.push(
        <path
          key="R-FINAL"
          d={finalConnectorPath(
            exitX,
            semifinalY,
            midX,
            finalCenterY,
            finalX + finalWidth,
          )}
          {...CONNECTOR_STROKE}
        />,
      );

      continue;
    }

    const nextRoundWidth =
      getRoundConfig(
        round + 1,
      ).width;

    const nextX =
      rightColumnX[
        round + 1
      ] +
      nextRoundWidth;

    for (
      let index = 0;
      index < count;
      index += 2
    ) {
      const firstY =
        HEADER_HEIGHT +
        getMatchCenterY(
          round,
          index,
        );

      const secondY =
        HEADER_HEIGHT +
        getMatchCenterY(
          round,
          index + 1,
        );

      const pairY =
        (firstY + secondY) /
        2;

      connectors.push(
        <path
          key={`R-P-${round}-${index}`}
          d={pairConnectorPath(
            exitX,
            firstY,
            secondY,
            midX,
          )}
          {...CONNECTOR_STROKE}
        />,
      );

      connectors.push(
        <path
          key={`R-N-${round}-${index}`}
          d={bridgeConnectorPath(
            midX,
            pairY,
            nextX,
          )}
          {...CONNECTOR_STROKE}
        />,
      );
    }
  }

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
            Cuadro de Eliminatoria
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Selecciona el ganador de
            cada enfrentamiento para
            avanzar.
          </p>
        </div>

        <div className="flex w-fit items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <Trophy className="h-4 w-4 text-amber-400" />

          <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
            {teamCount} equipos
          </span>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Rondas"
          value={rounds}
          accent="sky"
        />

        <StatCard
          label="Partidos"
          value={matches.length}
          accent="accent"
        />

        <StatCard
          label="Jugados"
          value={played}
          accent="emerald"
        />

        <StatCard
          label="Pendientes"
          value={pending}
          accent="amber"
        />
      </div>

      {tournament.status ===
        'completed' && (
        <ChampionScreen />
      )}

      {/* BRACKET */}
      <div className="relative left-1/2 w-[calc(100vw-24px)] max-w-none -translate-x-1/2">
        <BracketViewport
          bracketWidth={
            bracketWidth
          }
          contentHeight={
            contentHeight
          }
          focusY={
            finalCenterY
          }
        >
          {/* BACKGROUND */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `
                radial-gradient(circle at 50% 50%, rgba(245,158,11,0.045), transparent 28%),
                radial-gradient(circle at 50% 50%, rgba(99,102,241,0.035), transparent 55%)
              `,
            }}
          />

          {/* CONNECTORS */}
          <svg
            className="pointer-events-none absolute inset-0 z-10"
            width={bracketWidth}
            height={contentHeight}
            viewBox={`0 0 ${bracketWidth} ${contentHeight}`}
          >
            {connectors}
          </svg>

          {/* COLUMNS */}
          {columns.map(
            ({
              column,
              round,
              side,
            }) => {
              const count =
                side === 'center'
                  ? 1
                  : matchesPerSide(
                      tournament.team_count,
                      round,
                    );

              const config =
                getRoundConfig(
                  round,
                );

              let left = 0;

              if (
                side ===
                'left'
              ) {
                left =
                  leftColumnX[
                    round - 1
                  ];
              }

              if (
                side ===
                'center'
              ) {
                left = finalX;
              }

              if (
                side ===
                'right'
              ) {
                left =
                  rightColumnX[
                    round
                  ];
              }

              const allRoundMatches =
                byRound.get(
                  round,
                ) ?? [];

              let roundMatches =
                allRoundMatches;

              if (
                side ===
                'left'
              ) {
                roundMatches =
                  allRoundMatches.slice(
                    0,
                    count,
                  );
              }

              if (
                side ===
                'right'
              ) {
                roundMatches =
                  allRoundMatches.slice(
                    count,
                    count * 2,
                  );
              }

              if (
                side ===
                'center'
              ) {
                roundMatches =
                  allRoundMatches.slice(
                    0,
                    1,
                  );
              }

              return (
                <div
                  key={`${side}-${round}-${column}`}
                  className="absolute top-0 z-20"
                  style={{
                    left: `${left}px`,
                    width: `${config.width}px`,
                    height: `${contentHeight}px`,
                  }}
                >
                  {/* ROUND TITLE */}
                  <div
                    className={`
                      absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap
                      rounded-full border px-3 py-1 text-center text-[9px]
                      font-bold uppercase tracking-[0.14em]
                      ${
                        round ===
                        rounds
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                          : 'border-slate-700 bg-slate-900 text-slate-500'
                      }
                    `}
                  >
                    {getRoundLabel(
                      teamCount,
                      round,
                    )}
                  </div>

                  {/* MATCHES */}
                  {Array.from(
                    {
                      length: count,
                    },
                    (_, index) => {
                      const match =
                        roundMatches[
                          index
                        ];

                      const center =
                        round ===
                        rounds
                          ? getFinalCenterY(
                              rounds,
                            )
                          : getMatchCenterY(
                              round,
                              index,
                            );

                      const top =
                        HEADER_HEIGHT +
                        center -
                        config.height /
                          2;

                      return (
                        <div
                          key={
                            match?.id ??
                            `${side}-${round}-${index}`
                          }
                          className="absolute"
                          style={{
                            top: `${top}px`,
                            width: `${config.width}px`,
                            height: `${config.height}px`,
                          }}
                        >
                          {match ? (
                            <BracketMatch
                              match={match}
                              isAdmin={
                                isAdmin
                              }
                              width={
                                config.width
                              }
                              height={
                                config.height
                              }
                            />
                          ) : (
                            <div className="h-full w-full rounded-xl border border-dashed border-slate-800 bg-slate-950/30" />
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              );
            },
          )}

          {/* TROPHY */}
          <div
            className="pointer-events-none absolute z-30 flex items-center justify-center"
            style={{
              left: `${
                finalX +
                finalWidth / 2
              }px`,
              top: `${trophyCenterY}px`,
              transform:
                'translate(-50%, -50%)',
            }}
          >
            <div className="absolute -inset-8 rounded-full bg-amber-500/[0.035] blur-2xl" />

            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/30 bg-[#0d1018] shadow-[0_0_35px_rgba(245,158,11,0.10)]">
              <Trophy className="h-6 w-6 text-amber-400" />
            </div>
          </div>
        </BracketViewport>
      </div>

      {/* HELP */}
      <p className="text-center text-xs text-slate-600">
        Desliza horizontal y verticalmente
        para recorrer el cuadro. Pulsa un
        escudo cuando el enfrentamiento
        esté listo para elegir al ganador.
      </p>
    </div>
  );
}
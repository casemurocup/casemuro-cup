import { useEffect, useRef, useState } from 'react';
import {
  Dices,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Zap,
} from 'lucide-react';

import { TeamLogo } from '@/components/UI/TeamLogo';
import { BroadcastButton } from '@/components/UI/BroadcastButton';
import { ParticleField } from '@/components/UI/ParticleField';

import type { Team } from '@/types/tournament';

interface TeamRouletteProps {
  teams: Team[];
  onComplete: (drawOrder: string[]) => void;
  onCancel: () => void;
}

interface DrawnPair {
  team1: Team;
  team2: Team | null;
  matchNumber: number;
}

const MATCHES_PER_PAGE = 9;

export function TeamRoulette({
  teams,
  onComplete,
  onCancel,
}: TeamRouletteProps) {
  const [available, setAvailable] = useState<Team[]>(teams);
  const [drawnPairs, setDrawnPairs] = useState<DrawnPair[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [currentPick, setCurrentPick] = useState<Team | null>(null);
  const [pickSlot, setPickSlot] = useState<1 | 2 | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const totalMatches = Math.ceil(teams.length / 2);

  // Un partido solo cuenta como completado cuando tiene los dos equipos.
  const completedPairs = drawnPairs.filter(
    (pair) => pair.team2 !== null
  ).length;

  // El sorteo termina únicamente cuando no quedan equipos
  // y todos los partidos tienen sus dos equipos.
  const isComplete =
    available.length === 0 &&
    completedPairs === totalMatches;

  const totalPages = Math.max(
    1,
    Math.ceil(drawnPairs.length / MATCHES_PER_PAGE)
  );

  const visiblePairs = drawnPairs.slice(
    currentPage * MATCHES_PER_PAGE,
    currentPage * MATCHES_PER_PAGE + MATCHES_PER_PAGE
  );

  /*
   * Cuando se añade un nuevo partido, si pertenece a una página
   * posterior, cambiamos automáticamente a esa página.
   */
  useEffect(() => {
    if (drawnPairs.length === 0) {
      setCurrentPage(0);
      return;
    }

    const lastMatchIndex = drawnPairs.length - 1;

    const lastMatchPage = Math.floor(
      lastMatchIndex / MATCHES_PER_PAGE
    );

    setCurrentPage(lastMatchPage);
  }, [drawnPairs.length]);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext: typeof AudioContext;
          }
        ).webkitAudioContext;

      audioCtxRef.current = new AudioContextClass();
    }

    return audioCtxRef.current;
  };

  const playSpinSound = () => {
    if (!soundOn) return;

    const ctx = getAudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';

    osc.frequency.setValueAtTime(
      120,
      ctx.currentTime
    );

    osc.frequency.exponentialRampToValueAtTime(
      40,
      ctx.currentTime + 3
    );

    gain.gain.setValueAtTime(
      0.08,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + 3
    );

    osc.start();
    osc.stop(ctx.currentTime + 3);
  };

  const playTickSound = () => {
    if (!soundOn) return;

    const ctx = getAudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.value = 800;

    gain.gain.setValueAtTime(
      0.03,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + 0.05
    );

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  };

  const playResultSound = () => {
    if (!soundOn) return;

    const ctx = getAudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';

    osc.frequency.setValueAtTime(
      440,
      ctx.currentTime
    );

    osc.frequency.exponentialRampToValueAtTime(
      880,
      ctx.currentTime + 0.3
    );

    gain.gain.setValueAtTime(
      0.1,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + 0.4
    );

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  };

  /*
   * Sonido utilizado al mezclar equipos.
   */
  const playMixSound = () => {
    if (!soundOn) return;

    const ctx = getAudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';

    osc.frequency.setValueAtTime(
      240,
      ctx.currentTime
    );

    osc.frequency.exponentialRampToValueAtTime(
      700,
      ctx.currentTime + 0.12
    );

    osc.frequency.exponentialRampToValueAtTime(
      300,
      ctx.currentTime + 0.3
    );

    gain.gain.setValueAtTime(
      0.05,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + 0.3
    );

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  /*
   * Fisher-Yates.
   *
   * Devuelve una nueva lista mezclada sin modificar
   * el array original.
   */
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];

    for (
      let i = shuffled.length - 1;
      i > 0;
      i--
    ) {
      const j = Math.floor(
        Math.random() * (i + 1)
      );

      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    return shuffled;
  };

  /*
   * MEZCLAR EQUIPOS
   *
   * Solo mezcla los equipos que todavía no han sido sorteados.
   */
  const shuffleTeams = () => {
    if (
      spinning ||
      mixing ||
      available.length <= 1 ||
      isComplete
    ) {
      return;
    }

    setMixing(true);
    setCurrentPick(null);
    setPickSlot(null);

    playMixSound();

    let iterations = 0;
    const maxIterations = 8;

    const interval = setInterval(() => {
      setAvailable((prev) =>
        shuffleArray(prev)
      );

      iterations++;

      if (iterations >= maxIterations) {
        clearInterval(interval);

        setAvailable((prev) =>
          shuffleArray(prev)
        );

        setMixing(false);
      }
    }, 100);
  };

  /*
   * GENERAR TODO
   *
   * Genera todos los enfrentamientos restantes
   * instantáneamente.
   *
   * Si existe un partido incompleto, primero completa
   * ese partido y después genera los restantes.
   */
  const generateAll = () => {
    if (
      spinning ||
      mixing ||
      isComplete ||
      available.length === 0
    ) {
      return;
    }

    let remainingTeams = shuffleArray(available);
    const updatedPairs = [...drawnPairs];

    /*
     * Si el último partido tiene solamente el primer equipo,
     * completamos ese partido primero.
     */
    const lastPairIndex =
      updatedPairs.length - 1;

    const lastPair =
      lastPairIndex >= 0
        ? updatedPairs[lastPairIndex]
        : null;

    if (
      lastPair &&
      lastPair.team2 === null &&
      remainingTeams.length > 0
    ) {
      const opponent = remainingTeams[0];

      remainingTeams =
        remainingTeams.slice(1);

      updatedPairs[lastPairIndex] = {
        ...lastPair,
        team2: opponent,
      };
    }

    /*
     * Generamos todos los partidos restantes.
     */
    while (remainingTeams.length >= 2) {
      const team1 = remainingTeams[0];
      const team2 = remainingTeams[1];

      remainingTeams =
        remainingTeams.slice(2);

      updatedPairs.push({
        team1,
        team2,
        matchNumber:
          updatedPairs.length + 1,
      });
    }

    /*
     * Si quedase un equipo suelto, lo dejamos como
     * partido incompleto, siguiendo la misma estructura
     * utilizada por el sorteo normal.
     */
    if (remainingTeams.length === 1) {
      updatedPairs.push({
        team1: remainingTeams[0],
        team2: null,
        matchNumber:
          updatedPairs.length + 1,
      });
    }

    setDrawnPairs(updatedPairs);
    setAvailable([]);
    setCurrentPick(null);
    setPickSlot(null);

    /*
     * Nos situamos automáticamente en la última página.
     */
    const lastPage = Math.max(
      0,
      Math.ceil(
        updatedPairs.length /
          MATCHES_PER_PAGE
      ) - 1
    );

    setCurrentPage(lastPage);
  };

  const finishSpin = (picked: Team) => {
    const slot: 1 | 2 =
      drawnPairs.length > 0 &&
      drawnPairs[drawnPairs.length - 1].team2 === null
        ? 2
        : 1;

    if (slot === 1) {
      setDrawnPairs((prev) => [
        ...prev,
        {
          team1: picked,
          team2: null,
          matchNumber: prev.length + 1,
        },
      ]);
    } else {
      setDrawnPairs((prev) => {
        const updated = [...prev];

        if (updated.length === 0) {
          return updated;
        }

        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          team2: picked,
        };

        return updated;
      });
    }

    setAvailable((prev) =>
      prev.filter(
        (team) => team.id !== picked.id
      )
    );

    setCurrentPick(picked);
    setPickSlot(slot);
    setSpinning(false);

    playResultSound();
  };

  /*
   * GIRO NORMAL
   */
  const spin = () => {
    if (
      spinning ||
      mixing ||
      available.length === 0 ||
      isComplete
    ) {
      return;
    }

    /*
     * Primero elegimos el equipo.
     */
    const pickedIndex = Math.floor(
      Math.random() * available.length
    );

    const picked = available[pickedIndex];

    /*
     * El orden actual de available es el orden
     * representado en la ruleta.
     */
    const wheelTeams = available;

    const segmentAngle =
      360 / wheelTeams.length;

    const segmentCenter =
      pickedIndex * segmentAngle +
      segmentAngle / 2;

    /*
     * La flecha está arriba.
     * En coordenadas CSS corresponde a 270 grados.
     */
    const targetRotation =
      270 - segmentCenter;

    const currentNormalized =
      ((wheelRotation % 360) + 360) % 360;

    let delta =
      ((targetRotation -
        currentNormalized) +
        360) %
      360;

    if (delta < 1) {
      delta = 360;
    }

    /*
     * Entre 3 y 5 vueltas completas.
     */
    const fullSpins =
      3 + Math.floor(Math.random() * 3);

    const totalRotation =
      fullSpins * 360 + delta;

    setSpinning(true);
    setCurrentPick(null);
    setPickSlot(null);

    playSpinSound();

    setWheelRotation(
      (prev) => prev + totalRotation
    );

    const spinDuration = 3000;
    const intervalMs = 80;

    let ticks = 0;

    const maxTicks =
      spinDuration / intervalMs;

    const interval = setInterval(() => {
      ticks++;

      if (
        ticks < maxTicks &&
        ticks % 3 === 0
      ) {
        playTickSound();
      }

      if (ticks >= maxTicks) {
        clearInterval(interval);

        finishSpin(picked);
      }
    }, intervalMs);
  };

  /*
   * REINICIAR
   */
  const reset = () => {
    setAvailable(teams);
    setDrawnPairs([]);
    setCurrentPick(null);
    setPickSlot(null);
    setSpinning(false);
    setMixing(false);
    setWheelRotation(0);
    setCurrentPage(0);
  };

  /*
   * GENERAR CUADRO FINAL
   */
  const handleComplete = () => {
    if (!isComplete) {
      return;
    }

    const order: string[] = [];

    for (const pair of drawnPairs) {
      order.push(pair.team1.id);

      if (pair.team2) {
        order.push(pair.team2.id);
      }
    }

    onComplete(order);
  };

  /*
   * EQUIPOS MOSTRADOS EN LA RULETA
   */
  const wheelTeams =
    available.length > 0
      ? available
      : currentPick
        ? [currentPick]
        : [];

  const segmentAngle =
    360 /
    Math.max(
      wheelTeams.length,
      1
    );

  const progressPercentage =
    totalMatches > 0
      ? Math.min(
          100,
          (completedPairs /
            totalMatches) *
            100
        )
      : 0;

  const canGoPrevious =
    currentPage > 0;

  const canGoNext =
    currentPage <
    totalPages - 1;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-slate-100">
            Sorteo del Cuadro
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Gira la ruleta para emparejar los equipos. Cada dos giros forman un partido.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* SOUND */}
          <button
            onClick={() =>
              setSoundOn(!soundOn)
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/60 text-slate-400 transition hover:text-slate-200"
            aria-label={
              soundOn
                ? 'Desactivar sonido'
                : 'Activar sonido'
            }
          >
            {soundOn ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>

          {/* RESET */}
          <BroadcastButton
            variant="ghost"
            size="md"
            icon={
              <RotateCcw className="h-4 w-4" />
            }
            onClick={reset}
            disabled={
              spinning ||
              mixing ||
              (drawnPairs.length === 0 &&
                !currentPick)
            }
          >
            Reiniciar
          </BroadcastButton>
        </div>
      </div>

      {/* PROGRESS */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-widest text-slate-400">
              Progreso del sorteo
            </span>

            <span className="font-bold text-slate-300">
              {completedPairs} / {totalMatches} partidos
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-all duration-500"
              style={{
                width: `${progressPercentage}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* WHEEL */}
        <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-accent-500/15 bg-ink-100/60 py-8">
          <ParticleField count={15} />

          <div className="absolute inset-0 bg-spotlight" />

          <div
            className="relative"
            style={{
              width: '320px',
              height: '320px',
            }}
          >
            {/* POINTER */}
            <div className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1">
              <div
                className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[24px] border-l-transparent border-r-transparent border-t-accent-400 drop-shadow-lg"
                style={{
                  filter:
                    'drop-shadow(0 2px 4px rgba(245,158,11,0.5))',
                }}
              />
            </div>

            {/* WHEEL */}
            <div
              className={`absolute inset-0 rounded-full border-4 border-accent-500/30 shadow-2xl ${
                mixing
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{
                transform: `rotate(${wheelRotation}deg)`,

                transition: spinning
                  ? 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
                  : 'none',

                background:
                  wheelTeams.length > 0
                    ? `conic-gradient(${wheelTeams
                        .map((_, i) => {
                          const hue =
                            (i * 360) /
                            Math.max(
                              wheelTeams.length,
                              1
                            );

                          return `hsl(${hue}, 35%, 18%) ${
                            i * segmentAngle
                          }deg ${
                            (i + 1) *
                            segmentAngle
                          }deg`;
                        })
                        .join(', ')})`
                    : 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
              }}
            >
              {wheelTeams.map(
                (team, i) => {
                  const angle =
                    i * segmentAngle +
                    segmentAngle / 2;

                  const radius = 110;

                  const rad =
                    (angle * Math.PI) /
                    180;

                  const x =
                    Math.cos(rad) *
                    radius;

                  const y =
                    Math.sin(rad) *
                    radius;

                  return (
                    <div
                      key={team.id}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform:
                          `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                      }}
                    >
                      {/* TEAM LOGO */}
                      <div className="flex items-center justify-center">
                        <TeamLogo
                          logoUrl={
                            team.logo_url
                          }
                          name={team.name}
                          size={40}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* CENTER HUB */}
            <div className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent-500/40 bg-ink-100 shadow-xl">
              <Dices className="h-7 w-7 text-accent-400" />
            </div>
          </div>

          {/* CURRENT PICK */}
          <div className="relative min-h-[80px]">
            {mixing ? (
              <div className="flex items-center gap-2 text-accent-400">
                <Shuffle className="h-5 w-5 animate-spin" />

                <span className="text-lg font-bold uppercase tracking-widest">
                  Mezclando...
                </span>
              </div>
            ) : spinning ? (
              <div className="flex items-center gap-2 text-slate-400">
                <span className="animate-pulse text-lg font-bold uppercase tracking-widest">
                  Girando...
                </span>
              </div>
            ) : currentPick ? (
              <div className="flex flex-col items-center gap-2 animate-scale-in">
                <span className="text-xs font-bold uppercase tracking-widest text-accent-400">
                  {pickSlot === 1
                    ? 'Equipo 1 del partido'
                    : 'Equipo 2 del partido'}
                </span>

                <div className="flex items-center gap-3 rounded-xl border border-accent-500/30 bg-accent-500/10 px-5 py-3">
                  <TeamLogo
                    logoUrl={
                      currentPick.logo_url
                    }
                    name={currentPick.name}
                    size="lg"
                    glow
                  />

                  <span className="font-display text-xl font-bold uppercase tracking-wide text-slate-100">
                    {currentPick.name}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Pulsa "Girar" para empezar el sorteo
              </p>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* MEZCLAR */}
            {!isComplete && (
              <BroadcastButton
                variant="ghost"
                size="xl"
                icon={
                  <Shuffle className="h-5 w-5" />
                }
                onClick={shuffleTeams}
                disabled={
                  spinning ||
                  mixing ||
                  available.length <= 1
                }
                className="relative"
              >
                {mixing
                  ? 'Mezclando...'
                  : 'Mezclar'}
              </BroadcastButton>
            )}

            {/* GIRAR / GENERAR CUADRO */}
            <BroadcastButton
              variant="primary"
              size="xl"
              icon={
                isComplete ? (
                  <LayoutGrid className="h-6 w-6" />
                ) : (
                  <Dices className="h-6 w-6" />
                )
              }
              onClick={
                isComplete
                  ? handleComplete
                  : spin
              }
              disabled={
                spinning ||
                mixing
              }
              className="relative"
            >
              {isComplete
                ? 'Generar Cuadro'
                : spinning
                  ? 'Girando...'
                  : 'Girar Ruleta'}
            </BroadcastButton>

            {/* GENERAR TODO */}
            {!isComplete && (
              <BroadcastButton
                variant="ghost"
                size="xl"
                icon={
                  <Zap className="h-5 w-5" />
                }
                onClick={generateAll}
                disabled={
                  spinning ||
                  mixing ||
                  available.length === 0
                }
                className="relative"
              >
                Generar todo
              </BroadcastButton>
            )}
          </div>
        </div>

        {/* DRAWN MATCHES */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-slate-200">
              Enfrentamientos sorteados
            </h3>

            {drawnPairs.length > 0 && (
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {drawnPairs.length} / {totalMatches}
              </span>
            )}
          </div>

          {drawnPairs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
              Los partidos aparecerán aquí según gires la ruleta.
            </div>
          ) : (
            <>
              {/* MATCH GRID */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visiblePairs.map(
                  (pair, idx) => (
                    <div
                      key={`${pair.matchNumber}-${pair.team1.id}`}
                      className="h-full animate-fade-in rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                      style={{
                        animationDelay: `${idx * 0.05}s`,
                      }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-500/15 text-[10px] font-bold text-accent-400">
                          {pair.matchNumber}
                        </span>

                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                          Partido {pair.matchNumber}
                        </span>
                      </div>

                      <div className="flex flex-col gap-3">
                        {/* TEAM 1 */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <TeamLogo
                              logoUrl={
                                pair.team1
                                  .logo_url
                              }
                              name={
                                pair.team1.name
                              }
                              size="sm"
                            />

                            <span className="truncate text-sm font-bold text-slate-200">
                              {pair.team1.name}
                            </span>
                          </div>
                        </div>

                        {/* VS */}
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-slate-800" />

                          <span className="font-display text-xs font-bold text-slate-600">
                            VS
                          </span>

                          <div className="h-px flex-1 bg-slate-800" />
                        </div>

                        {/* TEAM 2 */}
                        <div className="flex items-center justify-between gap-2">
                          {pair.team2 ? (
                            <div className="flex min-w-0 w-full items-center justify-end gap-2">
                              <span className="truncate text-right text-sm font-bold text-slate-200">
                                {
                                  pair
                                    .team2
                                    .name
                                }
                              </span>

                              <TeamLogo
                                logoUrl={
                                  pair
                                    .team2
                                    .logo_url
                                }
                                name={
                                  pair
                                    .team2
                                    .name
                                }
                                size="sm"
                              />
                            </div>
                          ) : (
                            <div className="flex w-full items-center justify-center">
                              <span className="animate-pulse text-sm text-slate-600">
                                Esperando...
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() =>
                      setCurrentPage(
                        (page) =>
                          Math.max(
                            0,
                            page - 1
                          )
                      )
                    }
                    disabled={!canGoPrevious}
                    aria-label="Página anterior"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 transition hover:border-accent-500/30 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {Array.from(
                      {
                        length: totalPages,
                      },
                      (_, index) => (
                        <button
                          key={index}
                          onClick={() =>
                            setCurrentPage(
                              index
                            )
                          }
                          className={`flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-bold transition ${
                            currentPage ===
                            index
                              ? 'bg-accent-500 text-slate-950'
                              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {index + 1}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage(
                        (page) =>
                          Math.min(
                            totalPages - 1,
                            page + 1
                          )
                      )
                    }
                    disabled={!canGoNext}
                    aria-label="Página siguiente"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 transition hover:border-accent-500/30 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* PAGE INFO */}
              {totalPages > 1 && (
                <div className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  Página {currentPage + 1} de{' '}
                  {totalPages}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* COMPLETION STATUS */}
      {isComplete && (
        <div className="animate-scale-in rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Check className="h-5 w-5 text-emerald-400" />

            <p className="text-sm font-bold text-emerald-300">
              Sorteo completado. Todos los enfrentamientos están listos.
            </p>
          </div>
        </div>
      )}

      {/* CANCEL */}
      <button
        onClick={onCancel}
        className="text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:text-slate-300"
      >
        Cancelar sorteo
      </button>
    </div>
  );
}
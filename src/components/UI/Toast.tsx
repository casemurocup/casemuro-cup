import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

let externalSetter: ((t: ToastState | null) => void) | null = null;

export function showToast(
  message: string,
  type: 'success' | 'error' = 'success'
) {
  externalSetter?.({ message, type });
}

function playNotificationSound() {
  try {
    const AudioContext =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof window.AudioContext;
      }).webkitAudioContext;

    if (!AudioContext) return;

    const audioContext = new AudioContext();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';

    oscillator.frequency.setValueAtTime(
      880,
      audioContext.currentTime
    );

    oscillator.frequency.setValueAtTime(
      1174,
      audioContext.currentTime + 0.08
    );

    gainNode.gain.setValueAtTime(
      0.0001,
      audioContext.currentTime
    );

    gainNode.gain.exponentialRampToValueAtTime(
      0.12,
      audioContext.currentTime + 0.02
    );

    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.35
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime + 0.35
    );

    oscillator.addEventListener('ended', () => {
      audioContext.close().catch(() => {});
    });
  } catch {
    // El sonido no debe impedir que aparezca la notificación.
  }
}

export function Toast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const clear = useCallback(() => setToast(null), []);

  useEffect(() => {
    externalSetter = setToast;

    return () => {
      externalSetter = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    playNotificationSound();

    const timer = setTimeout(clear, 7000);

    return () => clearTimeout(timer);
  }, [toast, clear]);

  if (!toast) return null;

  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : AlertCircle;

  const accent =
    toast.type === 'success'
      ? 'text-emerald-400 border-emerald-500/30'
      : 'text-red-400 border-red-500/30';

  return (
    <div className="fixed right-6 top-24 z-[9999] animate-slide-up">
      <div
        className={`flex items-center gap-3 rounded-xl border bg-ink-100/95 px-4 py-3 shadow-2xl backdrop-blur-md ${accent}`}
      >
        <Icon
          className={`h-5 w-5 ${accent.split(' ')[0]}`}
        />

        <span className="text-sm font-medium text-slate-100">
          {toast.message}
        </span>

        <button
          onClick={clear}
          className="ml-2 text-slate-500 transition hover:text-slate-200"
          aria-label="Cerrar notificación"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
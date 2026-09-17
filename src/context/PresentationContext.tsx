import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface PresentationState {
  presentation: boolean;
  fullscreen: boolean;
  live: boolean;
  togglePresentation: () => void;
  toggleFullscreen: () => void;
  toggleLive: () => void;
}

const PresentationContext = createContext<PresentationState | null>(null);

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const togglePresentation = useCallback(() => setPresentation((p) => !p), []);
  const toggleLive = useCallback(() => setLive((l) => !l), []);

  return (
    <PresentationContext.Provider value={{ presentation, fullscreen, live, togglePresentation, toggleFullscreen, toggleLive }}>
      {children}
    </PresentationContext.Provider>
  );
}

export function usePresentation(): PresentationState {
  const ctx = useContext(PresentationContext);
  if (!ctx) throw new Error('usePresentation debe usarse dentro de PresentationProvider');
  return ctx;
}

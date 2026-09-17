import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTournament } from '@/hooks/useTournament';
import { showToast } from '@/components/UI/Toast';

type TournamentContextValue = ReturnType<typeof useTournament>;

const TournamentContext = createContext<TournamentContextValue | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const value = useTournament();

  /*
   * El hook guardaba el motivo de cada fallo en `error`, pero nadie lo
   * pintaba: al intentar reiniciar el torneo o borrar un equipo y ser
   * rechazado, no pasaba nada y no se explicaba por qué. Ahora cada error
   * sale como aviso y se limpia, para que no se repita en el siguiente
   * renderizado.
   */
  const { error, clearError } = value;

  useEffect(() => {
    if (!error) return;

    showToast(error, 'error');
    clearError();
  }, [error, clearError]);

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournamentContext(): TournamentContextValue {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error('useTournamentContext debe usarse dentro de TournamentProvider');
  return ctx;
}

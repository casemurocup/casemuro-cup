import { createContext, useContext, type ReactNode } from 'react';
import { useTournament } from '@/hooks/useTournament';

type TournamentContextValue = ReturnType<typeof useTournament>;

const TournamentContext = createContext<TournamentContextValue | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const value = useTournament();
  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournamentContext(): TournamentContextValue {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error('useTournamentContext debe usarse dentro de TournamentProvider');
  return ctx;
}

import { useEffect, useState } from 'react';

import {
  TournamentProvider,
  useTournamentContext,
} from '@/context/TournamentContext';

import {
  PresentationProvider,
  usePresentation,
} from '@/context/PresentationContext';

import {
  CaptainAuthProvider,
  useCaptainAuth,
} from '@/context/CaptainAuthContext';

import { ChatNotificationProvider } from '@/context/ChatNotificationContext';

import { NavBar } from '@/components/Layout/NavBar';
import { HomePage } from '@/components/Home/HomePage';
import { AdminPanel } from '@/components/Admin/AdminPanel';
import { Bracket } from '@/components/Bracket/Bracket';
import { TeamRoulette } from '@/components/Bracket/TeamRoulette';
import { RulesPage } from '@/components/Rules/RulesPage';
import { IncidentsPage } from '@/components/Incidents/IncidentsPage';

import { CaptainAuthPage } from '@/components/Captain/CaptainAuthPage';
import { CaptainPanel } from '@/components/Captain/CaptainPanel';

import { Toast } from '@/components/UI/Toast';

import {
  PasswordGate,
  getAccessRole,
  isAdminSession,
  grantAccess,
  revokeAccess,
} from '@/components/Auth/PasswordGate';

import { supabase } from '@/lib/supabase';

import type { AccessRole } from '@/components/Auth/PasswordGate';

import { Radio, Dices } from 'lucide-react';

import type { View } from '@/types/tournament';

function DrawPage({
  onNavigate,
  isAdmin,
}: {
  onNavigate: (view: View) => void;
  isAdmin: boolean;
}) {
  const {
    tournament,
    teams,
    loading,
    generateBracketWithDraw,
  } = useTournamentContext();

  if (loading || !tournament) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-slate-500">
          Cargando sorteo...
        </p>
      </div>
    );
  }

  /*
   * Si el cuadro ya existe, no permitimos volver a
   * iniciar el sorteo.
   */
  if (
    tournament.status === 'bracket' ||
    tournament.status === 'completed'
  ) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center">
        <Dices className="mb-4 h-12 w-12 text-accent-400" />

        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          Sorteo completado
        </h1>

        <p className="mt-2 max-w-md text-sm text-slate-400">
          El cuadro ya ha sido generado. Los
          enfrentamientos del sorteo están disponibles
          en el cuadro de eliminatoria.
        </p>

        <button
          onClick={() => onNavigate('bracket')}
          className="mt-6 rounded-xl bg-accent-500 px-6 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-accent-500/20 transition hover:bg-accent-400"
        >
          Ver Cuadro
        </button>
      </div>
    );
  }

  /*
   * Los usuarios que no sean administradores pueden
   * consultar la pestaña, pero no ejecutar el sorteo.
   */
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center">
        <Dices className="mb-4 h-12 w-12 text-accent-400" />

        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          Sorteo del Cuadro
        </h1>

        <p className="mt-2 max-w-md text-sm text-slate-400">
          El sorteo será realizado por la administración.
        </p>
      </div>
    );
  }

  const canDraw =
    teams.length === tournament.team_count;

  if (!canDraw) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center">
        <Dices className="mb-4 h-12 w-12 text-accent-400" />

        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">
          Sorteo del Cuadro
        </h1>

        <p className="mt-2 max-w-md text-sm text-slate-400">
          Debes tener todos los equipos registrados
          antes de comenzar el sorteo.
        </p>

        <p className="mt-4 text-sm font-bold text-accent-400">
          {teams.length} / {tournament.team_count}{' '}
          equipos
        </p>

        <button
          onClick={() => onNavigate('admin')}
          className="mt-6 rounded-xl border border-accent-500/30 bg-accent-500/10 px-6 py-3 text-sm font-bold uppercase tracking-wide text-accent-400 transition hover:bg-accent-500/20"
        >
          Ir a Administración
        </button>
      </div>
    );
  }

  return (
    <TeamRoulette
      teams={teams}
      onComplete={async (drawOrder) => {
        const success =
          await generateBracketWithDraw(drawOrder);

        if (success) {
          onNavigate('bracket');
        }
      }}
      onCancel={() => onNavigate('home')}
    />
  );
}

function AppContent() {
  const [view, setView] =
    useState<View>('home');

  const [role, setRole] =
    useState<AccessRole | null>(
      getAccessRole()
    );

  const { presentation, live } =
    usePresentation();

  /*
   * La marca de sessionStorage solo dice qué pinta React. Si la sesión de
   * Supabase ya no es de administrador (caducó, se cerró en otra pestaña),
   * bajamos el rol a usuario para no mostrar controles que la base de datos
   * va a rechazar de todas formas.
   */
  useEffect(() => {
    if (role !== 'admin') return;

    let active = true;

    isAdminSession().then((ok) => {
      if (!active || ok) return;
      grantAccess('user');
      setRole('user');
    });

    return () => {
      active = false;
    };
  }, [role]);

  const handleNavigate = (v: View) => {
    setView(v);
  };

  if (!role) {
    return (
      <PasswordGate
        onSuccess={(r) => setRole(r)}
      />
    );
  }

  const isAdmin = role === 'admin';

  /*
   * IMPORTANTE:
   *
   * Todas las vistas permanecen dentro del mismo árbol
   * de React.
   *
   * Especialmente DrawPage:
   * nunca se desmonta al cambiar de pestaña.
   *
   * Esto permite conservar:
   * - posición de la ruleta
   * - equipos restantes
   * - enfrentamientos sorteados
   * - página actual del historial del sorteo
   *
   * incluso al entrar en Capitán.
   */

  const isCaptainView =
    view === 'captain' ||
    view === 'register-captain';

  return (
    <div className="min-h-screen bg-ink-100 text-cream-100">
      {!presentation && (
        <NavBar
          current={view}
          onNavigate={handleNavigate}
          isAdmin={isAdmin}
          onLogout={async () => {
            /*
             * Antes solo se limpiaba el estado de React: la marca de
             * sessionStorage seguía ahí y al recargar volvías a entrar como
             * administrador. Ahora se cierra también la sesión de Supabase.
             */
            if (isAdmin) {
              await supabase.auth.signOut();
            }

            revokeAccess();
            setRole(null);
            setView('home');
          }}
        />
      )}

      {/* LIVE badge */}
      {live && (
        <div className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />

          <span className="font-display text-xs font-bold uppercase tracking-widest text-red-400">
            En Directo
          </span>
        </div>
      )}

      <main
        className={
          isCaptainView
            ? 'mx-auto px-0'
            : `mx-auto px-4 py-6 sm:px-6 sm:py-8 ${
                presentation
                  ? 'max-w-screen-2xl'
                  : 'max-w-7xl'
              } ${presentation ? 'pt-4' : ''}`
        }
      >
        {/* HOME */}
        {view === 'home' && (
          <div className="page-enter">
            <HomePage
              onNavigate={handleNavigate}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* ADMIN */}
        {view === 'admin' &&
          isAdmin &&
          !presentation && (
            <div className="page-enter">
              <AdminPanel />
            </div>
          )}

        {view === 'admin' &&
          (!isAdmin || presentation) && (
            <div className="page-enter px-4 py-6 sm:px-6 sm:py-8">
              <PresentationNotice
                onNavigate={handleNavigate}
              />
            </div>
          )}

        {/*
         * SORTEO
         *
         * NO se desmonta cuando cambiamos a otra vista.
         *
         * Solo se oculta con CSS.
         */}
        <div
          className={
            view === 'draw'
              ? 'page-enter'
              : 'hidden'
          }
        >
          <DrawPage
            onNavigate={handleNavigate}
            isAdmin={isAdmin}
          />
        </div>

        {/* CUADRO */}
        {view === 'bracket' && (
          <div className="page-enter">
            <Bracket
              onNavigate={handleNavigate}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* INCIDENCIAS */}
        {view === 'incidents' && (
          <div className="page-enter">
            <IncidentsPage
              onNavigate={handleNavigate}
            />
          </div>
        )}

        {/* NORMAS */}
        {view === 'rules' && (
          <div className="page-enter">
            <RulesPage />
          </div>
        )}

        {/*
         * CAPITÁN
         *
         * Ahora está dentro del mismo árbol que el sorteo.
         * Entrar aquí NO desmonta TeamRoulette.
         */}
        {isCaptainView && (
          <CaptainFlow
            onNavigate={handleNavigate}
          />
        )}
      </main>

      <Toast />
    </div>
  );
}

function CaptainFlow({
  onNavigate,
}: {
  onNavigate: (v: View) => void;
}) {
  const {
    captain,
    loading,
  } = useCaptainAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-100">
        <p className="text-sm text-slate-500">
          Cargando...
        </p>
      </div>
    );
  }

  /*
   * No hay sesión de capitán.
   */
  if (!captain) {
    return (
      <CaptainAuthPage
        onBack={() =>
          onNavigate('home')
        }
      />
    );
  }

  /*
   * Capitán autenticado.
   *
   * La NavBar principal ya se renderiza en AppContent,
   * por lo que aquí NO debemos crear otra.
   */
  return (
    <div className="min-h-screen bg-ink-100 text-cream-100">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="page-enter">
          <CaptainPanel
            onSignOut={() =>
              onNavigate('home')
            }
          />
        </div>
      </main>
    </div>
  );
}

function PresentationNotice({
  onNavigate,
}: {
  onNavigate: (v: View) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 py-20 text-center">
      <Radio className="h-10 w-10 text-accent-400" />

      <p className="text-lg font-medium text-slate-200">
        Modo Presentación activado
      </p>

      <p className="max-w-md text-sm text-slate-400">
        La administración está oculta durante el
        modo presentación. Desactiva el modo
        presentación para gestionar los equipos.
      </p>

      <button
        onClick={() =>
          onNavigate('bracket')
        }
        className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-950 transition hover:bg-accent-400"
      >
        Ver Cuadro
      </button>
    </div>
  );
}

function App() {
  return (
    <PresentationProvider>
      <TournamentProvider>
        <CaptainAuthProvider>
          <ChatNotificationProvider>
            <AppContent />
          </ChatNotificationProvider>
        </CaptainAuthProvider>
      </TournamentProvider>
    </PresentationProvider>
  );
}

export default App;
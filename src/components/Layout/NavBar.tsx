import {
  Trophy,
  Settings,
  LayoutGrid,
  Dices,
  Maximize2,
  ScrollText,
  LogOut,
  UserCog,
  AlertTriangle,
} from 'lucide-react';

import { usePresentation } from '@/context/PresentationContext';
import { useChatNotifications } from '@/context/ChatNotificationContext';
import { revokeAccess } from '@/components/Auth/PasswordGate';

import type { View } from '@/types/tournament';

interface NavBarProps {
  current: View;
  onNavigate: (view: View) => void;
  isAdmin: boolean;
  onLogout: () => void;
}

export function NavBar({
  current,
  onNavigate,
  isAdmin,
  onLogout,
}: NavBarProps) {
  const {
    fullscreen,
    live,
    toggleFullscreen,
  } = usePresentation();

  const { unreadCount } = useChatNotifications();

  const navItems: {
    view: View;
    label: string;
    icon: typeof Trophy;
  }[] = [
    {
      view: 'home',
      label: 'Inicio',
      icon: Trophy,
    },

    ...(isAdmin
      ? [
          {
            view: 'admin' as View,
            label: 'Administración',
            icon: Settings,
          },
        ]
      : []),

    // El sorteo lo ejecuta solo la organizacion: a un visitante le salia
    // una pestana que unicamente le decia que ya lo haria la administracion.
    ...(isAdmin
      ? [
          {
            view: 'draw' as View,
            label: 'Sorteo',
            icon: Dices,
          },
        ]
      : []),

    {
      view: 'competitions',
      label: 'Competiciones',
      icon: LayoutGrid,
    },

    {
      view: 'rules',
      label: 'Normas',
      icon: ScrollText,
    },

    {
      view: 'incidents',
      label: 'Incidencias',
      icon: AlertTriangle,
    },

    {
      view: 'captain',
      label: 'Capitán',
      icon: UserCog,
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-accent-500/15 bg-ink-200/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* LOGO */}
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-slate-100 transition hover:scale-[1.02]"
        >
          <div className="relative flex h-11 w-20 items-center justify-center overflow-hidden rounded-lg bg-black/40 ring-1 ring-accent-500/40">
            <img
              src="/image.png"
              alt="Casemuro Cup"
              className="h-full w-full object-contain"
            />

            <div className="absolute inset-0 rounded-lg bg-accent-500/10 blur-md" />
          </div>

          <div className="flex flex-col leading-none">
            <span className="font-display text-xl font-bold tracking-[0.12em] text-white">
              CASEMURO
            </span>

            <span className="font-display text-[10px] font-bold uppercase tracking-[0.35em] text-accent-400">
              Cup
            </span>

            {live && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                En Directo
              </span>
            )}
          </div>
        </button>

        {/* NAVIGATION */}
        <nav className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 backdrop-blur-md">
          {navItems.map(
            ({ view, label, icon: Icon }) => {
              const active = current === view;

              const showBadge =
                view === 'captain' &&
                unreadCount > 0;

              return (
                <button
                  key={view}
                  onClick={() => onNavigate(view)}
                  className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 sm:px-3.5 ${
                    active
                      ? 'bg-gradient-to-r from-accent-500 to-accent-400 text-slate-950 shadow-lg shadow-accent-500/30'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />

                  <span className="hidden sm:inline">
                    {label}
                  </span>

                  {showBadge && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/40 ring-2 ring-ink-200">
                      {unreadCount > 9
                        ? '9+'
                        : unreadCount}
                    </span>
                  )}
                </button>
              );
            },
          )}
        </nav>

        {/* ACTIONS */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFullscreen}
            title="Pantalla Completa"
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
              fullscreen
                ? 'border-accent-500/50 bg-accent-500/15 text-accent-400 shadow-lg shadow-accent-500/20'
                : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
            }`}
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              revokeAccess();
              onLogout();
            }}
            title="Salir"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-500 transition hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
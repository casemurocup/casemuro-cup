import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import type { Captain } from '@/types/tournament';

interface CaptainAuthState {
  captain: Captain | null;
  loading: boolean;
  signUp: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshCaptain: () => Promise<void>;
}

const CaptainAuthContext =
  createContext<CaptainAuthState | null>(null);

export function CaptainAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [captain, setCaptain] =
    useState<Captain | null>(null);

  const [loading, setLoading] =
    useState(true);

  /**
   * Carga los datos del capitán correspondiente
   * a la sesión actual.
   *
   * Esta función está protegida para que cualquier
   * error de Supabase no rompa el árbol de React.
   */
  const loadCaptain = useCallback(async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error(
          '[CaptainAuth] Error obteniendo sesión:',
          sessionError
        );

        setCaptain(null);
        return;
      }

      if (!session?.user) {
        setCaptain(null);
        return;
      }

      const {
        data,
        error: captainError,
      } = await supabase
        .from('captains')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (captainError) {
        console.error(
          '[CaptainAuth] Error cargando capitán:',
          captainError
        );

        setCaptain(null);
        return;
      }

      setCaptain(
        data ? (data as Captain) : null
      );
    } catch (error) {
      console.error(
        '[CaptainAuth] Error inesperado:',
        error
      );

      setCaptain(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Inicialización + escucha de cambios de autenticación.
   */
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!mounted) return;
      await loadCaptain();
    };

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        /**
         * IMPORTANTE:
         *
         * No hacemos consultas async directamente dentro
         * del callback de onAuthStateChange.
         *
         * Lo dejamos para el siguiente ciclo para evitar
         * bloqueos internos de Supabase Auth.
         */
        if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          setTimeout(() => {
            if (!mounted) return;

            loadCaptain();
          }, 0);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadCaptain]);

  /**
   * Registro de nuevo capitán.
   */
  const signUp = useCallback(
    async (
      name: string,
      email: string,
      password: string
    ) => {
      try {
        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanName) {
          return {
            error: 'Introduce tu nombre.',
          };
        }

        if (!cleanEmail) {
          return {
            error: 'Introduce tu email.',
          };
        }

        if (password.length < 6) {
          return {
            error:
              'La contraseña debe tener al menos 6 caracteres.',
          };
        }

        const {
          data,
          error: authError,
        } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            /*
             * El nombre viaja en los metadatos de la cuenta para que el
             * trigger `handle_new_auth_user` pueda crear la ficha de capitán
             * en el mismo momento del alta. Así el registro funciona también
             * cuando Supabase exige confirmar el email (en ese caso todavía
             * no hay sesión y el navegador no puede escribir en `captains`).
             */
            data: { name: cleanName },
          },
        });

        if (authError) {
          return {
            error: authError.message,
          };
        }

        if (!data.user) {
          return {
            error:
              'No se pudo crear la cuenta.',
          };
        }

        /*
         * Red de seguridad: si el trigger de la base de datos no ha podido
         * crear la ficha y ya tenemos sesión, la creamos desde aquí.
         */
        if (!data.session) {
          return { error: null };
        }

        const { data: existing } = await supabase
          .from('captains')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (existing) {
          return { error: null };
        }

        const {
          error: insertError,
        } = await supabase
          .from('captains')
          .insert({
            id: data.user.id,
            name: cleanName,
            email: cleanEmail,
            status: 'pending',
          });

        if (insertError) {
          console.error(
            '[CaptainAuth] Error creando capitán:',
            insertError
          );

          /**
           * Si la cuenta Auth se creó correctamente pero
           * falló la fila de captains, mostramos el error
           * real en lugar de dejar la aplicación en un
           * estado inconsistente.
           */
          return {
            error: insertError.message,
          };
        }

        return {
          error: null,
        };
      } catch (error) {
        console.error(
          '[CaptainAuth] Error en registro:',
          error
        );

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Error inesperado durante el registro.',
        };
      }
    },
    []
  );

  /**
   * Inicio de sesión.
   */
  const signIn = useCallback(
    async (
      email: string,
      password: string
    ) => {
      try {
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanEmail) {
          return {
            error: 'Introduce tu email.',
          };
        }

        if (!password) {
          return {
            error: 'Introduce tu contraseña.',
          };
        }

        const {
          error,
        } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          return {
            error: error.message,
          };
        }

        /**
         * onAuthStateChange se encargará de cargar
         * automáticamente los datos del capitán.
         */
        return {
          error: null,
        };
      } catch (error) {
        console.error(
          '[CaptainAuth] Error en login:',
          error
        );

        return {
          error:
            error instanceof Error
              ? error.message
              : 'Error inesperado durante el inicio de sesión.',
        };
      }
    },
    []
  );

  /**
   * Cerrar sesión.
   */
  const signOut = useCallback(async () => {
    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        console.error(
          '[CaptainAuth] Error cerrando sesión:',
          error
        );
      }
    } catch (error) {
      console.error(
        '[CaptainAuth] Error inesperado al cerrar sesión:',
        error
      );
    } finally {
      setCaptain(null);
      setLoading(false);
    }
  }, []);

  /**
   * Recarga manual del capitán.
   */
  const refreshCaptain = useCallback(async () => {
    setLoading(true);
    await loadCaptain();
  }, [loadCaptain]);

  return (
    <CaptainAuthContext.Provider
      value={{
        captain,
        loading,
        signUp,
        signIn,
        signOut,
        refreshCaptain,
      }}
    >
      {children}
    </CaptainAuthContext.Provider>
  );
}

export function useCaptainAuth(): CaptainAuthState {
  const context =
    useContext(CaptainAuthContext);

  if (!context) {
    throw new Error(
      'useCaptainAuth debe usarse dentro de CaptainAuthProvider'
    );
  }

  return context;
}
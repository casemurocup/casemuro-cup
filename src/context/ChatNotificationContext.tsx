import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useCaptainAuth } from '@/context/CaptainAuthContext';
import { useTournamentContext } from '@/context/TournamentContext';
import { showToast } from '@/components/UI/Toast';
import type { MatchMessage } from '@/types/tournament';

interface ChatNotificationState {
  unreadCount: number;
  unreadByMatch: Record<string, number>;
  markMatchAsRead: (matchId: string) => Promise<void>;
  lastUnreadMessage: { matchId: string; captainName: string; content: string } | null;
  clearLastUnread: () => void;
}

const ChatNotificationContext = createContext<ChatNotificationState | null>(null);

export function ChatNotificationProvider({ children }: { children: ReactNode }) {
  const { captain } = useCaptainAuth();
  const { matches } = useTournamentContext();
  const [unreadByMatch, setUnreadByMatch] = useState<Record<string, number>>({});
  const [lastUnreadMessage, setLastUnreadMessage] = useState<{ matchId: string; captainName: string; content: string } | null>(null);

  const myMatchIds = matches
    .filter((m) => m.team1_id === captain?.team_id || m.team2_id === captain?.team_id)
    .map((m) => m.id);

  const loadUnread = useCallback(async () => {
    if (!captain || myMatchIds.length === 0) {
      setUnreadByMatch({});
      return;
    }
    const { data } = await supabase
      .from('match_messages')
      .select('match_id')
      .in('match_id', myMatchIds)
      .neq('captain_id', captain.id)
      .eq('is_read', false);

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.match_id] = (counts[row.match_id] ?? 0) + 1;
    }
    setUnreadByMatch(counts);
  }, [captain, myMatchIds.join(',')]);

  useEffect(() => {
    loadUnread();

    if (!captain || myMatchIds.length === 0) return;

    const channel = supabase
      .channel('chat-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_messages' },
        (payload) => {
          const msg = payload.new as MatchMessage;
          if (msg.captain_id === captain.id) return;
          if (!myMatchIds.includes(msg.match_id)) return;

          setUnreadByMatch((prev) => ({
            ...prev,
            [msg.match_id]: (prev[msg.match_id] ?? 0) + 1,
          }));
          setLastUnreadMessage({
            matchId: msg.match_id,
            captainName: msg.captain_name,
            content: msg.content,
          });
          showToast(`Nuevo mensaje de ${msg.captain_name || 'capitán rival'}`, 'success');
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_messages' },
        () => loadUnread(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [captain?.id, myMatchIds.join(','), loadUnread]);

  const markMatchAsRead = useCallback(async (matchId: string) => {
    if (!captain) return;
    setUnreadByMatch((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
    await supabase
      .from('match_messages')
      .update({ is_read: true })
      .eq('match_id', matchId)
      .neq('captain_id', captain.id)
      .eq('is_read', false);
  }, [captain]);

  const clearLastUnread = useCallback(() => setLastUnreadMessage(null), []);

  const unreadCount = Object.values(unreadByMatch).reduce((a, b) => a + b, 0);

  return (
    <ChatNotificationContext.Provider value={{ unreadCount, unreadByMatch, markMatchAsRead, lastUnreadMessage, clearLastUnread }}>
      {children}
    </ChatNotificationContext.Provider>
  );
}

export function useChatNotifications(): ChatNotificationState {
  const ctx = useContext(ChatNotificationContext);
  if (!ctx) throw new Error('useChatNotifications debe usarse dentro de ChatNotificationProvider');
  return ctx;
}

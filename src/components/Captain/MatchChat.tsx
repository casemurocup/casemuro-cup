import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MatchMessage } from '@/types/tournament';

interface MatchChatProps {
  matchId: string;
  captainId: string;
  captainName: string;
  teamId: string;
  onOpen?: () => void;
}

export function MatchChat({ matchId, captainId, captainName, teamId, onOpen }: MatchChatProps) {
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState<{ name: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (onOpen) onOpen();
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('match_messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });
      setMessages((data ?? []) as MatchMessage[]);
      setLoading(false);
    };
    load();

    const msgChannel = supabase
      .channel(`match-chat-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const newMsg = payload.new as MatchMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg],
          );
          if (newMsg.captain_id !== captainId) {
            setOtherTyping(null);
          }
        },
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`match-typing-${matchId}`)
      .on('broadcast', { event: 'typing' }, (payload: { payload: { captainId: string; captainName: string } }) => {
        if (payload.payload.captainId !== captainId) {
          setOtherTyping({ name: payload.payload.captainName });
          if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
          otherTypingTimeoutRef.current = setTimeout(() => setOtherTyping(null), 3000);
        }
      })
      .on('broadcast', { event: 'stop_typing' }, (payload: { payload: { captainId: string } }) => {
        if (payload.payload.captainId !== captainId) {
          setOtherTyping(null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
    };
  }, [matchId, captainId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, otherTyping]);

  const broadcastTyping = () => {
    const channel = supabase.channel(`match-typing-${matchId}`);
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { captainId, captainName },
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channel.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { captainId, captainName },
      });
    }, 1500);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    const channel = supabase.channel(`match-typing-${matchId}`);
    channel.send({
      type: 'broadcast',
      event: 'stop_typing',
      payload: { captainId, captainName },
    });
    const { data } = await supabase
      .from('match_messages')
      .insert({
        match_id: matchId,
        captain_id: captainId,
        captain_name: captainName,
        team_id: teamId,
        content: text,
      })
      .select('*')
      .single();
    if (data) {
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data as MatchMessage],
      );
    }
    setSending(false);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60" style={{ height: '500px' }}>
      <div className="border-b border-slate-800 px-5 py-3">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-slate-100">Chat del partido</h3>
        <p className="text-xs text-slate-500">Mensajes entre capitanes en tiempo real</p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-sm text-slate-500">Cargando mensajes...</p>
        ) : messages.length === 0 && !otherTyping ? (
          <p className="text-center text-sm text-slate-500">No hay mensajes todavía. Escribe el primero.</p>
        ) : (
          <>
            {messages.map((msg) => {
              const mine = msg.team_id === teamId;
              return (
                <div key={msg.id} className={`flex animate-fade-in flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <span className={`mb-1 px-1 text-[10px] font-bold uppercase tracking-wide ${mine ? 'text-sky-400' : 'text-slate-500'}`}>
                    {msg.captain_name || (mine ? 'Yo' : 'Capitán rival')}
                  </span>
                  <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${mine ? 'bg-sky-500/20 text-slate-100' : 'bg-slate-800 text-slate-300'}`}>
                    <p className="text-sm">{msg.content}</p>
                    <span className="mt-1 block text-[10px] text-slate-500">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              );
            })}
            {otherTyping && (
              <div className="flex animate-fade-in flex-col items-start">
                <span className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {otherTyping.name || 'Capitán rival'}
                </span>
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 border-t border-slate-800 p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            broadcastTyping();
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/30"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:from-sky-500 hover:to-sky-400 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

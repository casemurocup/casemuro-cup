import { type ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  accent?: 'accent' | 'emerald' | 'sky' | 'amber' | 'slate' | 'red';
}

const ACCENTS = {
  accent: 'text-accent-400',
  emerald: 'text-emerald-400',
  sky: 'text-cream-300',
  amber: 'text-amber-400',
  slate: 'text-slate-300',
  red: 'text-red-400',
};

const GLOWS = {
  accent: 'group-hover:border-accent-500/40',
  emerald: 'group-hover:border-emerald-500/40',
  sky: 'group-hover:border-cream-500/40',
  amber: 'group-hover:border-amber-500/40',
  slate: 'group-hover:border-slate-600',
  red: 'group-hover:border-red-500/40',
};

export function StatCard({ label, value, accent = 'slate' }: StatCardProps) {
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${GLOWS[accent]}`}>
      <div className={`font-display text-2xl font-bold transition-all duration-300 group-hover:scale-110 sm:text-3xl ${ACCENTS[accent]}`}>{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}

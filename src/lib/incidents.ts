import type { IncidentCategory, IncidentStatus } from '@/types/tournament';

export const INCIDENT_CATEGORIES: {
  value: IncidentCategory;
  label: string;
}[] = [
  { value: 'rival', label: 'Problema con el rival' },
  { value: 'horario', label: 'Fecha u hora' },
  { value: 'tecnico', label: 'Problema técnico' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'otro', label: 'Otro' },
];

export const INCIDENT_CATEGORY_LABEL: Record<IncidentCategory, string> =
  Object.fromEntries(
    INCIDENT_CATEGORIES.map((c) => [c.value, c.label]),
  ) as Record<IncidentCategory, string>;

export const INCIDENT_STATUS_LABEL: Record<
  IncidentStatus,
  { label: string; className: string }
> = {
  open: {
    label: 'Abierta',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  reviewing: {
    label: 'En revisión',
    className: 'border-accent-500/40 bg-accent-500/10 text-accent-400',
  },
  resolved: {
    label: 'Resuelta',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  dismissed: {
    label: 'Descartada',
    className: 'border-slate-600 bg-slate-800/60 text-slate-400',
  },
};

/**
 * Acepta solo enlaces http/https.
 *
 * Evita que alguien guarde un `javascript:` que luego se abriría al pulsar
 * en la evidencia desde el panel de administración.
 */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

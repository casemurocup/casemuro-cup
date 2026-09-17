import { useState, type FormEvent } from 'react';
import { Link2, X } from 'lucide-react';
import { TeamLogo } from '@/components/UI/TeamLogo';
import { showToast } from '@/components/UI/Toast';
import { isSafeUrl } from '@/lib/incidents';
import type { Team } from '@/types/tournament';

interface TeamFormProps {
  team: Team | null;
  onSubmit: (name: string, logoUrl: string | null) => Promise<boolean>;
  onCancel: () => void;
}

export function TeamForm({ team, onSubmit, onCancel }: TeamFormProps) {
  const [name, setName] = useState(team?.name ?? '');
  const [logoUrl, setLogoUrl] = useState(team?.logo_url ?? '');
  const [saving, setSaving] = useState(false);

  const cleanLogoUrl = logoUrl.trim();

  /* Solo se previsualiza cuando el enlace es válido, para no dejar una imagen
     rota mientras se está escribiendo. */
  const previewUrl = cleanLogoUrl && isSafeUrl(cleanLogoUrl) ? cleanLogoUrl : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (cleanLogoUrl && !isSafeUrl(cleanLogoUrl)) {
      showToast('El enlace del escudo debe empezar por http:// o https://', 'error');
      return;
    }

    setSaving(true);
    const ok = await onSubmit(name, cleanLogoUrl || null);
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <TeamLogo logoUrl={previewUrl} name={name || 'Equipo'} size="2xl" glow={!!previewUrl} />
          {previewUrl && <div className="absolute inset-0 rounded-full bg-accent-500/15 blur-xl" />}
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-300">
          <Link2 className="h-4 w-4 text-accent-400" /> Enlace del escudo
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://.../escudo.png"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder-slate-500 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
          {cleanLogoUrl && (
            <button
              type="button"
              onClick={() => setLogoUrl('')}
              title="Quitar escudo"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 transition hover:border-red-500/50 hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Pega la dirección de una imagen alojada en otro sitio. No se sube nada
          a la web, así que no consume espacio.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Nombre del equipo</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Real Madrid"
          autoFocus
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder-slate-500 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="btn-shine rounded-lg bg-gradient-to-r from-accent-500 to-accent-400 px-5 py-2 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-accent-500/20 transition hover:scale-[1.03] active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : team ? 'Guardar Cambios' : 'Añadir Equipo'}
        </button>
      </div>
    </form>
  );
}

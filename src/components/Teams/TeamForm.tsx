import { useRef, useState, type FormEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { TeamLogo } from '@/components/UI/TeamLogo';
import type { Team } from '@/types/tournament';

interface TeamFormProps {
  team: Team | null;
  onSubmit: (name: string, logoUrl: string | null) => Promise<boolean>;
  onUploadLogo: (file: File) => Promise<string | null>;
  onCancel: () => void;
}

export function TeamForm({ team, onSubmit, onUploadLogo, onCancel }: TeamFormProps) {
  const [name, setName] = useState(team?.name ?? '');
  const [logoUrl, setLogoUrl] = useState<string | null>(team?.logo_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await onUploadLogo(file);
    setUploading(false);
    if (url) setLogoUrl(url);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onSubmit(name, logoUrl);
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <TeamLogo logoUrl={logoUrl} name={name || 'Equipo'} size="2xl" glow={!!logoUrl} />
          {logoUrl && <div className="absolute inset-0 rounded-full bg-accent-500/15 blur-xl" />}
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-shine flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Subiendo...' : 'Subir Escudo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={() => setLogoUrl(null)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 transition hover:border-red-500/50 hover:text-red-400"
            >
              <X className="h-4 w-4" /> Quitar
            </button>
          )}
        </div>
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

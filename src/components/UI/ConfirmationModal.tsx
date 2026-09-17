import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmationModalProps) {
  if (!open) return null;

  // Se renderiza directamente en document.body: así el `fixed` de abajo
  // siempre se ancla al viewport, sin importar si algún ancestro (p. ej.
  // la animación de entrada de página) tiene `transform` aplicado, lo
  // cual rompe `position: fixed` y hacía que el modal quedara "a mitad
  // de página" en vez de centrado en la pantalla.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-200/80 backdrop-blur-md" onClick={onCancel} />
      <div className="relative w-full max-w-md animate-scale-in rounded-2xl border border-accent-500/20 bg-gradient-to-br from-ink-100 to-ink-200 p-6 shadow-2xl glow-ring">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-slate-100">{title}</h2>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`btn-shine relative overflow-hidden rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-lg transition hover:scale-[1.03] active:scale-95 ${
              destructive ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-red-600/20' : 'bg-gradient-to-r from-accent-500 to-accent-400 text-slate-950 shadow-accent-500/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">{description}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}
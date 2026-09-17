import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface BroadcastButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';
  size?: 'md' | 'lg' | 'xl';
  icon?: ReactNode;
}

const VARIANTS = {
  primary: 'bg-gradient-to-r from-accent-500 to-accent-400 text-slate-950 shadow-lg shadow-accent-500/30 hover:shadow-accent-400/50',
  secondary: 'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 hover:border-slate-600',
  gold: 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 hover:shadow-amber-400/50',
  danger: 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-600/30 hover:shadow-red-500/50',
  ghost: 'bg-transparent text-slate-300 border border-slate-700 hover:bg-slate-800/50 hover:text-slate-100',
};

const SIZES = {
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
  xl: 'px-8 py-4 text-lg',
};

export function BroadcastButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  onClick,
  disabled,
  ...rest
}: BroadcastButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top = `${e.clientY - rect.top}px`;
      ripple.style.width = '20px';
      ripple.style.height = '20px';
      ripple.style.marginLeft = '-10px';
      ripple.style.marginTop = '-10px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
    onClick?.(e);
  };

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      disabled={disabled}
      className={`btn-shine relative inline-flex items-center justify-center gap-2 rounded-xl font-display font-bold uppercase tracking-wide transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

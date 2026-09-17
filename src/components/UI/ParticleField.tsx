import { useMemo } from 'react';

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

export function ParticleField({ count = 30, className = '' }: ParticleFieldProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 6,
        duration: 5 + Math.random() * 8,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [count],
  );

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: `rgba(var(--accent-rgb), ${p.opacity})`,
            boxShadow: `0 0 ${p.size * 2}px rgba(var(--accent-rgb), ${p.opacity * 0.6})`,
            animation: `float-slow ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

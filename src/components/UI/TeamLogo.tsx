import { ShieldQuestion } from 'lucide-react';

interface TeamLogoProps {
  logoUrl: string | null;
  name: string;

  /*
   * Acepta un token de tamaño predefinido, o un número (píxeles)
   * para casos como el bracket donde el tamaño depende de la ronda.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | number;

  /*
   * Se mantiene la propiedad para no romper los componentes
   * que ya utilizan glow.
   *
   * Ahora el efecto no crea ningún círculo ni aro alrededor
   * del logo.
   */
  glow?: boolean;

  grayscale?: boolean;
}

const SIZE_MAP = {
  xs: 'h-6 w-6',
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
  '2xl': 'h-32 w-32',
  '3xl': 'h-48 w-48',
};

export function TeamLogo({
  logoUrl,
  name,
  size = 'md',
  glow = false,
  grayscale = false,
}: TeamLogoProps) {
  const isPixelSize = typeof size === 'number';

  const dim = isPixelSize
    ? ''
    : SIZE_MAP[size];

  const pixelStyle = isPixelSize
    ? {
        width: `${size}px`,
        height: `${size}px`,
      }
    : undefined;

  const grayClass = grayscale
    ? 'grayscale opacity-40'
    : '';

  /*
   * Ya NO utilizamos:
   *
   * rounded-full
   * ring-2
   * ring-slate-700
   * overflow-hidden
   * glow-ring
   *
   * El logo se muestra directamente como imagen.
   */
  const imageClass = `
    ${dim}
    shrink-0
    object-contain
    transition-all
    duration-300
    ${grayClass}
    ${glow ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]' : ''}
  `.replace(/\s+/g, ' ').trim();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={imageClass}
        style={pixelStyle}
      />
    );
  }

  /*
   * Cuando un equipo no tiene logo tampoco mostramos
   * un círculo de fondo.
   */
  const fallbackClass = `
    ${dim}
    shrink-0
    text-slate-600
    transition-all
    duration-300
    ${grayClass}
  `.replace(/\s+/g, ' ').trim();

  return (
    <ShieldQuestion
      className={fallbackClass}
      style={pixelStyle}
      aria-label={`Sin logo: ${name}`}
    />
  );
}
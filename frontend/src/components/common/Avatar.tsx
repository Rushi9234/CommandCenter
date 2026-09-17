import React from 'react';

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  isGroup?: boolean;
  title?: string;
}

const SIZE_CLASSES = {
  sm: 'w-6 h-6 text-[10px] font-semibold',
  md: 'w-8 h-8 text-xs font-semibold',
  lg: 'w-10 h-10 text-sm font-semibold',
  xl: 'w-12 h-12 text-base font-bold',
};

const COLOR_PALETTES = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
];

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColorClass(name?: string | null): string {
  if (!name) return COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTES.length;
  return COLOR_PALETTES[index];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  className = '',
  isGroup = false,
  title,
}) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const displayTitle = title || name || (isGroup ? 'Team' : 'User');

  if (isGroup) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0 ${sizeClass} ${className}`}
        title={displayTitle}
        aria-label={displayTitle}
      >
        <svg className="w-1/2 h-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
    );
  }

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={displayTitle}
        title={displayTitle}
        onError={() => setHasError(true)}
        className={`inline-block rounded-full object-cover border border-gray-200 shrink-0 ${sizeClass} ${className}`}
      />
    );
  }

  const colorClass = getColorClass(name);
  const initials = getInitials(name);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border shrink-0 ${colorClass} ${sizeClass} ${className}`}
      title={displayTitle}
      aria-label={displayTitle}
    >
      <span>{initials}</span>
    </div>
  );
};

export default Avatar;

'use client';

const SIZES = {
  xs: { box: 'w-4 h-4', text: 'text-[9px]' }, // TeamCard OwnerTag
  sm: { box: 'w-5 h-5', text: 'text-[10px]' }, // MatchList
  md: { box: 'w-6 h-6', text: 'text-xs' }, // Dashboard selector, TeamCard owner
  lg: { box: 'w-8 h-8', text: 'text-sm font-bold' }, // Leaderboard
} as const;

// Vivid, non-green palette so initials avatars pop against the dark-green
// background while keeping the white initial readable. A colour is picked
// deterministically from the name, so a person keeps the same colour everywhere
// (and across renders) rather than flickering on each paint.
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-600',
  'bg-purple-600',
  'bg-fuchsia-600',
  'bg-pink-600',
  'bg-rose-500',
  'bg-red-500',
  'bg-orange-600',
  'bg-sky-600',
] as const;

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function Avatar({ name, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const { box, text } = SIZES[size];
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${box} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <span
      aria-label={name}
      className={`${box} rounded-full ${colorForName(name)} text-white flex items-center justify-center shrink-0 ${text} ${className}`}
    >
      {name[0]}
    </span>
  );
}

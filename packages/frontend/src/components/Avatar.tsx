'use client';

const SIZES = {
  xs: { box: 'w-4 h-4', text: 'text-[9px]' }, // TeamCard OwnerTag
  sm: { box: 'w-5 h-5', text: 'text-[10px]' }, // MatchList
  md: { box: 'w-6 h-6', text: 'text-xs' }, // Dashboard selector, TeamCard owner
  lg: { box: 'w-8 h-8', text: 'text-sm font-bold' }, // Leaderboard
} as const;

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
      className={`${box} rounded-full bg-accent/30 flex items-center justify-center shrink-0 ${text} ${className}`}
    >
      {name[0]}
    </span>
  );
}

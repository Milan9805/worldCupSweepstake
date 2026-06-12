'use client';

import Avatar from '@/components/Avatar';

// Shows which group member owns a team (avatar + name). Renders nothing when the
// team belongs to no one. Shared by the team cards and the dashboard match banner.
export default function OwnerTag({
  owner,
}: {
  owner: { name: string; imageUrl: string | null } | null;
}) {
  if (!owner) return null;
  return (
    <span className="flex items-center gap-1 text-white/70 shrink-0">
      <Avatar name={owner.name} imageUrl={owner.imageUrl} size="xs" />
      {owner.name}
    </span>
  );
}

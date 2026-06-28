'use client';

import { Match } from '@sweepstake/shared';

// Fallbacks for when the source omits a channel's colours.
const DEFAULT_CHANNEL_BG = '#374151';
const DEFAULT_CHANNEL_FG = '#ffffff';

// Broadcasters we never surface — Scotland-only feeds that aren't relevant to
// this group. Matched case-insensitively on the channel name. Filtered here so
// every "where to watch" surface (fixtures list, tree, banner, team cards) hides
// them consistently.
const HIDDEN_CHANNELS = new Set(['stv', 'stv player']);

// Coloured "where to watch" pills for a fixture's broadcasters. Renders nothing
// when there are no (visible) channels. Shared by the fixtures list, the
// knockout tree, the team cards and the dashboard banner.
export default function ChannelPills({ channels }: { channels: Match['channels'] }) {
  const visible = (channels ?? []).filter(
    (channel) => !HIDDEN_CHANNELS.has(channel.name.trim().toLowerCase()),
  );
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {visible.map((channel) => (
        <span
          key={channel.name}
          style={{
            backgroundColor: channel.bg || DEFAULT_CHANNEL_BG,
            color: channel.fg || DEFAULT_CHANNEL_FG,
          }}
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm"
        >
          {channel.name}
        </span>
      ))}
    </div>
  );
}

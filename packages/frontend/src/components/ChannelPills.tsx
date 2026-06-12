'use client';

import { Match } from '@sweepstake/shared';

// Fallbacks for when the source omits a channel's colours.
const DEFAULT_CHANNEL_BG = '#374151';
const DEFAULT_CHANNEL_FG = '#ffffff';

// Coloured "where to watch" pills for a fixture's broadcasters. Renders nothing
// when there are no channels. Shared by the team cards and the dashboard banner.
export default function ChannelPills({ channels }: { channels: Match['channels'] }) {
  if (!channels || channels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {channels.map((channel) => (
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

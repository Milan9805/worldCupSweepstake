'use client';

import Link from 'next/link';
import { Match } from '@sweepstake/shared';
import { formatStage, stageHref } from '@/lib/format';

// Two usage modes:
// 1. Pass a match — href and label are derived automatically.
// 2. Pass an explicit href + children — for non-match contexts (e.g. the team
//    card header which has a group letter but not a full Match object).
interface WithMatch {
  match: Match;
  href?: never;
  children?: never;
}

interface WithExplicit {
  match?: never;
  href: string;
  children: React.ReactNode;
}

type Props = (WithMatch | WithExplicit) & {
  // Caller provides color and size classes; this component always adds the
  // underline so every stage link looks consistent across the app.
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export default function StageLink(props: Props) {
  const href = props.match ? stageHref(props.match) : props.href;
  const label = props.match ? formatStage(props.match) : props.children;

  return (
    <Link
      href={href}
      onClick={props.onClick}
      className={`underline underline-offset-1 transition-colors ${props.className ?? ''}`}
    >
      {label}
    </Link>
  );
}

import { useActiveSupporter } from './SupporterBadge';
import { team } from '../data/catalog';
import type { SupporterBadgeData } from '../lib/supporter';
import { useState, type CSSProperties } from 'react';

export function Avatar({ url, name, size = 34, style, supporter }: { url?: string | null; name: string; size?: number; style?: CSSProperties; supporter?: SupporterBadgeData | null }) {
  const active = useActiveSupporter(supporter);
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="avatar" style={{ width: size, height: size, flexShrink: 0, overflow: 'hidden', ...(active ? {outline:`2px solid ${team(supporter!.teamId).color}`,outlineOffset:2} : {}), ...style }}>
    {url && failed !== url
      ? <img src={url} alt="" onError={() => setFailed(url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : name.slice(0, 1)}
  </span>;
}

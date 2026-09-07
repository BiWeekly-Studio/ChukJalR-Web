import { useState, type CSSProperties } from 'react';

export function Avatar({ url, name, size = 34, style }: { url?: string | null; name: string; size?: number; style?: CSSProperties }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="avatar" style={{ width: size, height: size, flexShrink: 0, overflow: 'hidden', ...style }}>
    {url && failed !== url
      ? <img src={url} alt="" onError={() => setFailed(url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : name.slice(0, 1)}
  </span>;
}

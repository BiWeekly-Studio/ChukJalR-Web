interface P { size?: number; color?: string; strokeWidth?: number }

const base = (size: number, color: string, w: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const IconPredict = ({ size = 21, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <path d="M4 6h11" /><path d="M4 12h16" /><path d="M4 18h8" /><circle cx="19" cy="6" r="2.2" />
  </svg>
);
export const IconChat = ({ size = 21, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L4 20.5l1.5-4.4A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);
export const IconRank = ({ size = 21, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <path d="M4 20V13" /><path d="M12 20V5" /><path d="M20 20v-9" />
  </svg>
);
export const IconMe = ({ size = 21, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);
export const IconShield = ({ size = 16, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <path d="M12 3l7.5 3v6.2c0 4.3-3 7.6-7.5 8.8-4.5-1.2-7.5-4.5-7.5-8.8V6z" />
  </svg>
);
export const IconFlame = ({ size = 13, color = 'currentColor', strokeWidth = 1.9 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <path d="M12 22c4-1.2 6.5-4.4 6.5-8 0-4.5-4-6.5-4-10.5-2.5 1.5-3.5 3.5-3.5 5.5-1.5-.8-2-2-2-3.5C6.8 7.6 5.5 10 5.5 14c0 3.6 2.5 6.8 6.5 8z" />
  </svg>
);
export const IconCheck = ({ size = 13, color = '#fff', strokeWidth = 3.2 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M20 6.5L9.5 17 4 11.5" /></svg>
);
export const IconX = ({ size = 13, color = 'currentColor', strokeWidth = 3 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
);
export const IconBack = ({ size = 22, color = 'currentColor', strokeWidth = 2.1 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconSend = ({ size = 20, color = '#fff', strokeWidth = 2.3 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
);
export const IconCrown = ({ size = 22, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M3 6.5l4.8 4.2L12 4l4.2 6.7L21 6.5 19 18.5H5z" /></svg>
);
export const IconUp = ({ size = 10, color = 'currentColor', strokeWidth = 3.4 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
);
export const IconDown = ({ size = 10, color = 'currentColor', strokeWidth = 3.4 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M12 5v14" /><path d="M5 12l7 7 7-7" /></svg>
);
export const IconBolt = ({ size = 20, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
);
export const IconLock = ({ size = 18, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </svg>
);
export const IconTarget = ({ size = 16, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" />
  </svg>
);
export const IconSparkle = ({ size = 16, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <path d="M12 3l2.1 5.4L19.5 10.5 14.1 12.6 12 18l-2.1-5.4L4.5 10.5l5.4-2.1z" />
  </svg>
);
export const IconUsers = ({ size = 16, color = 'currentColor', strokeWidth = 2 }: P) => (
  <svg {...base(size, color, strokeWidth)}>
    <circle cx="9" cy="8" r="3.4" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.4a3.4 3.4 0 0 1 0 5.2" /><path d="M17.5 14.6A6 6 0 0 1 21 20" />
  </svg>
);

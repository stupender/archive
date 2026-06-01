/**
 * SF Symbols–inspired icon set, rendered inline so they inherit currentColor
 * and stay crisp at any size. Stroke-based for the lighter Apple feel.
 */

import type { CSSProperties } from 'react';

export type IconName =
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'shuffle'
  | 'reverse'
  | 'arrow-forward'
  | 'arrow-back'
  | 'loop'
  | 'volume'
  | 'volume-mute'
  | 'search'
  | 'library'
  | 'playlist'
  | 'tag'
  | 'star'
  | 'star-filled'
  | 'note'
  | 'dice'
  | 'layers'
  | 'plus'
  | 'minus'
  | 'close'
  | 'more'
  | 'finder'
  | 'info'
  | 'history'
  | 'check'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-right'
  | 'grip'
  | 'refresh';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, style, strokeWidth = 1.5 }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
  };

  switch (name) {
    case 'play':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5.5v13a.5.5 0 0 0 .77.42l10-6.5a.5.5 0 0 0 0-.84l-10-6.5A.5.5 0 0 0 8 5.5Z" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
          <rect x="14" y="5" width="3.5" height="14" rx="1" />
        </svg>
      );
    case 'previous':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M6 5.5v13a.5.5 0 0 0 1 0v-5.7l8.77 6.12a.5.5 0 0 0 .73-.42v-13a.5.5 0 0 0-.73-.42L7 11.2V5.5a.5.5 0 0 0-1 0Z" />
        </svg>
      );
    case 'next':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M18 5.5v13a.5.5 0 0 1-1 0v-5.7l-8.77 6.12A.5.5 0 0 1 7.5 18.5v-13a.5.5 0 0 1 .73-.42L17 11.2V5.5a.5.5 0 0 1 1 0Z" />
        </svg>
      );
    case 'shuffle':
      return (
        <svg {...common}>
          <path d="M16 3h5v5" />
          <path d="M21 3l-9 9" />
          <path d="M3 18h3.5a3 3 0 0 0 2.5-1.4l5-7.6a3 3 0 0 1 2.5-1.4H21" />
          <path d="M3 6h3.5a3 3 0 0 1 2.5 1.4l1.5 2.3" />
          <path d="M14 14l1.5 2.3a3 3 0 0 0 2.5 1.4H21" />
          <path d="M16 22h5v-5" />
        </svg>
      );
    case 'reverse':
      // Generic reverse "swap direction" icon — used in places that need a
      // neutral indicator. PlayerBar uses arrow-forward/arrow-back instead so
      // the icon shows what clicking will do.
      return (
        <svg {...common}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case 'arrow-forward':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M5 12h11M13 6l6 6-6 6" stroke="currentColor" strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'arrow-back':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M19 12H8M11 6l-6 6 6 6" stroke="currentColor" strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'loop':
      // Circular loop arrow — distinct from "repeat playlist" rectangular icon.
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <polyline points="21 4 21 9 16 9" />
        </svg>
      );
    case 'volume':
      return (
        <svg {...common}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a4 4 0 0 1 0 7" />
          <path d="M19 5a8 8 0 0 1 0 14" />
        </svg>
      );
    case 'volume-mute':
      return (
        <svg {...common}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'library':
      return (
        <svg {...common}>
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </svg>
      );
    case 'playlist':
      return (
        <svg {...common}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="15" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    case 'tag':
      return (
        <svg {...common}>
          <path d="M20.59 13.41L12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7" cy="7" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <polygon points="12 2 15.09 8.5 22 9.27 17 14 18.18 21 12 17.5 5.82 21 7 14 2 9.27 8.91 8.5 12 2" />
        </svg>
      );
    case 'star-filled':
      return (
        <svg {...common} fill="currentColor">
          <polygon points="12 2 15.09 8.5 22 9.27 17 14 18.18 21 12 17.5 5.82 21 7 14 2 9.27 8.91 8.5 12 2" />
        </svg>
      );
    case 'note':
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="currentColor" />
          <circle cx="18" cy="16" r="3" fill="currentColor" />
        </svg>
      );
    case 'dice':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="16" cy="8" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="8" cy="16" r="1.2" fill="currentColor" />
          <circle cx="16" cy="16" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 12 12 17 22 12" />
          <polyline points="2 17 12 22 22 17" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'minus':
      return (
        <svg {...common}>
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" fill="currentColor" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" />
        </svg>
      );
    case 'finder':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 9v2" />
          <path d="M16 9v2" />
          <path d="M8 16c1.5 1 6.5 1 8 0" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="currentColor" />
        </svg>
      );
    case 'history':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <polyline points="3 3 3 8 8 8" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <polyline points="4 12 10 18 20 6" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );
    case 'chevron-up':
      return (
        <svg {...common}>
          <polyline points="6 15 12 9 18 15" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...common}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      );
    case 'grip':
      return (
        <svg {...common}>
          <circle cx="9" cy="6" r="1.2" fill="currentColor" />
          <circle cx="15" cy="6" r="1.2" fill="currentColor" />
          <circle cx="9" cy="12" r="1.2" fill="currentColor" />
          <circle cx="15" cy="12" r="1.2" fill="currentColor" />
          <circle cx="9" cy="18" r="1.2" fill="currentColor" />
          <circle cx="15" cy="18" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <polyline points="21 4 21 10 15 10" />
          <path d="M21 10A9 9 0 0 0 6 6.5L3 9" />
          <polyline points="3 20 3 14 9 14" />
          <path d="M3 14a9 9 0 0 0 15 3.5L21 15" />
        </svg>
      );
  }
}

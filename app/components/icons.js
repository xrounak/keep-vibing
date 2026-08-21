// Minimal inline line-icon set — no emoji, no icon library dependency.
// All strokes use currentColor so CSS color/filter (glow) still applies.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function IconRoad(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 20 L9 4 M19 20 L15 4" />
      <path d="M11.2 9 L12.8 9 M10.5 13 L13.5 13 M9.7 17 L14.3 17" />
    </svg>
  );
}

export function IconHeadphones(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2.5" y="14" width="5" height="7" rx="2" />
      <rect x="16.5" y="14" width="5" height="7" rx="2" />
    </svg>
  );
}

export function IconLink(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M10.5 6.5 12 5a4 4 0 0 1 5.66 5.66l-1.5 1.5" />
      <path d="M13.5 17.5 12 19a4 4 0 0 1-5.66-5.66l1.5-1.5" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6 18 18 M18 6 6 18" />
    </svg>
  );
}

export function IconPlay(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

export function IconPause(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="6" y="5" width="4.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
    </svg>
  );
}

export function IconSkipBack(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6 5h2v14H6z" />
      <path d="M19 6v12l-9-6z" />
    </svg>
  );
}

export function IconSkipForward(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16 5h2v14h-2z" />
      <path d="M5 6v12l9-6z" />
    </svg>
  );
}

export function IconRepeat(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h13a3 3 0 0 1 3 3v1" />
      <path d="M17 4l3 3-3 3" />
      <path d="M20 17H7a3 3 0 0 1-3-3v-1" />
      <path d="M7 20l-3-3 3-3" />
    </svg>
  );
}

export function IconRepeatOne(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h13a3 3 0 0 1 3 3v1" />
      <path d="M17 4l3 3-3 3" />
      <path d="M20 17H7a3 3 0 0 1-3-3v-1" />
      <path d="M7 20l-3-3 3-3" />
      <path d="M11.3 9.3l1.1-.6v3.3" strokeWidth={1.8} />
    </svg>
  );
}

export function IconShuffle(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 13L3.29592 12.0476C2.62895 8.93509 5.00172 6 8.18494 6H19M19 6L16 9M19 6L16 3M20.5 11L20.7041 11.9524C21.3711 15.0649 18.9983 18 15.8151 18H5M5 18L8 15M5 18L8 21" />
    </svg>
  );
}

export function IconInstagram(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMusicNote(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

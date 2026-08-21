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
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.2929 3.29289C17.6834 2.90237 18.3166 2.90237 18.7071 3.29289L21.7071 6.29289C22.0976 6.68342 22.0976 7.31658 21.7071 7.70711L18.7071 10.7071C18.3166 11.0976 17.6834 11.0976 17.2929 10.7071C16.9024 10.3166 16.9024 9.68342 17.2929 9.29289L18.4858 8.1H17.1339C15.6006 8.1 14.2417 8.85096 13.0268 9.94141C12.6158 10.3103 11.9835 10.2762 11.6146 9.86514C11.2457 9.45413 11.2799 8.82188 11.6909 8.45299C13.0917 7.19573 14.9088 6.1 17.1339 6.1H18.6858L17.2929 4.70711C16.9024 4.31658 16.9024 3.68342 17.2929 3.29289ZM2 7.1C2 6.54772 2.44772 6.1 3 6.1C6.82463 6.1 9.24061 9.04557 11.1944 11.473C11.2677 11.5642 11.3405 11.6548 11.4128 11.7447C12.3547 12.917 13.2086 13.9797 14.1313 14.7835C15.1035 15.6305 16.0541 16.1 17.1291 16.1H18.6858L17.2929 14.7071C16.9024 14.3166 16.9024 13.6834 17.2929 13.2929C17.6834 12.9024 18.3166 12.9024 18.7071 13.2929L21.7071 16.2929C22.0976 16.6834 22.0976 17.3166 21.7071 17.7071L18.7071 20.7071C18.3166 21.0976 17.6834 21.0976 17.2929 20.7071C16.9024 20.3166 16.9024 19.6834 17.2929 19.2929L18.4858 18.1H17.1291C15.3977 18.1 13.9975 17.3195 12.8175 16.2915C11.8362 15.4366 10.94 14.3486 10.0918 13.2941C9.25289 14.3419 8.35876 15.4156 7.37784 16.2661C6.17696 17.3072 4.75087 18.1 3.00536 18.1C2.45308 18.1 2.00536 17.6523 2.00536 17.1C2.00536 16.5477 2.45308 16.1 3.00536 16.1C4.094 16.1 5.07128 15.6188 6.06772 14.7549C7.00179 13.9451 7.86818 12.8757 8.79915 11.7073C7.04692 9.6323 5.35215 8.1 3 8.1C2.44772 8.1 2 7.65229 2 7.1Z"
      />
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

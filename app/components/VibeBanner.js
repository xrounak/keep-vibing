import { IconClose } from './icons';

export default function VibeBanner({ banner, onJoin, onDismiss }) {
  if (!banner) return null;

  return (
    <div className="vibe-banner glass">
      <span>{banner.text}</span>
      {banner.showJoin && (
        <button className="pill-btn" onClick={() => onJoin(banner.code)}>
          Join &amp; Play
        </button>
      )}
      <button className="icon-btn" onClick={onDismiss}>
        <IconClose width={14} height={14} />
      </button>
    </div>
  );
}

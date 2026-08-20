import { IconClose } from './icons';

export default function ShareModal({ shareLink, onClose, onCopy, onLeave }) {
  if (!shareLink) return null;

  return (
    <div className="mood-overlay" onClick={onClose}>
      <div className="share-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="mood-modal-header">
          <h2>Vibe Together</h2>
          <button className="icon-btn" onClick={onClose}>
            <IconClose width={16} height={16} />
          </button>
        </div>

        <span className="experimental-tag">Experimental feature</span>

        <p className="share-desc">
          Anyone who opens this link joins the same room — same track, same timestamp.
          From there it's symmetric: whoever plays, pauses, seeks, skips, or picks a new
          mood, everyone hears it. No host, no permission needed.
        </p>

        <div className="share-link-row">
          <input type="text" value={shareLink} readOnly onFocus={(e) => e.target.select()} />
          <button className="pill-btn" onClick={onCopy}>Copy</button>
        </div>

        <button className="leave-room-btn" onClick={onLeave}>Leave room</button>
      </div>
    </div>
  );
}

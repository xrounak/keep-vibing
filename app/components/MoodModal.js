import { IconClose, IconMusicNote } from './icons';

export default function MoodModal({
  open,
  onClose,
  categories,
  activeCategory,
  onSelectCategory,
  playlistCache,
  nowPlayingId,
  onPlayTrack,
  onRetry,
}) {
  if (!open) return null;

  const tracks = playlistCache[activeCategory];

  return (
    <div className="mood-overlay" onClick={onClose}>
      <div className="mood-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="mood-modal-header">
          <h2>Set the mood</h2>
          <button className="icon-btn" onClick={onClose}>
            <IconClose width={16} height={16} />
          </button>
        </div>

        <div className="mood-categories">
          {categories.map((cat, idx) => (
            <button
              key={cat.label}
              className={`chip ${idx === activeCategory ? 'active' : ''}`}
              onClick={() => onSelectCategory(idx)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="mood-tracks">
          {tracks === 'loading' && <div className="track-menu-empty">Loading tracks…</div>}
          {tracks === 'error' && (
            <div className="track-menu-empty">
              Couldn’t load this playlist.{' '}
              <button className="track-menu-retry" onClick={() => onRetry(activeCategory)}>
                Retry
              </button>
            </div>
          )}
          {Array.isArray(tracks) &&
            tracks.map((t, trackIdx) => {
              const isPlayingTrack = t.videoId === nowPlayingId;
              return (
                <button
                  key={t.videoId + trackIdx}
                  className={`track-menu-item ${isPlayingTrack ? 'playing' : ''}`}
                  onClick={() => onPlayTrack(activeCategory, trackIdx)}
                >
                  <span className="track-menu-num">
                    {isPlayingTrack ? <IconMusicNote width={13} height={13} /> : trackIdx + 1}
                  </span>
                  <img className="track-menu-thumb" src={`https://i.ytimg.com/vi/${t.videoId}/default.jpg`} alt="" loading="lazy" />
                  <span className="track-menu-info">
                    <span className="track-menu-title">{t.title}</span>
                    <span className="track-menu-subtitle">{t.author || 'YouTube'}</span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

import { IconPlay, IconPause, IconSkipBack, IconSkipForward, IconMusicNote } from './icons';
import { fmtTime } from '../vibeStore';

export default function PlayerBar({
  thumb,
  trackTitle,
  trackAuthor,
  isPlaying,
  curTime,
  duration,
  onPrev,
  onPlayPause,
  onNext,
  onSeekChange,
  onSeekCommit,
  onSeekDragStart,
}) {
  const pct = ((curTime / (duration || 100)) * 100).toFixed(2);

  return (
    <footer className="playerbar-wrap">
      <div className="playerbar glass">
        <div className="playerbar-controls-row">
          <div className="thumb">
            {thumb ? <img src={thumb} alt="" /> : <IconMusicNote className="thumb-fallback" width={18} height={18} />}
          </div>
          <div className="track-info">
            <div className="track-title">{trackTitle}</div>
            <div className="track-author">{trackAuthor || 'YouTube'}</div>
          </div>

          <button className="bar-icon-btn" onClick={onPrev} title="Previous">
            <IconSkipBack width={16} height={16} />
          </button>
          <button className="bar-play-btn" onClick={onPlayPause} title="Play/Pause">
            {isPlaying ? <IconPause width={19} height={19} /> : <IconPlay width={19} height={19} />}
          </button>
          <button className="bar-icon-btn" onClick={onNext} title="Next">
            <IconSkipForward width={16} height={16} />
          </button>
        </div>

        <div className="seek-inline">
          <span className="time">{fmtTime(curTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={curTime}
            style={{
              background: `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.18) ${pct}%)`,
            }}
            onMouseDown={onSeekDragStart}
            onTouchStart={onSeekDragStart}
            onChange={onSeekChange}
            onMouseUp={onSeekCommit}
            onTouchEnd={onSeekCommit}
          />
          <span className="time">{fmtTime(duration)}</span>
        </div>
      </div>

      <div className="keyhints">
        <span><kbd>Space</kbd> PLAY / PAUSE</span>
        <span><kbd>←</kbd><kbd>→</kbd> SEEK</span>
        <span><kbd>N</kbd><kbd>P</kbd> TRACK</span>
      </div>
    </footer>
  );
}

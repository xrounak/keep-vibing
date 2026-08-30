import { useEffect, useRef, useState } from 'react';
import { IconPlay, IconPause, IconSkipBack, IconSkipForward, IconMusicNote, IconRepeat, IconRepeatOne, IconShuffle, IconVolume, IconVolumeMute } from './icons';
import { fmtTime } from '../vibeStore';

const LOOP_ICON = { playlist: IconRepeat, shuffle: IconShuffle, song: IconRepeatOne };
const LOOP_TITLE = { playlist: 'Repeat playlist — tap for shuffle', shuffle: 'Shuffle — tap to repeat one', song: 'Repeat one — tap to repeat playlist' };

export default function PlayerBar({
  thumb,
  trackTitle,
  trackAuthor,
  isPlaying,
  curTime,
  duration,
  loopMode,
  volume,
  muted,
  onPrev,
  onPlayPause,
  onNext,
  onCycleLoop,
  onVolumeChange,
  onToggleMute,
  onSeekChange,
  onSeekCommit,
  onSeekDragStart,
}) {
  const pct = ((curTime / (duration || 100)) * 100).toFixed(2);
  const LoopIcon = LOOP_ICON[loopMode] || IconRepeat;
  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? IconVolumeMute : IconVolume;

  // touch devices never fire hover, so the slider is tapped open instead —
  // first tap on the speaker reveals it, taps after that mute/unmute
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeGroupRef = useRef(null);
  const noHoverRef = useRef(false);

  useEffect(() => {
    noHoverRef.current = window.matchMedia('(hover: none)').matches;
  }, []);

  useEffect(() => {
    if (!volumeOpen) return;
    function onPointerDown(e) {
      if (!volumeGroupRef.current?.contains(e.target)) setVolumeOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [volumeOpen]);

  function onVolumeButtonClick() {
    if (noHoverRef.current && !volumeOpen) {
      setVolumeOpen(true);
      return;
    }
    onToggleMute();
  }

  return (
    <footer className="playerbar-wrap">
      <div className="playerbar glass">
        <div className="playerbar-identity-row">
          <div className="thumb">
            {thumb ? <img src={thumb} alt="" /> : <IconMusicNote className="thumb-fallback" width={18} height={18} />}
          </div>
          <div className="track-info">
            <div className="track-title">{trackTitle}</div>
            <div className="track-author">{trackAuthor || 'YouTube'}</div>
          </div>
        </div>

        <div className="playerbar-buttons-row">
          <button className="bar-icon-btn" onClick={onPrev} title="Previous">
            <IconSkipBack width={16} height={16} />
          </button>
          <button className="bar-play-btn" onClick={onPlayPause} title="Play/Pause">
            {isPlaying ? <IconPause width={19} height={19} /> : <IconPlay width={19} height={19} />}
          </button>
          <button className="bar-icon-btn" onClick={onNext} title="Next">
            <IconSkipForward width={16} height={16} />
          </button>
          <button
            className={`bar-icon-btn loop-btn ${loopMode !== 'playlist' ? 'active' : ''}`}
            onClick={onCycleLoop}
            title={LOOP_TITLE[loopMode]}
          >
            <LoopIcon width={16} height={16} />
          </button>

          {/* collapsed to just the speaker icon until hovered, focused, or
              tapped open — see onVolumeButtonClick */}
          <div className={`volume-inline ${volumeOpen ? 'open' : ''}`} ref={volumeGroupRef}>
            <button
              className={`bar-icon-btn ${muted ? 'active' : ''}`}
              onClick={onVolumeButtonClick}
              title={muted ? 'Unmute' : 'Mute'}
            >
              <VolumeIcon width={16} height={16} />
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={effectiveVolume}
              aria-label="Volume"
              title={`Volume ${effectiveVolume}%`}
              style={{
                background: `linear-gradient(to right, var(--accent) ${effectiveVolume}%, rgba(255,255,255,0.18) ${effectiveVolume}%)`,
              }}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
            />
          </div>
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

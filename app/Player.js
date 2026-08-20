'use client';

import { useEffect, useRef, useState } from 'react';
import { joinRoom, sendState, genCode, fmtTime, WRITE_INTERVAL_MS, STALE_MS, DRIFT_THRESHOLD_S } from './vibeStore';

// TODO: replace remaining placeholders with real official-label playlist IDs
const CATEGORIES = [
  { label: '90s', playlist: 'RDCPgD-SQ1fJ8' },
  { label: 'Punjabi', playlist: 'PLACEHOLDER_PUNJABI' },
  { label: 'Haryanvi', playlist: 'PLACEHOLDER_HARYANVI' },
  { label: 'Workout', playlist: 'PLACEHOLDER_WORKOUT' },
];

// each bg paired with an accent pulled to match its own vibe
const SCENES = [
  { image: '/bg/bg1.png', accent: '#e2a63b' },
  { image: '/bg/bg2.png', accent: '#e8c34a' },
  { image: '/bg/bg3.png', accent: '#e98a72' },
  { image: '/bg/bg4.png', accent: '#8a9b5e' },
];

export default function Player() {
  const playerRef = useRef(null);
  const socketRef = useRef(null);
  const modeRef = useRef('idle'); // idle | sharing | listening
  const shareCodeRef = useRef(null);
  const writeTimerRef = useRef(null);
  const lastAppliedVideoIdRef = useRef(null);
  const seekDraggingRef = useRef(false);
  const lastVideoIdRef = useRef(null);
  const sceneIdxRef = useRef(0);

  const [activeCategory, setActiveCategory] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackTitle, setTrackTitle] = useState('Tap play to start');
  const [trackAuthor, setTrackAuthor] = useState('');
  const [thumb, setThumb] = useState(null);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareLink, setShareLink] = useState(null);
  const [vibeBanner, setVibeBanner] = useState(null); // { text, showJoin, code }
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playlistCache, setPlaylistCache] = useState({}); // idx -> 'loading' | [{videoId,title}]
  const [moodOpen, setMoodOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState(0);

  const scene = SCENES[sceneIdx];

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setMoodOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function nextScene() {
    sceneIdxRef.current = (sceneIdxRef.current + 1) % SCENES.length;
    setSceneIdx(sceneIdxRef.current);
  }

  // ---- YT bootstrap ----
  useEffect(() => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      const player = new window.YT.Player('yt-audio', {
        height: '1',
        width: '1',
        playerVars: {
          listType: 'playlist',
          list: CATEGORIES[0].playlist,
          autoplay: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            checkIncomingLink();
          },
          onStateChange: onPlayerStateChange,
        },
      });
      playerRef.current = player;
    };

    const seekInterval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !player.getCurrentTime || seekDraggingRef.current) return;
      const cur = player.getCurrentTime();
      const dur = player.getDuration();
      if (dur > 0) {
        setCurTime(cur);
        setDuration(dur);
      }
    }, 1000);

    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT') return;
      const player = playerRef.current;
      if (!player) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        player.seekTo((player.getCurrentTime?.() || 0) + 5, true);
      } else if (e.code === 'ArrowLeft') {
        player.seekTo(Math.max(0, (player.getCurrentTime?.() || 0) - 5), true);
      } else if (e.key === 'n' || e.key === 'N') {
        nextTrack();
      } else if (e.key === 'p' || e.key === 'P') {
        prevTrack();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearInterval(seekInterval);
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPlayerStateChange(e) {
    const player = playerRef.current;
    if (e.data === window.YT.PlayerState.PLAYING) {
      setIsPlaying(true);
      try {
        const data = player.getVideoData();
        setTrackTitle(data.title || 'Playing…');
        setTrackAuthor(data.author || '');
        setThumb(data.video_id ? `https://i.ytimg.com/vi/${data.video_id}/default.jpg` : null);
        if (data.video_id && data.video_id !== lastVideoIdRef.current) {
          lastVideoIdRef.current = data.video_id;
          nextScene();
        }
      } catch (_) {}
    } else if (e.data === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
    }
    if (modeRef.current === 'sharing') pushState();
  }

  // ---- controls ----
  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  function nextTrack() {
    playerRef.current?.nextVideo();
  }

  function prevTrack() {
    playerRef.current?.previousVideo();
  }

  function onSeekChange(e) {
    setCurTime(Number(e.target.value));
  }

  function onSeekCommit(e) {
    const val = Number(e.target.value);
    playerRef.current?.seekTo(val, true);
    seekDraggingRef.current = false;
  }

  function selectCategory(idx) {
    setActiveCategory(idx);
    playerRef.current?.loadPlaylist({ listType: 'playlist', list: CATEGORIES[idx].playlist });
  }

  function openMoodModal() {
    setMoodOpen(true);
    selectModalCategory(activeCategory);
  }

  function selectModalCategory(idx) {
    setModalCategory(idx);
    if (idx !== activeCategory) selectCategory(idx);
    loadPlaylistTracks(idx);
  }

  async function loadPlaylistTracks(idx) {
    if (playlistCache[idx]) return; // already loaded or loading
    setPlaylistCache((prev) => ({ ...prev, [idx]: 'loading' }));

    const ids = await waitForPlaylistIds();
    if (!ids || !ids.length) {
      setPlaylistCache((prev) => ({ ...prev, [idx]: [] }));
      return;
    }

    const tracks = await Promise.all(
      ids.slice(0, 25).map(async (videoId) => {
        try {
          const res = await fetch(
            `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`
          );
          const data = await res.json();
          return { videoId, title: data.title || videoId };
        } catch (_) {
          return { videoId, title: videoId };
        }
      })
    );
    setPlaylistCache((prev) => ({ ...prev, [idx]: tracks }));
  }

  function waitForPlaylistIds(attempts = 10) {
    return new Promise((resolve) => {
      const tryRead = (n) => {
        const ids = playerRef.current?.getPlaylist?.();
        if (ids && ids.length) {
          resolve(ids);
        } else if (n <= 0) {
          resolve([]);
        } else {
          setTimeout(() => tryRead(n - 1), 300);
        }
      };
      tryRead(attempts);
    });
  }

  function playTrackAt(idx, trackIdx) {
    playerRef.current?.playVideoAt(trackIdx);
    setMoodOpen(false);
  }

  // ---- Share Vibe: sharer side ----
  function startSharing() {
    if (modeRef.current === 'listening') stopListening();
    const code = genCode();
    shareCodeRef.current = code;
    modeRef.current = 'sharing';

    const socket = joinRoom(code, () => {}); // sharer doesn't need to react to broadcasts
    socketRef.current = socket;
    socket.addEventListener('open', () => pushState());
    writeTimerRef.current = setInterval(pushState, WRITE_INTERVAL_MS);
    setShareLink(`${location.origin}${location.pathname}?vibe=${code}`);
  }

  function pushState() {
    const player = playerRef.current;
    const socket = socketRef.current;
    if (modeRef.current !== 'sharing' || !player || !player.getVideoData || !socket) return;
    const data = player.getVideoData();
    sendState(socket, {
      videoId: data.video_id,
      trackName: data.title || '',
      position: player.getCurrentTime ? player.getCurrentTime() : 0,
      isPlaying: player.getPlayerState() === window.YT.PlayerState.PLAYING,
    });
  }

  function stopSharing() {
    clearInterval(writeTimerRef.current);
    writeTimerRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    modeRef.current = 'idle';
    shareCodeRef.current = null;
    setShareLink(null);
  }

  // ---- Share Vibe: listener side ----
  function checkIncomingLink() {
    const params = new URLSearchParams(location.search);
    const code = params.get('vibe');
    if (!code) return;

    const timeout = setTimeout(() => {
      setVibeBanner({ text: 'This vibe has ended.', showJoin: false, code });
    }, 1500);

    const socket = joinRoom(code, (state) => {
      clearTimeout(timeout);
      socket.close(); // this was just a peek — joinVibe() opens the real listening socket
      if (!state || Date.now() - state.updatedAt > STALE_MS) {
        setVibeBanner({ text: 'This vibe has ended.', showJoin: false, code });
        return;
      }
      setVibeBanner({
        text: `Someone's listening to ${state.trackName || 'a track'} — ${fmtTime(state.position)}`,
        showJoin: true,
        code,
      });
    });
  }

  function joinVibe(code) {
    if (modeRef.current === 'sharing') stopSharing();
    modeRef.current = 'listening';
    shareCodeRef.current = code;

    let firstMessage = true;
    const socket = joinRoom(code, (state) => {
      if (!state) return;
      if (firstMessage) {
        firstMessage = false;
        const expected = state.position + (Date.now() - state.updatedAt) / 1000;
        lastAppliedVideoIdRef.current = state.videoId;
        const player = playerRef.current;
        player.loadVideoById(state.videoId, expected);
        if (!state.isPlaying) player.pauseVideo();
        return;
      }
      applyRemoteState(state);
    });
    socketRef.current = socket;

    setVibeBanner((prev) => (prev ? { ...prev, showJoin: false } : prev));
  }

  function applyRemoteState(state) {
    if (modeRef.current !== 'listening' || !state) return;
    const player = playerRef.current;

    if (Date.now() - state.updatedAt > STALE_MS) {
      setVibeBanner((prev) => (prev ? { ...prev, text: 'This vibe has ended.' } : prev));
      return;
    }

    if (state.videoId !== lastAppliedVideoIdRef.current) {
      lastAppliedVideoIdRef.current = state.videoId;
      player.loadVideoById(state.videoId, state.position);
      setVibeBanner((prev) =>
        prev ? { ...prev, text: `Someone's listening to ${state.trackName || 'a track'} — ${fmtTime(state.position)}` } : prev
      );
      return;
    }

    const playingNow = player.getPlayerState() === window.YT.PlayerState.PLAYING;
    if (state.isPlaying && !playingNow) player.playVideo();
    if (!state.isPlaying && playingNow) player.pauseVideo();

    const expected = state.position + (Date.now() - state.updatedAt) / 1000;
    const actual = player.getCurrentTime ? player.getCurrentTime() : 0;
    if (Math.abs(expected - actual) > DRIFT_THRESHOLD_S) {
      player.seekTo(expected, true);
    }
  }

  function stopListening() {
    socketRef.current?.close();
    socketRef.current = null;
    modeRef.current = 'idle';
    shareCodeRef.current = null;
  }

  function dismissBanner() {
    setVibeBanner(null);
    stopListening();
  }

  function copyLink() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
  }

  return (
    <div className="root" style={{ '--accent': scene.accent }}>
      <div className="bg-stage" style={{ backgroundImage: `url(${scene.image})` }} />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🚌</span>
          <div>
            <div className="brand-title">Raat Ka Safar</div>
            <div className="brand-sub">NIGHT DRIVES · OLD SONGS</div>
          </div>
        </div>
        <button className="pill-btn mood-btn" onClick={openMoodModal}>
          🎧 Mood
        </button>
        <button className="share-icon-btn" onClick={startSharing} title="Share Vibe">
          🔗
        </button>
      </header>

      {moodOpen && (
        <div className="mood-overlay" onClick={() => setMoodOpen(false)}>
          <div className="mood-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="mood-modal-header">
              <h2>Set the mood</h2>
              <button className="icon-btn" onClick={() => setMoodOpen(false)}>✕</button>
            </div>

            <div className="mood-categories">
              {CATEGORIES.map((cat, idx) => (
                <button
                  key={cat.label}
                  className={`chip ${idx === activeCategory ? 'active' : ''} ${modalCategory === idx ? 'menu-open' : ''}`}
                  onClick={() => selectModalCategory(idx)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="mood-tracks">
              {playlistCache[modalCategory] === 'loading' && (
                <div className="track-menu-empty">Loading tracks…</div>
              )}
              {Array.isArray(playlistCache[modalCategory]) && playlistCache[modalCategory].length === 0 && (
                <div className="track-menu-empty">No tracks found.</div>
              )}
              {Array.isArray(playlistCache[modalCategory]) &&
                playlistCache[modalCategory].map((t, trackIdx) => (
                  <button
                    key={t.videoId + trackIdx}
                    className="track-menu-item"
                    onClick={() => playTrackAt(modalCategory, trackIdx)}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {vibeBanner && (
        <div className="vibe-banner glass">
          <span>{vibeBanner.text}</span>
          {vibeBanner.showJoin && (
            <button className="pill-btn" onClick={() => joinVibe(vibeBanner.code)}>
              Join &amp; Play
            </button>
          )}
          <button className="icon-btn" onClick={dismissBanner}>✕</button>
        </div>
      )}

      {shareLink && (
        <div className="share-toast glass">
          <input type="text" value={shareLink} readOnly onFocus={(e) => e.target.select()} />
          <button className="pill-btn" onClick={copyLink}>Copy</button>
          <button className="icon-btn" onClick={stopSharing}>✕</button>
        </div>
      )}

      <div className="hero-center">
        <div className="hero-tag">NON-STOP · SHARE THE VIBE</div>
        <h1 className="hero-title">RAAT KA SAFAR</h1>
      </div>

      <div id="yt-audio" className="yt-audio-mount" />

      <footer className="playerbar-wrap">
        <div className="playerbar glass">
          <div className="thumb">
            {thumb ? <img src={thumb} alt="" /> : <span className="thumb-fallback">♪</span>}
          </div>
          <div className="track-info">
            <div className="track-title">{trackTitle}</div>
            <div className="track-author">{trackAuthor || 'YouTube'}</div>
          </div>

          <button className="bar-icon-btn" onClick={prevTrack} title="Previous">⏮</button>
          <button className="bar-play-btn" onClick={togglePlay} title="Play/Pause">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="bar-icon-btn" onClick={nextTrack} title="Next">⏭</button>

          <div className="seek-inline">
            <span className="time">{fmtTime(curTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={curTime}
              style={{
                background: `linear-gradient(to right, var(--accent) ${((curTime / (duration || 100)) * 100).toFixed(2)}%, rgba(255,255,255,0.18) ${((curTime / (duration || 100)) * 100).toFixed(2)}%)`,
              }}
              onMouseDown={() => (seekDraggingRef.current = true)}
              onTouchStart={() => (seekDraggingRef.current = true)}
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
    </div>
  );
}

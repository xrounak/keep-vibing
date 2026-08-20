'use client';

import { useEffect, useRef, useState } from 'react';
import { joinRoom, send, genCode, fmtTime, WRITE_INTERVAL_MS, STALE_MS, DRIFT_THRESHOLD_S } from './vibeStore';

// TODO: replace remaining placeholders with real official-label playlist IDs
const CATEGORIES = [
  { label: '90s', playlist: 'RDCPgD-SQ1fJ8' },
  // { label: 'Punjabi', playlist: 'PLACEHOLDER_PUNJABI' },
  // { label: 'Haryanvi', playlist: 'PLACEHOLDER_HARYANVI' },
  // { label: 'Workout', playlist: 'PLACEHOLDER_WORKOUT' },
];

// accents cycle independently of how many bg images actually exist
const ACCENTS = ['#e2a63b', '#e8c34a', '#e98a72', '#8a9b5e', '#c9a0dc', '#7fb8b0'];

export default function Player() {
  const playerRef = useRef(null);
  const socketRef = useRef(null);
  const roomModeRef = useRef('off'); // off | preview | active — symmetric: anyone in 'active' can control
  const roomCodeRef = useRef(null);
  const writeTimerRef = useRef(null);
  const lastAppliedVideoIdRef = useRef(null);
  const lastKnownStateRef = useRef(null); // for answering late-joiners' request-state
  const applyingRemoteRef = useRef(false); // guards against re-broadcasting a change we just applied from the network
  const applyingRemoteTimeoutRef = useRef(null);
  const broadcastDebounceRef = useRef(null);
  const seekDraggingRef = useRef(false);
  const lastVideoIdRef = useRef(null);
  const sceneIdxRef = useRef(0);
  const bgImagesRef = useRef([]);
  const frontLayerRef = useRef('a');
  const activeCategoryRef = useRef(0);

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
  const [bgImages, setBgImages] = useState([]);
  const [frontLayer, setFrontLayer] = useState('a'); // which layer is visible: 'a' | 'b'
  const [layerAImage, setLayerAImage] = useState(null);
  const [layerBImage, setLayerBImage] = useState(null);
  const [playlistCache, setPlaylistCache] = useState({}); // idx -> 'loading' | [{videoId,title}]
  const [moodOpen, setMoodOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState(0);

  const accent = ACCENTS[sceneIdx % ACCENTS.length];

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setMoodOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // discover bg images at runtime — folder is the source of truth, no
  // hardcoded list, any count, any names following bgN.<ext>
  useEffect(() => {
    fetch('/api/bg-images')
      .then((r) => r.json())
      .then((images) => {
        if (!images.length) return;
        bgImagesRef.current = images;
        setBgImages(images);
        setLayerAImage(images[0]);
      })
      .catch(() => {});
  }, []);

  // reads/writes via refs — called from the YT player's onStateChange,
  // which is registered once and would otherwise close over stale state
  function nextScene() {
    const images = bgImagesRef.current;
    if (!images.length) return;
    sceneIdxRef.current = (sceneIdxRef.current + 1) % images.length;
    setSceneIdx(sceneIdxRef.current);
    const nextImage = images[sceneIdxRef.current];
    if (frontLayerRef.current === 'a') {
      setLayerBImage(nextImage);
      setFrontLayer('b');
      frontLayerRef.current = 'b';
    } else {
      setLayerAImage(nextImage);
      setFrontLayer('a');
      frontLayerRef.current = 'a';
    }
  }

  // ---- YT bootstrap ----
  useEffect(() => {
    let cancelled = false; // guards against React StrictMode's double-invoke in dev

    function createPlayer() {
      if (cancelled) return;
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
    }

    if (window.YT && window.YT.Player) {
      // API already loaded by an earlier (possibly StrictMode-cancelled) mount
      createPlayer();
    } else {
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
    }

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
      cancelled = true;
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
        if (data.video_id) lastAppliedVideoIdRef.current = data.video_id;
        if (data.video_id && data.video_id !== lastVideoIdRef.current) {
          lastVideoIdRef.current = data.video_id;
          nextScene();
        }
      } catch (_) {}
    } else if (e.data === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
    }

    // any real local change (play/pause/track load) broadcasts to the room —
    // unless this state change was itself caused by applying a remote update.
    // Debounced: loading a track fires several state transitions in quick
    // succession (BUFFERING → PLAYING etc), only the settled one should send.
    if (roomModeRef.current === 'active' && !applyingRemoteRef.current) {
      clearTimeout(broadcastDebounceRef.current);
      broadcastDebounceRef.current = setTimeout(() => {
        if (!applyingRemoteRef.current) broadcastState();
      }, 250);
    }
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
    // seekTo alone doesn't fire onStateChange — broadcast explicitly, passing
    // the target position directly since getCurrentTime() may lag right after seek
    if (roomModeRef.current === 'active') broadcastState(val);
  }

  function selectCategory(idx) {
    activeCategoryRef.current = idx;
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
          return { videoId, title: data.title || videoId, author: data.author_name || '' };
        } catch (_) {
          return { videoId, title: videoId, author: '' };
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

  // ---- Share Vibe: symmetric room — anyone in 'active' mode can control
  // playback, track, and category for everyone else in the room. No owner.

  function broadcastState(positionOverride) {
    const player = playerRef.current;
    const socket = socketRef.current;
    if (roomModeRef.current !== 'active' || !player || !player.getVideoData || !socket) return;
    const data = player.getVideoData();
    if (!data.video_id) return;
    const state = {
      videoId: data.video_id,
      trackName: data.title || '',
      position: positionOverride !== undefined ? positionOverride : (player.getCurrentTime ? player.getCurrentTime() : 0),
      isPlaying: player.getPlayerState() === window.YT.PlayerState.PLAYING,
      categoryIdx: activeCategoryRef.current,
      playlistIndex: player.getPlaylistIndex ? player.getPlaylistIndex() : 0,
      updatedAt: Date.now(),
    };
    lastKnownStateRef.current = state;
    send(socket, { type: 'update', state });
  }

  function handleRoomMessage(msg) {
    if (msg.type === 'request-state') {
      if (lastKnownStateRef.current && socketRef.current) {
        send(socketRef.current, { type: 'update', state: lastKnownStateRef.current });
      }
      return;
    }
    if (msg.type !== 'update' || !msg.state) return;

    const state = msg.state;
    lastKnownStateRef.current = state;

    if (roomModeRef.current === 'preview') {
      if (Date.now() - state.updatedAt > STALE_MS) {
        setVibeBanner({ text: 'This vibe has ended.', showJoin: false, code: roomCodeRef.current });
      } else {
        setVibeBanner({
          text: `Someone's listening to ${state.trackName || 'a track'} — ${fmtTime(state.position)}`,
          showJoin: true,
          code: roomCodeRef.current,
        });
      }
      return;
    }

    if (roomModeRef.current === 'active') applyRemoteState(state);
  }

  function applyRemoteState(state) {
    const player = playerRef.current;
    if (!player) return;

    if (state.categoryIdx !== undefined && state.categoryIdx !== activeCategoryRef.current) {
      activeCategoryRef.current = state.categoryIdx;
      setActiveCategory(state.categoryIdx);
    }

    const isTrackChange = state.videoId !== lastAppliedVideoIdRef.current;

    // suppress our own reactive broadcast while this settles — track changes
    // trigger real buffering (can take a couple seconds on a slow connection),
    // same-track play/pause/seek settles almost instantly
    applyingRemoteRef.current = true;
    clearTimeout(applyingRemoteTimeoutRef.current);
    applyingRemoteTimeoutRef.current = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, isTrackChange ? 3000 : 500);

    if (isTrackChange) {
      lastAppliedVideoIdRef.current = state.videoId;
      const expected = state.position + (Date.now() - state.updatedAt) / 1000;
      const category = CATEGORIES[state.categoryIdx] || CATEGORIES[activeCategoryRef.current];
      // loadPlaylist (not loadVideoById) keeps playlist context alive, so
      // Next/Prev keep working for whoever just received this update
      player.loadPlaylist({
        listType: 'playlist',
        list: category.playlist,
        index: state.playlistIndex || 0,
        startSeconds: expected,
      });
      if (!state.isPlaying) player.pauseVideo();
    } else {
      const playingNow = player.getPlayerState() === window.YT.PlayerState.PLAYING;
      if (state.isPlaying && !playingNow) player.playVideo();
      if (!state.isPlaying && playingNow) player.pauseVideo();

      const expected = state.position + (Date.now() - state.updatedAt) / 1000;
      const actual = player.getCurrentTime ? player.getCurrentTime() : 0;
      if (Math.abs(expected - actual) > DRIFT_THRESHOLD_S) {
        player.seekTo(expected, true);
      }
    }
  }

  // "Share Vibe" — create a room (or re-show the link if already in one)
  function startSharing() {
    if (roomModeRef.current === 'active' && roomCodeRef.current) {
      setShareLink(`${location.origin}${location.pathname}?vibe=${roomCodeRef.current}`);
      return;
    }
    if (roomModeRef.current !== 'off') leaveRoom();

    const code = genCode();
    roomCodeRef.current = code;
    roomModeRef.current = 'active';

    const socket = joinRoom(code, handleRoomMessage);
    socketRef.current = socket;
    socket.addEventListener('open', () => broadcastState());
    writeTimerRef.current = setInterval(broadcastState, WRITE_INTERVAL_MS);
    setShareLink(`${location.origin}${location.pathname}?vibe=${code}`);
  }

  // preview a room from an incoming ?vibe= link — connected, but not yet
  // controlling (autoplay policy needs a real user gesture, via Join & Play)
  function checkIncomingLink() {
    const params = new URLSearchParams(location.search);
    const code = params.get('vibe');
    if (!code) return;

    roomCodeRef.current = code;
    roomModeRef.current = 'preview';

    const timeout = setTimeout(() => {
      setVibeBanner({ text: 'This vibe has ended.', showJoin: false, code });
    }, 1500);

    const socket = joinRoom(code, (msg) => {
      clearTimeout(timeout);
      handleRoomMessage(msg);
    });
    socketRef.current = socket;
    socket.addEventListener('open', () => send(socket, { type: 'request-state' }));
  }

  // promote a previewed room into full symmetric control
  function joinVibe(code) {
    roomModeRef.current = 'active';
    if (lastKnownStateRef.current) applyRemoteState(lastKnownStateRef.current);
    writeTimerRef.current = setInterval(broadcastState, WRITE_INTERVAL_MS);
    setVibeBanner((prev) => (prev ? { ...prev, showJoin: false } : prev));
  }

  function leaveRoom() {
    clearInterval(writeTimerRef.current);
    writeTimerRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    roomModeRef.current = 'off';
    roomCodeRef.current = null;
    lastKnownStateRef.current = null;
    setShareLink(null);
  }

  function dismissBanner() {
    setVibeBanner(null);
    if (roomModeRef.current !== 'active') leaveRoom();
  }

  function copyLink() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
  }

  return (
    <div className="root" style={{ '--accent': accent }}>
      <div
        className={`bg-layer ${frontLayer === 'a' ? 'visible' : ''}`}
        style={{ backgroundImage: layerAImage ? `url(${layerAImage})` : 'none' }}
      />
      <div
        className={`bg-layer ${frontLayer === 'b' ? 'visible' : ''}`}
        style={{ backgroundImage: layerBImage ? `url(${layerBImage})` : 'none' }}
      />
      <div className="bg-scrim" />

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
        <button className="share-icon-btn" onClick={startSharing} title="Vibe Together">
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
                playlistCache[modalCategory].map((t, trackIdx) => {
                  const isPlayingTrack = modalCategory === activeCategory && t.videoId === lastAppliedVideoIdRef.current;
                  return (
                    <button
                      key={t.videoId + trackIdx}
                      className={`track-menu-item ${isPlayingTrack ? 'playing' : ''}`}
                      onClick={() => playTrackAt(modalCategory, trackIdx)}
                    >
                      <span className="track-menu-num">{isPlayingTrack ? '♪' : trackIdx + 1}</span>
                      <img
                        className="track-menu-thumb"
                        src={`https://i.ytimg.com/vi/${t.videoId}/default.jpg`}
                        alt=""
                        loading="lazy"
                      />
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
        <div className="mood-overlay" onClick={() => setShareLink(null)}>
          <div className="share-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="mood-modal-header">
              <h2>Vibe Together</h2>
              <button className="icon-btn" onClick={() => setShareLink(null)}>✕</button>
            </div>

            <p className="share-desc">
              Anyone who opens this link joins the same room — same track, same timestamp.
              From there it's symmetric: whoever plays, pauses, seeks, skips, or picks a new
              mood, everyone hears it. No host, no permission needed.
            </p>

            <div className="share-link-row">
              <input type="text" value={shareLink} readOnly onFocus={(e) => e.target.select()} />
              <button className="pill-btn" onClick={copyLink}>Copy</button>
            </div>

            <button className="leave-room-btn" onClick={leaveRoom}>Leave room</button>
          </div>
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

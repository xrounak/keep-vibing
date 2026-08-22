'use client';

import { useEffect, useRef, useState } from 'react';
import { joinRoom, send, genCode, fmtTime, WRITE_INTERVAL_MS, STALE_MS, DRIFT_THRESHOLD_S } from './vibeStore';
import BackgroundLayers from './components/BackgroundLayers';
import TopBar from './components/TopBar';
import MoodModal from './components/MoodModal';
import VibeBanner from './components/VibeBanner';
import ShareModal from './components/ShareModal';
import PlayerBar from './components/PlayerBar';
import InstallPrompt from './components/InstallPrompt';
import playlistsData from './playlists.json';

// mini "database" of playlists — edit app/playlists.json to add/remove
// moods. Each entry: { label, source, playlistId }. Only source:"youtube"
// is wired to actual playback (Spotify's embed only gives non-logged-in
// listeners 30s previews, incompatible with this app's no-login model).
const CATEGORIES = playlistsData.filter((p) => p.source === 'youtube');

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
  const loopModeRef = useRef('playlist'); // 'song' | 'playlist' | 'shuffle' — read inside the once-registered YT event handler
  const fetcherPlayerRef = useRef(null); // separate hidden player dedicated to playlist track-list lookups, never used for playback — rebuilt fresh per fetch
  const fetchQueueRef = useRef(Promise.resolve()); // serializes fetches so rebuilds can't race each other

  const [activeCategory, setActiveCategory] = useState(0);
  const [loopMode, setLoopMode] = useState('playlist');
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
      // best-effort autoplay: browsers silently block this unless the site
      // already has autoplay trust (returning visitor) — falls back to a
      // normal paused state with no error either way. Skipped when landing
      // via a shared link, since joining that room is its own deliberate step.
      const hasIncomingVibe = new URLSearchParams(location.search).has('vibe');
      const player = new window.YT.Player('yt-audio', {
        height: '1',
        width: '1',
        playerVars: {
          listType: 'playlist',
          list: CATEGORIES[0].playlistId,
          autoplay: hasIncomingVibe ? 0 : 1,
          playsinline: 1,
          // without these, YouTube spills into personalized "up next"
          // recommendations (tied to whatever Google account is logged
          // into that device) once the playlist nears its end — that's
          // what looked like the playlist randomly changing per device
          rel: 0,
          loop: 1,
        },
        events: {
          onReady: () => {
            checkIncomingLink();
          },
          onStateChange: onPlayerStateChange,
        },
      });
      playerRef.current = player;

      // lock-screen / notification-shade media controls, and a nudge for
      // some mobile browsers (mainly Android Chrome) to keep treating this
      // tab as active media playback rather than throttling it in the
      // background — iOS Safari stays unreliable for iframe audio regardless
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo());
        navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      }
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
        updateMediaSession(data);
      } catch (_) {}
      setMediaSessionState('playing');
    } else if (e.data === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
      setMediaSessionState('paused');
    } else if (e.data === window.YT.PlayerState.ENDED && loopModeRef.current === 'song') {
      // YT has no native single-video-loop toggle — replay it ourselves.
      // The resulting PLAYING event covers the room broadcast, so return early.
      player.seekTo(0, true);
      player.playVideo();
      return;
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

  function updateMediaSession(videoData) {
    if (!('mediaSession' in navigator) || !videoData.video_id) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: videoData.title || 'Raat Ka Safar',
      artist: videoData.author || '',
      artwork: [{ src: `https://i.ytimg.com/vi/${videoData.video_id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }],
    });
  }

  function setMediaSessionState(state) {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
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

  const LOOP_MODES = ['playlist', 'shuffle', 'song'];

  function cycleLoopMode() {
    const next = LOOP_MODES[(LOOP_MODES.indexOf(loopModeRef.current) + 1) % LOOP_MODES.length];
    loopModeRef.current = next;
    setLoopMode(next);

    const player = playerRef.current;
    if (!player) return;
    // native loop/shuffle cover playlist & shuffle modes; song mode is
    // handled by replaying on ENDED (see onPlayerStateChange) — keep
    // native loop on regardless, as a safety net against ever falling
    // into YouTube's own recommendation autoplay
    player.setLoop(true);
    player.setShuffle(next === 'shuffle');
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
    playerRef.current?.loadPlaylist({ listType: 'playlist', list: CATEGORIES[idx].playlistId });
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
    if (playlistCache[idx] !== undefined) return; // already resolved (or resolving) for this category
    setPlaylistCache((prev) => ({ ...prev, [idx]: 'loading' }));

    const ids = await enqueuePlaylistFetch(CATEGORIES[idx].playlistId);
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

  // Track-list lookups used to poll the *live playback player*'s
  // getPlaylist(), which raced against selectCategory()'s own
  // loadPlaylist() call on the same player — switching categories quickly
  // could catch the player still holding the previous playlist's (non-
  // empty) data and cache that under the wrong category, permanently
  // (an empty [] result is still truthy in JS, so a lost race never
  // retried). First fix used one reused hidden fetcher player, but that
  // uncovered a real YouTube IFrame API quirk: calling loadPlaylist() a
  // second time on an existing player instance updates getVideoData().list
  // immediately, but getPlaylist() (the actual video id array) stays stuck
  // returning the *first* playlist's ids forever. Only a genuinely fresh
  // player instance per fetch returns correct data — so that's what this
  // does now, torn down and rebuilt every call. Fetches are still
  // serialized so rebuilds can't race each other.
  function enqueuePlaylistFetch(playlistId) {
    const run = () => fetchPlaylistIds(playlistId);
    const result = fetchQueueRef.current.then(run, run);
    fetchQueueRef.current = result.catch(() => {});
    return result;
  }

  function fetchPlaylistIds(playlistId, attempts = 15) {
    return new Promise((resolve) => {
      if (fetcherPlayerRef.current) {
        fetcherPlayerRef.current.destroy();
        fetcherPlayerRef.current = null;
      }
      const mount = document.getElementById('yt-fetch');
      mount.innerHTML = '';
      const inner = document.createElement('div');
      mount.appendChild(inner);

      const player = new window.YT.Player(inner, {
        height: '1',
        width: '1',
        playerVars: { listType: 'playlist', list: playlistId, autoplay: 0 },
        events: {
          onReady: () => {
            fetcherPlayerRef.current = player;
            const tryRead = (n) => {
              const ids = player.getPlaylist?.();
              if (ids && ids.length) {
                resolve(ids);
              } else if (n <= 0) {
                resolve([]);
              } else {
                setTimeout(() => tryRead(n - 1), 300);
              }
            };
            tryRead(attempts);
          },
          onError: () => resolve([]),
        },
      });
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
        list: category.playlistId,
        index: state.playlistIndex || 0,
        startSeconds: expected,
      });
      // loadPlaylist doesn't reliably auto-resume on a player constructed
      // with autoplay:0 — call the right one explicitly instead of assuming
      if (state.isPlaying) player.playVideo();
      else player.pauseVideo();
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
      <BackgroundLayers layerAImage={layerAImage} layerBImage={layerBImage} frontLayer={frontLayer} />

      <TopBar onOpenMood={openMoodModal} onOpenShare={startSharing} />

      <MoodModal
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        categories={CATEGORIES}
        activeCategory={activeCategory}
        modalCategory={modalCategory}
        onSelectCategory={selectModalCategory}
        playlistCache={playlistCache}
        lastAppliedVideoId={lastAppliedVideoIdRef.current}
        onPlayTrack={playTrackAt}
      />

      <VibeBanner banner={vibeBanner} onJoin={joinVibe} onDismiss={dismissBanner} />

      <ShareModal shareLink={shareLink} onClose={() => setShareLink(null)} onCopy={copyLink} onLeave={leaveRoom} />

      <div className="hero-center">
        <div className="hero-tag">NON-STOP · SHARE THE VIBE</div>
        <h1 className="hero-title">रात का सफर</h1>
      </div>

      <div id="yt-audio" className="yt-audio-mount" />
      <div id="yt-fetch" className="yt-audio-mount" />

      <PlayerBar
        thumb={thumb}
        trackTitle={trackTitle}
        trackAuthor={trackAuthor}
        isPlaying={isPlaying}
        curTime={curTime}
        duration={duration}
        loopMode={loopMode}
        onPrev={prevTrack}
        onPlayPause={togglePlay}
        onNext={nextTrack}
        onCycleLoop={cycleLoopMode}
        onSeekChange={onSeekChange}
        onSeekCommit={onSeekCommit}
        onSeekDragStart={() => (seekDraggingRef.current = true)}
      />

      <InstallPrompt />
    </div>
  );
}

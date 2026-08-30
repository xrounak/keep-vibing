'use client';

import { useEffect, useRef, useState } from 'react';
import { joinRoom, send, genCode, fmtTime, WRITE_INTERVAL_MS, STALE_MS, DRIFT_THRESHOLD_S } from './vibeStore';
import BackgroundVideo from './components/BackgroundVideo';
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
  const activeCategoryRef = useRef(0);
  const loopModeRef = useRef('playlist'); // 'song' | 'playlist' | 'shuffle' — read inside the once-registered YT event handler
  const fetcherPlayerRef = useRef(null); // separate hidden player dedicated to playlist track-list lookups, never used for playback — rebuilt fresh per fetch
  const fetchQueueRef = useRef(Promise.resolve()); // serializes fetches so rebuilds can't race each other
  const playlistCacheRef = useRef({}); // mirror of playlistCache, read synchronously so rapid taps can't double-fetch the same category
  const switchTimerRef = useRef(null); // poll driving playlist-switch retries and the loop/shuffle re-arm
  const volumeRef = useRef(100); // read inside the once-registered onReady handler

  const [activeCategory, setActiveCategory] = useState(0);
  const [loopMode, setLoopMode] = useState('playlist');
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
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
  // render-visible mirror of lastAppliedVideoIdRef — a ref alone can't drive
  // the modal's "now playing" highlight, since mutating it doesn't re-render
  const [nowPlayingId, setNowPlayingId] = useState(null);

  const accent = ACCENTS[sceneIdx % ACCENTS.length];

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setMoodOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // accent color still cycles per track (background is now a fixed looping
  // video, not per-track images) — read/written via ref since this is
  // called from the YT player's onStateChange, registered once
  function nextScene() {
    sceneIdxRef.current = (sceneIdxRef.current + 1) % ACCENTS.length;
    setSceneIdx(sceneIdxRef.current);
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
            player.setVolume(volumeRef.current);
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
        if (data.video_id) {
          lastAppliedVideoIdRef.current = data.video_id;
          setNowPlayingId(data.video_id);
        }
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

    applyPlaybackModes();
  }

  // native loop/shuffle cover playlist & shuffle modes; song mode is handled
  // by replaying on ENDED (see onPlayerStateChange) — keep native loop on
  // regardless, as a safety net against ever falling into YouTube's own
  // recommendation autoplay. Must be re-applied after *every* loadPlaylist:
  // YouTube resets both flags when a new playlist is loaded, which silently
  // left shuffle mode not actually shuffling after a category switch.
  function applyPlaybackModes() {
    const player = playerRef.current;
    if (!player || !player.setLoop) return;
    player.setLoop(true);
    player.setShuffle(loopModeRef.current === 'shuffle');
  }

  // Switching playlists is not just loadPlaylist(): with loop enabled (either
  // the loop:1 playerVar or setLoop(true)) YouTube reverts any newly loaded
  // playlist back to the one the player was constructed with. getVideoData().list
  // updates to the new id, but getPlaylist() and playback stay on the original —
  // which is why picking a mood other than the first one silently kept playing
  // the first one. Verified in-page: with loop off the same call swaps
  // correctly, and re-arming loop afterwards sticks.
  // Switching playlists is not a plain loadPlaylist() call. Two verified
  // YouTube IFrame quirks get in the way, both silent — no error, no event,
  // getVideoData().list even flips to the new id while getPlaylist() and
  // actual playback stay on the old one:
  //   1. the first loadPlaylist() issued on a freshly constructed player is
  //      dropped; an identical second call lands. Hence the retries below.
  //   2. with loop enabled (the loop:1 playerVar or setLoop(true)) a pending
  //      load gets reverted to the playlist the player started with — which
  //      is why every mood other than the first one kept playing the first
  //      one. So loop goes off for the swap and is re-armed only once the
  //      new playlist has actually landed.
  function switchPlaylist(playlistId, index, startSeconds) {
    const player = playerRef.current;
    if (!player) return;

    const firstOf = () => ((player.getPlaylist && player.getPlaylist()) || [])[0];
    const before = firstOf();
    const issuedAt = Date.now();

    player.setLoop(false);

    const issue = () => {
      const args = { listType: 'playlist', list: playlistId, index: index || 0 };
      // keep a room-synced start position honest across retries
      if (startSeconds !== undefined) args.startSeconds = startSeconds + (Date.now() - issuedAt) / 1000;
      player.loadPlaylist(args);
      // loadPlaylist doesn't reliably auto-resume on a player constructed
      // with autoplay:0 (the ?vibe= landing case) — ask for it explicitly
      player.playVideo();
    };
    issue();

    clearTimeout(switchTimerRef.current);
    let ticks = 0;
    let retries = 4;
    const check = () => {
      if (firstOf() !== before) {
        applyPlaybackModes();
        return;
      }
      ticks += 1;
      if (ticks >= 20) {
        applyPlaybackModes(); // give up quietly; player stays on the old playlist
        return;
      }
      if (ticks % 4 === 0 && retries-- > 0) issue();
      switchTimerRef.current = setTimeout(check, 400);
    };
    switchTimerRef.current = setTimeout(check, 400);
  }

  // a deliberate local action must win over an in-flight remote apply —
  // otherwise the suppression window swallows our own broadcast and the
  // rest of the room never hears about the change
  function beginLocalAction() {
    clearTimeout(applyingRemoteTimeoutRef.current);
    applyingRemoteRef.current = false;
  }

  // volume is deliberately local — it is not part of the room state, so
  // turning yours down doesn't turn everyone else's down too
  function onVolumeChange(next) {
    setVolume(next);
    volumeRef.current = next;
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(next);
    // dragging the slider off zero is an implicit unmute, and dragging it
    // to zero is an implicit mute — otherwise the icon lies about the state
    if (next === 0 && !muted) {
      setMuted(true);
      player.mute();
    } else if (next > 0 && muted) {
      setMuted(false);
      player.unMute();
    }
  }

  function toggleMute() {
    const player = playerRef.current;
    const next = !muted;
    setMuted(next);
    if (!player) return;
    if (next) {
      player.mute();
    } else {
      player.unMute();
      // unmuting from a slider dragged to zero would stay silent
      if (volumeRef.current === 0) {
        volumeRef.current = 100;
        setVolume(100);
      }
      player.setVolume(volumeRef.current);
    }
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

  function openMoodModal() {
    setMoodOpen(true);
    loadPlaylistTracks(activeCategoryRef.current);
  }

  // Tapping a mood chip switches the playing playlist — that is the whole
  // point of the control. There used to be a second "modalCategory" that only
  // previewed a category's tracks without touching playback, which meant the
  // chips looked like a playlist switcher but weren't one, and every chip
  // carried two overlapping highlight states. One category now, one meaning.
  function selectCategory(idx) {
    loadPlaylistTracks(idx);
    if (idx === activeCategoryRef.current) return;

    activeCategoryRef.current = idx;
    setActiveCategory(idx);
    beginLocalAction();

    switchPlaylist(CATEGORIES[idx].playlistId, 0);
  }

  function setCacheEntry(idx, value) {
    playlistCacheRef.current = { ...playlistCacheRef.current, [idx]: value };
    setPlaylistCache(playlistCacheRef.current);
  }

  function clearCacheEntry(idx) {
    const next = { ...playlistCacheRef.current };
    delete next[idx];
    playlistCacheRef.current = next;
    setPlaylistCache(next);
  }

  async function loadPlaylistTracks(idx) {
    // read through the ref, not the state: two taps in the same render pass
    // both saw a stale `playlistCache` and fired duplicate fetches
    if (playlistCacheRef.current[idx] !== undefined) return; // already resolved (or resolving)
    setCacheEntry(idx, 'loading');

    try {
      const ids = await enqueuePlaylistFetch(CATEGORIES[idx].playlistId);
      if (!ids || !ids.length) {
        // 'error', not []: an empty array is still `undefined`-free, so the
        // early-return above made a single failed lookup permanent for the
        // whole session with no way to retry
        setCacheEntry(idx, 'error');
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
      setCacheEntry(idx, tracks);
    } catch (_) {
      // without this the entry stayed 'loading' forever and the spinner never
      // resolved, with no way to retry
      setCacheEntry(idx, 'error');
    }
  }

  function retryPlaylistTracks(idx) {
    clearCacheEntry(idx);
    loadPlaylistTracks(idx);
  }

  // Track-list lookups used to poll the *live playback player*'s
  // getPlaylist(), which raced against the main player's own loadPlaylist()
  // call whenever a category switch also changed playback — switching
  // categories quickly could catch the player still holding the previous playlist's (non-
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
    // playVideoAt(trackIdx) alone plays by index within whatever the main
    // player *currently* has loaded, which may not be this category at all.
    // Loading the target playlist and index together in one call is correct
    // regardless of whatever was playing before.
    activeCategoryRef.current = idx;
    setActiveCategory(idx);
    beginLocalAction();
    switchPlaylist(CATEGORIES[idx].playlistId, trackIdx);
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
      setNowPlayingId(state.videoId);
      const expected = state.position + (Date.now() - state.updatedAt) / 1000;
      const category = CATEGORIES[state.categoryIdx] || CATEGORIES[activeCategoryRef.current];
      // loadPlaylist (not loadVideoById) keeps playlist context alive, so
      // Next/Prev keep working for whoever just received this update
      switchPlaylist(category.playlistId, state.playlistIndex || 0, expected);
      // switchPlaylist always asks for playback; honour a paused room
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
      <BackgroundVideo />

      <TopBar onOpenMood={openMoodModal} onOpenShare={startSharing} />

      <MoodModal
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        categories={CATEGORIES}
        activeCategory={activeCategory}
        onSelectCategory={selectCategory}
        playlistCache={playlistCache}
        nowPlayingId={nowPlayingId}
        onPlayTrack={playTrackAt}
        onRetry={retryPlaylistTracks}
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
        volume={volume}
        muted={muted}
        onPrev={prevTrack}
        onPlayPause={togglePlay}
        onNext={nextTrack}
        onCycleLoop={cycleLoopMode}
        onVolumeChange={onVolumeChange}
        onToggleMute={toggleMute}
        onSeekChange={onSeekChange}
        onSeekCommit={onSeekCommit}
        onSeekDragStart={() => (seekDraggingRef.current = true)}
      />

      <InstallPrompt />
    </div>
  );
}

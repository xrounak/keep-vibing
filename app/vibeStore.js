// Share Vibe sync layer (spec section 4.2 - 4.3.2)
// Backed by Supabase Realtime presence: one channel per share code.
// The sharer's client "tracks" its own state; presence automatically
// syncs the current tracked state to every subscriber, including late
// joiners — no server code of our own required.

import { createClient } from '@supabase/supabase-js';

export const WRITE_INTERVAL_MS = 4000;
export const STALE_MS = 2 * 60 * 1000;
export const DRIFT_THRESHOLD_S = 3;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// WebSocket-shaped adapter over a Supabase presence channel, so the rest
// of the app can treat it like a plain socket (addEventListener/send/close)
// without knowing the transport underneath. Auto-reconnects on unexpected
// drops (observed on the free tier after ~15s) and re-tracks the sharer's
// last known state once the new connection is up.
function createRoomSocket(code) {
  const listeners = { open: [], message: [] };
  const emit = (type, payload) => (listeners[type] || []).forEach((cb) => cb(payload));
  const presenceKey = Math.random().toString(36).slice(2);

  let channel = null;
  let closedByUs = false;
  let lastTrackedState = null;

  function connect() {
    channel = supabase.channel(`vibe-${code}`, {
      config: { presence: { key: presenceKey }, private: false },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presence = channel.presenceState();
      const entries = Object.values(presence).flat();
      const state = entries[0] || null; // only the sharer ever tracks
      emit('message', { data: JSON.stringify({ type: 'state', state }) });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        emit('open', {});
        if (lastTrackedState) await channel.track(lastTrackedState);
      } else if (!closedByUs && (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        supabase.removeChannel(channel);
        setTimeout(connect, 1000);
      }
    });
  }

  connect();

  return {
    addEventListener(type, cb) {
      (listeners[type] = listeners[type] || []).push(cb);
    },
    send(dataStr) {
      const msg = JSON.parse(dataStr);
      if (msg.type !== 'update') return;
      const { type, ...state } = msg;
      lastTrackedState = { ...state, updatedAt: Date.now() };
      channel?.track(lastTrackedState);
    },
    close() {
      closedByUs = true;
      if (channel) supabase.removeChannel(channel);
    },
  };
}

export function joinRoom(code, onState) {
  const socket = createRoomSocket(code);
  socket.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') onState(msg.state);
    } catch (_) {}
  });
  return socket;
}

export function sendState(socket, state) {
  socket.send(JSON.stringify({ type: 'update', ...state }));
}

export function genCode() {
  return Math.random().toString(36).slice(2, 8);
}

export function fmtTime(s) {
  s = Math.floor(s || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

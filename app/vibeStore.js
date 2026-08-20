// Share Vibe sync layer — symmetric room control.
// Backed by Supabase Realtime broadcast: one channel per share code.
// Anyone in the room can act (play/pause/seek/track/category); every
// action broadcasts the new state to everyone else in the room. There is
// no owner — whoever acted last is authoritative until someone else acts.
//
// Late joiners: on connect, broadcast a "request-state" message; every
// other peer that has seen state responds with it. First response wins.

export const WRITE_INTERVAL_MS = 4000; // heartbeat: re-broadcast current state even with no new action
export const STALE_MS = 2 * 60 * 1000;
export const DRIFT_THRESHOLD_S = 3;

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// WebSocket-shaped adapter over a Supabase broadcast channel. Auto-reconnects
// on unexpected drops (observed on the free tier after ~15s).
function createRoomSocket(code) {
  const listeners = { open: [], message: [] };
  const emit = (type, payload) => (listeners[type] || []).forEach((cb) => cb(payload));

  let channel = null;
  let closedByUs = false;

  function connect() {
    channel = supabase.channel(`vibe-${code}`, {
      config: { broadcast: { self: false }, private: false },
    });

    channel.on('broadcast', { event: 'msg' }, ({ payload }) => {
      emit('message', { data: JSON.stringify(payload) });
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        emit('open', {});
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
      channel?.send({ type: 'broadcast', event: 'msg', payload: msg });
    },
    close() {
      closedByUs = true;
      if (channel) supabase.removeChannel(channel);
    },
  };
}

export function joinRoom(code, onMessage) {
  const socket = createRoomSocket(code);
  socket.addEventListener('message', (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (_) {}
  });
  return socket;
}

export function send(socket, msg) {
  socket.send(JSON.stringify(msg));
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

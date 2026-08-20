// Share Vibe sync layer — symmetric room control.
// Backed by Ably channels: one channel per share code. Anyone in the
// room can act (play/pause/seek/track/category); every action broadcasts
// the new state to everyone else in the room. There is no owner —
// whoever acted last is authoritative until someone else acts.
//
// Late joiners: on connect, broadcast a "request-state" message; every
// other peer that has seen state responds with it. First response wins.

export const WRITE_INTERVAL_MS = 4000; // heartbeat: re-broadcast current state even with no new action
export const STALE_MS = 2 * 60 * 1000;
export const DRIFT_THRESHOLD_S = 3;

import * as Ably from 'ably';

let ablyClient = null;
function getAblyClient() {
  // one Realtime connection for the whole app lifetime, shared across
  // rooms — Ably handles reconnects internally, no custom retry needed
  if (!ablyClient) {
    ablyClient = new Ably.Realtime({ authUrl: '/api/ably-token' });
  }
  return ablyClient;
}

// WebSocket-shaped adapter over an Ably channel, so the rest of the app
// can treat it like a plain socket (addEventListener/send/close).
function createRoomSocket(code) {
  const listeners = { open: [], message: [] };
  const emit = (type, payload) => (listeners[type] || []).forEach((cb) => cb(payload));
  const senderId = Math.random().toString(36).slice(2); // to ignore our own publishes coming back

  const channel = getAblyClient().channels.get(`vibe-${code}`);

  channel.subscribe('msg', (msg) => {
    if (msg.data?.senderId === senderId) return;
    emit('message', { data: JSON.stringify(msg.data.payload) });
  });

  channel.attach().then(() => emit('open', {}));

  return {
    addEventListener(type, cb) {
      (listeners[type] = listeners[type] || []).push(cb);
    },
    send(dataStr) {
      const payload = JSON.parse(dataStr);
      channel.publish('msg', { senderId, payload });
    },
    close() {
      channel.unsubscribe();
      channel.detach();
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

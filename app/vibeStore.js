// Share Vibe sync layer (spec section 4.2 - 4.3.2)
// Backed by PartyKit: one room per share code, server holds the
// last-known state and broadcasts it to every connection in the room.

import PartySocket from 'partysocket';

export const WRITE_INTERVAL_MS = 4000;
export const STALE_MS = 2 * 60 * 1000;
export const DRIFT_THRESHOLD_S = 3;

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || '127.0.0.1:1999';

// Opens a socket connection to room `code`. Calls onState(state) every
// time the server pushes a state update (including the late-join
// snapshot right after connecting, if the room already has one).
export function joinRoom(code, onState) {
  const socket = new PartySocket({ host: PARTYKIT_HOST, room: code });

  socket.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') onState(msg.state);
    } catch (_) {}
  });

  return socket;
}

export function sendState(socket, state) {
  if (!socket || socket.readyState !== 1) return;
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

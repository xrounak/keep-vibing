import type * as Party from "partykit/server";

// One instance of this class per room (= per share code).
// State lives in memory only for as long as someone's connected;
// PartyKit kills the room after everyone disconnects + idle timeout.

type VibeState = {
  videoId: string;
  trackName: string;
  position: number;
  isPlaying: boolean;
  updatedAt: number;
} | null;

export default class VibeServer implements Party.Server {
  state: VibeState = null;

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // late-join snapshot: new client gets current state immediately,
    // not "from the start"
    if (this.state) {
      conn.send(JSON.stringify({ type: "state", state: this.state }));
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type !== "update") return;

    this.state = {
      videoId: msg.videoId,
      trackName: msg.trackName || "",
      position: msg.position || 0,
      isPlaying: !!msg.isPlaying,
      updatedAt: Date.now(),
    };

    // broadcast to everyone in the room, including the sender —
    // keeps one code path for "apply state" on every client
    this.room.broadcast(JSON.stringify({ type: "state", state: this.state }));
  }

  // debug: GET /parties/main/<roomId> returns current state as JSON
  onRequest(req: Party.Request) {
    return new Response(JSON.stringify(this.state), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

VibeServer satisfies Party.Worker;

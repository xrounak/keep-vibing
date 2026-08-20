# Raat Ka Safar — Architecture

## System overview

```mermaid
flowchart TB
    subgraph Browser_A["Browser A — Sharer"]
        A_UI["Next.js Player UI\n(app/Player.js)"]
        A_YT["YouTube IFrame Player\n(audio-only, hidden)"]
        A_SOCK["PartySocket client\n(app/vibeStore.js)"]
    end

    subgraph Browser_B["Browser B — Listener"]
        B_UI["Next.js Player UI"]
        B_YT["YouTube IFrame Player"]
        B_SOCK["PartySocket client"]
    end

    subgraph PartyKit["PartyKit — Cloudflare edge"]
        Room["Room instance\nroom id = share code\n(party/server.ts)"]
        State[("In-memory state\n{videoId, position,\nisPlaying, updatedAt}")]
    end

    YTCDN["YouTube CDN\n(video + audio stream)"]

    A_UI --> A_YT
    A_YT <-->|"stream"| YTCDN
    A_UI -->|"play/pause/seek"| A_SOCK
    A_SOCK <==>|"wss://.../parties/main/CODE"| Room
    Room --> State
    Room <==>|"wss://.../parties/main/CODE"| B_SOCK
    B_SOCK --> B_UI
    B_UI --> B_YT
    B_YT <-->|"stream"| YTCDN

    style Room fill:#e2a63b,color:#1a1210
    style State fill:#2c211b,color:#f5ead2
```

**Key point, same as the original spec:** no audio ever passes through any server we run. YouTube's IFrame API streams directly CDN → browser for both sharer and listener. PartyKit only carries tiny JSON state messages (`videoId`, `position`, `isPlaying`, `updatedAt`) — never audio.

---

## Component map

```mermaid
flowchart LR
    subgraph Client["Client (per browser tab)"]
        Player["Player.js\n• chip/mood modal\n• controls, seek\n• keyboard shortcuts\n• scene/accent swap"]
        Store["vibeStore.js\n• joinRoom()\n• sendState()\n• drift/stale constants"]
        Player --> Store
    end

    subgraph Server["party/server.ts (PartyKit)"]
        Conn["onConnect\n→ send last-known state\n(late-join snapshot)"]
        Msg["onMessage\n→ stamp updatedAt\n→ save to this.state\n→ broadcast to room"]
        Req["onRequest\n→ debug JSON dump\nGET /parties/main/:room"]
    end

    Store -->|"PartySocket(host, room=code)"| Conn
    Store -->|"send({type:'update',...})"| Msg
    Msg -->|"broadcast({type:'state',...})"| Store
```

---

## Room lifecycle (sequence)

```mermaid
sequenceDiagram
    participant A as Sharer tab
    participant PK as PartyKit room<br/>(room id = share code)
    participant B as Listener tab

    Note over PK: Room does not exist yet

    A->>PK: connect wss://.../parties/main/CODE
    activate PK
    Note over PK: Room instance created,<br/>state = null
    PK-->>A: (no state yet — nothing to send)

    A->>PK: send {type:"update", videoId, position, isPlaying}
    Note over PK: state = {...}, updatedAt = now()
    PK-->>A: broadcast {type:"state", state}

    Note over A,B: Sharer keeps sending updates<br/>every 4s + on play/pause/seek/track-change

    B->>PK: connect wss://.../parties/main/CODE
    Note over PK: late-join snapshot
    PK-->>B: {type:"state", state}
    Note over B: expectedPosition = position + (now - updatedAt)/1000<br/>loadVideoById(videoId, expectedPosition)

    A->>PK: send {type:"update", ...} (periodic)
    PK-->>A: broadcast
    PK-->>B: broadcast
    Note over B: drift correction:<br/>seekTo() only if drift > 3s

    A--xPK: tab closed, connection drops
    B--xPK: tab closed, connection drops
    deactivate PK
    Note over PK: room idle → eventually destroyed,<br/>state freed (nothing persisted)
```

---

## State shape (wire format)

Client → server:
```json
{ "type": "update", "videoId": "...", "trackName": "...", "position": 87.4, "isPlaying": true }
```

Server → all clients in room (including sender):
```json
{ "type": "state", "state": { "videoId": "...", "trackName": "...", "position": 87.4, "isPlaying": true, "updatedAt": 1755680000000 } }
```

`updatedAt` is stamped server-side on every message — clients never set it, so clock skew between browsers can't corrupt the drift-correction math.

---

## Why PartyKit over the original localStorage/BroadcastChannel stub

The first pass ([app/vibeStore.js](app/vibeStore.js) originally) used `localStorage` + `BroadcastChannel` to fake a shared store — worked for testing in multiple tabs on one machine, but BroadcastChannel doesn't cross devices or networks. PartyKit swaps that stub for a real WebSocket room per share code, hosted on Cloudflare's edge — same interface shape (`connect / send / receive`), zero change to the sync algorithm (drift correction, play/pause propagation, stale detection all untouched from the original spec).

## Dev vs prod

| | Command | Host |
|---|---|---|
| Local dev | `npx partykit dev` | `127.0.0.1:1999` |
| Production | `npx partykit deploy` | `raat-ka-safar-vibe.<username>.partykit.dev` |

Client picks host from `NEXT_PUBLIC_PARTYKIT_HOST` ([.env.local](.env.local)) — defaults to the local dev host, swap it after your first `partykit deploy`.

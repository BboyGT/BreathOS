/**
 * ws-server.ts — BreatheOS WebSocket Server
 * Handles the "Breathe Together" multiplayer feature.
 *
 * Run: bun run ws  (or: npx ts-node ws-server.ts)
 * Port: 4001 (configurable via PORT env var)
 */

import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.PORT ?? "4001", 10);

interface Client {
  ws: WebSocket;
  userId: string;
  roomId: string;
}

const rooms = new Map<string, Set<Client>>();

function getRoomClients(roomId: string): Set<Client> {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId)!;
}

function broadcast(roomId: string, data: object, excludeUserId?: string) {
  const clients = getRoomClients(roomId);
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function getPeerIds(roomId: string): string[] {
  return Array.from(getRoomClients(roomId)).map((c) => c.userId);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`[BreatheOS WS] Server running on ws://localhost:${PORT}`);
});

wss.on("connection", (ws: WebSocket) => {
  let client: Client | null = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "join") {
        const { userId, roomId } = msg;
        if (!userId || !roomId) return;

        // Register this client
        client = { ws, userId, roomId };
        const roomClients = getRoomClients(roomId);
        roomClients.add(client);

        // Tell the joiner about all current peers
        const peers = getPeerIds(roomId);
        ws.send(JSON.stringify({ type: "peer_joined", peers, roomId }));

        // Tell existing peers that someone joined
        broadcast(roomId, { type: "peer_joined", peers, roomId }, userId);
        console.log(`[WS] ${userId} joined room ${roomId} (${roomClients.size} in room)`);
      }

      if (msg.type === "phase" && client) {
        broadcast(client.roomId, {
          type: "phase",
          userId: client.userId,
          phase: msg.phase,
          count: msg.count,
        }, client.userId);
      }

      if (msg.type === "leave" && client) {
        leaveRoom(client);
        client = null;
      }
    } catch (err) {
      console.error("[WS] Parse error:", err);
    }
  });

  ws.on("close", () => {
    if (client) leaveRoom(client);
  });

  ws.on("error", (err) => {
    console.error("[WS] Socket error:", err.message);
  });
});

function leaveRoom(c: Client) {
  const roomClients = getRoomClients(c.roomId);
  roomClients.delete(c);
  if (roomClients.size === 0) {
    rooms.delete(c.roomId);
  } else {
    const peers = getPeerIds(c.roomId);
    broadcast(c.roomId, { type: "peer_left", userId: c.userId, peers });
  }
  console.log(`[WS] ${c.userId} left room ${c.roomId}`);
}

process.on("SIGTERM", () => {
  wss.close(() => process.exit(0));
});

/**
 * BreatheOS WebSocket Server
 * Handles the "Breathe Together" multiplayer feature.
 *
 * Run: npm run ws
 * Port: 4001 (configurable via PORT env var)
 */

const { WebSocketServer, WebSocket } = require("ws");

const PORT = parseInt(process.env.PORT || "4001", 10);
const rooms = new Map();

function getRoomClients(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId);
}

function broadcast(roomId, data, excludeUserId) {
  const clients = getRoomClients(roomId);
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(msg);
  }
}

function getPeerIds(roomId) {
  return Array.from(getRoomClients(roomId)).map((client) => client.userId);
}

function leaveRoom(client) {
  const roomClients = getRoomClients(client.roomId);
  roomClients.delete(client);
  if (roomClients.size === 0) {
    rooms.delete(client.roomId);
  } else {
    const peers = getPeerIds(client.roomId);
    broadcast(client.roomId, { type: "peer_left", userId: client.userId, peers });
  }
  console.log(`[WS] ${client.userId} left room ${client.roomId}`);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`[BreatheOS WS] Server running on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  let client = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "join") {
        const { userId, roomId } = msg;
        if (!userId || !roomId) return;

        client = { ws, userId, roomId };
        const roomClients = getRoomClients(roomId);
        roomClients.add(client);

        const peers = getPeerIds(roomId);
        ws.send(JSON.stringify({ type: "peer_joined", peers, roomId }));
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

process.on("SIGTERM", () => {
  wss.close(() => process.exit(0));
});

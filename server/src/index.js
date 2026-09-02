import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import express from "express";
import { Server } from "socket.io";
import { createStore } from "./db/store.js";
import { World } from "./world.js";
import { isBlocked } from "./map.js";

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = await createStore();
const world = new World();
const app = express();
app.use(express.json());

app.get("/api/map", (_req, res) => res.json(world.map));
app.get("/api/channels", async (_req, res) => res.json(await store.channels()));
app.get("/api/health", (_req, res) => res.json({ ok: true, online: world.players.size }));

// Em produção serve o build do cliente
const dist = path.resolve(__dirname, "../../client/dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: [ORIGIN, /localhost/], credentials: true } });

const socketsByUser = new Map(); // userId -> socket
const lastVoice = new Map();     // userId -> JSON do último grupo enviado
const COLORS = ["#ffffff", "#c9c9c9", "#9a9a9a", "#e8e0d0", "#d6d6d6", "#b5b5b5"];

// Avatar: índices inteiros dentro dos limites (pele 5, cabelo 5, cor 6, camisa 8, acessório 4)
const AVATAR_MAX = { skin: 5, hair: 5, hairColor: 6, shirt: 8, accessory: 4 };
function sanitizeAvatar(a) {
  const out = {};
  for (const k of Object.keys(AVATAR_MAX)) {
    const v = a && Number.isInteger(a[k]) && a[k] >= 0 && a[k] < AVATAR_MAX[k] ? a[k] : 0;
    out[k] = v;
  }
  if (!a) out.skin = 1;
  return out;
}

function sanitizeName(n) {
  return String(n || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 24) || "visitante";
}

io.on("connection", (socket) => {
  let user = null;

  socket.on("join", async ({ name, userId, color, avatar, pos } = {}, ack) => {
    if (user) return;
    const id = (typeof userId === "string" && /^[a-z0-9-]{8,40}$/.test(userId)) ? userId : crypto.randomUUID();
    // uma sessão por usuário
    const prev = socketsByUser.get(id);
    if (prev && prev.id !== socket.id) { prev.emit("kicked", "Você entrou em outra aba."); prev.disconnect(true); }
    user = { id, name: sanitizeName(name), color: /^#[0-9a-f]{6}$/i.test(color || "") ? color : COLORS[0], avatar: sanitizeAvatar(avatar) };
    await store.upsertUser(user);
    socketsByUser.set(id, socket);
    const p = world.add(user, socket.id);
    socket.join("world");
    // reconexão: volta pra onde estava
    const { x, y } = pos || {};
    if (Number.isFinite(x) && Number.isFinite(y) && !isBlocked(world.map, Math.floor(x), Math.floor(y))) { p.x = x; p.y = y; world.updateZone(p); }
    const channels = await store.channels();
    ack?.({ user, map: world.map, channels, players: world.snapshot() });
    io.to("world").emit("system", { text: `${user.name} entrou.` });
    pushVoice();
  });

  socket.on("move", ({ x, y, dir, moving } = {}) => {
    if (!user) return;
    if (world.move(user.id, x, y, dir, moving)) pushVoice();
  });

  // Ir direto pra uma sala pela sidebar
  socket.on("teleport", ({ x, y } = {}) => {
    if (!user) return;
    const p = world.players.get(user.id);
    if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (isBlocked(world.map, Math.floor(x), Math.floor(y))) return;
    p.x = x; p.y = y; p.moving = false;
    world.updateZone(p);
    pushVoice();
  });

  socket.on("profile", ({ status, muted, presence, avatar } = {}) => {
    if (!user) return;
    const p = world.players.get(user.id);
    if (!p) return;
    if (avatar) p.avatar = user.avatar = sanitizeAvatar(avatar);
    if (typeof status === "string") p.status = status.slice(0, 40);
    if (typeof muted === "boolean") p.muted = muted;
    if (["available", "busy", "focus"].includes(presence)) { p.presence = presence; pushVoice(); }
  });

  socket.on("speaking", (on) => {
    if (!user) return;
    const p = world.players.get(user.id);
    if (p) p.speaking = !!on;
  });

  // Quadro compartilhado (objeto "board" do mapa)
  socket.on("board:get", async ({ id } = {}, ack) => {
    if (!user || typeof id !== "string") return;
    ack?.(await store.getBoard(id));
  });
  socket.on("board:set", async ({ id, content } = {}) => {
    if (!user || typeof id !== "string" || typeof content !== "string") return;
    if (!world.map.objects.some((o) => o.id === id && o.kind === "board")) return;
    content = content.slice(0, 20000);
    await store.setBoard(id, content);
    socket.to("world").emit("board:update", { id, content, by: user.name });
  });

  // Canal de voz estilo Discord: entra/sai independente da posição no mapa
  socket.on("voice:channel", async ({ channelId } = {}) => {
    if (!user) return;
    const p = world.players.get(user.id);
    if (!p) return;
    if (channelId) {
      const ch = (await store.channels()).find((c) => c.id === channelId && c.kind === "voice");
      if (!ch) return;
      p.voiceChannel = ch.id;
    } else p.voiceChannel = null;
    pushVoice();
  });

  socket.on("chat:history", async ({ channelId } = {}, ack) => {
    if (!user || typeof channelId !== "string") return;
    ack?.(await store.history(channelId));
  });

  socket.on("chat:send", async ({ channelId, body } = {}) => {
    if (!user) return;
    body = String(body || "").trim().slice(0, 1000);
    if (!body || typeof channelId !== "string") return;
    const p = world.players.get(user.id);
    if (channelId.startsWith("zone:")) {
      // chat local: só quem está na sala
      if (!p || "zone:" + p.zone !== channelId) return;
    } else {
      const ok = (await store.channels()).some((c) => c.id === channelId && c.kind === "text");
      if (!ok) return;
    }
    const msg = await store.addMessage({ channel_id: channelId, user_id: user.id, user_name: user.name, user_color: user.color, body });
    if (channelId.startsWith("zone:")) {
      for (const q of world.players.values()) if ("zone:" + q.zone === channelId) socketsByUser.get(q.id)?.emit("chat:message", msg);
    } else io.to("world").emit("chat:message", msg);
  });

  // Balão de fala rápido (aparece sobre o avatar de quem está perto)
  socket.on("bubble", ({ text } = {}) => {
    if (!user) return;
    text = String(text || "").trim().slice(0, 120);
    if (text) io.to("world").emit("bubble", { userId: user.id, text });
  });

  // Sinalização WebRTC (relay puro)
  socket.on("rtc:signal", ({ to, data } = {}) => {
    if (!user || typeof to !== "string") return;
    socketsByUser.get(to)?.emit("rtc:signal", { from: user.id, data });
  });

  socket.on("disconnect", () => {
    if (!user) return;
    if (socketsByUser.get(user.id) === socket) {
      socketsByUser.delete(user.id);
      lastVoice.delete(user.id);
      world.remove(user.id);
      io.to("world").emit("system", { text: `${user.name} saiu.` });
      pushVoice();
    }
  });
});

// Broadcast de posições a 12Hz; bichos simulados no mesmo tick
setInterval(() => {
  world.tickNpcs(1 / 12);
  if (world.players.size) { io.to("world").emit("state", world.snapshot()); io.to("world").emit("npcs", world.npcSnapshot()); }
}, 1000 / 12);

// Recalcula grupos de voz e envia só pra quem mudou
function pushVoice() {
  const groups = world.voiceGroups();
  for (const [uid, g] of groups) {
    const key = JSON.stringify(g);
    if (lastVoice.get(uid) === key) continue;
    lastVoice.set(uid, key);
    socketsByUser.get(uid)?.emit("voice:group", g);
  }
}

server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));

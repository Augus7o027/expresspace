import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import express from "express";
import { Server } from "socket.io";
import { createStore } from "./db/store.js";
import { World } from "./world.js";
import { WORLD, parseTiled, loadTiled, isBlocked, UPLOADED_MAP } from "./map.js";
import { accountsRepo, bootstrapAdmin, sessionFromCookie, setSessionCookie, clearSessionCookie, ROLES } from "./auth.js";
import { agentsRepo, runAgent, startScheduler, chatCompletion, TOOL_NAMES } from "./agents.js";
import { parseYouTube, videoInfo, searchYouTube, refineQuery, speakersRepo } from "./speaker.js";
import { notifyRepo } from "./notify.js";
import { securityHeaders, rateLimiter, socketLimiter, originCheck, v } from "./security.js";
import { liveEnabled, recordingEnabled, liveInfo, roomFor, tokenFor, setCanPublish, kick as liveKick, startRecording, stopRecording, parseWebhook } from "./live.js";
import { eventsRepo, startEventClock, REMIND_MIN } from "./events.js";
import { libraryRepo, saveUpload, uploadPath, removeUpload, embedUrl, TYPES, TYPE_LABEL } from "./library.js";

const PORT = Number(process.env.PORT || 3000);
// Servidores ICE: STUN do Google + TURN (TURN_URL="turn:host:3478,turns:host:5349", TURN_USER, TURN_PASS).
// Sem TURN configurado, usa o relay público gratuito do OpenRelay como quebra-galho (redes fechadas, 4G com CGNAT).
const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
if (process.env.TURN_URL) ICE_SERVERS.push({ urls: process.env.TURN_URL.split(",").map((s) => s.trim()).filter(Boolean), username: process.env.TURN_USER || "", credential: process.env.TURN_PASS || "" });
else ICE_SERVERS.push({ urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443"], username: "openrelayproject", credential: "openrelayproject" });
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const SECURE = /^https:/.test(ORIGIN);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = await createStore();
const accounts = accountsRepo(store);
const agents = agentsRepo(store);
const library = libraryRepo(store);
const speakers = speakersRepo(store);
const notify = await notifyRepo(store, { subject: "mailto:" + (process.env.ADMIN_EMAIL || "admin@expresspace.local") });
const events = eventsRepo(store);
// moderação: banidos (contas e visitantes) + log
const bans = { list: async () => store.listDocs("bans"), get: (id) => store.getDoc("bans", id), add: (id, data) => store.putDoc("bans", id, data), remove: (id) => store.delDoc("bans", id) };
const modlog = async (entry) => { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await store.putDoc("modlog", id, { ...entry, at: new Date().toISOString() }); };
await bootstrapAdmin(accounts);

// ---------- configurações e ajustes do mundo (persistidos) ----------
const DEFAULT_SETTINGS = { communityName: "ExpresSpace", allowGuests: true, allowRegister: false };
const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await store.getDoc("settings", "main") || {}) });
const getOverrides = async () => (await store.getDoc("world", "overrides")) || { locked: [], objects: {}, decor: {}, npcs: null };

const world = new World();
world.setMap(WORLD, await getOverrides());
world.setAgents(await agents.list());

const app = express();
app.set("trust proxy", 1);
// ---------- blindagem básica ----------
app.use(securityHeaders({ secure: SECURE, connect: [process.env.LIVEKIT_URL] }));
app.use(originCheck([ORIGIN]));                       // POST/PUT/DELETE só da própria origem (CSRF)
app.use("/api", rateLimiter({ windowMs: 60000, max: 600 }));  // teto geral por IP
const authLimiter = rateLimiter({ windowMs: 10 * 60000, max: 12, message: "muitas tentativas de login; aguarde 10 minutos" });
const writeLimiter = rateLimiter({ windowMs: 60000, max: 60, message: "calma: muitas alterações por minuto" });
app.use(express.json({ limit: "1mb" }));              // o mapa do Tiled tem limite próprio na rota dele
app.use((err, _req, res, next) => { if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") return res.status(400).json({ error: "corpo inválido ou grande demais" }); next(err); });

// ---------- helpers ----------
// sessão válida = cookie assinado + mesma "versão" da conta (troca de senha/ban invalida sessões antigas)
const sessionUser = async (req) => { const s = sessionFromCookie(req.headers.cookie); if (!s) return null; const raw = await accounts.get(s.uid); if (!raw || (raw.sv || 0) !== (s.sv || 0)) return null; return accounts.pub(raw); };
const requireRole = (...roles) => async (req, res, next) => {
  const u = await sessionUser(req);
  if (!u || !roles.includes(u.role)) return res.status(401).json({ error: "sem permissão" });
  if (u.role !== "admin" && await bans.get(u.id)) return res.status(403).json({ error: "conta banida" });
  req.user = u; next();
};
const admin = requireRole("admin");
const staff = requireRole("admin", "professor");
const member = requireRole(...ROLES);
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));

// ---------- API pública ----------
app.get("/api/map", (_req, res) => res.json(world.map));
app.get("/api/channels", async (_req, res) => res.json(await store.channels()));
app.get("/api/health", (_req, res) => res.json({ ok: true, online: world.players.size }));
app.get("/api/auth/config", wrap(async (_req, res) => { const s = await getSettings(); res.json({ communityName: s.communityName, allowGuests: s.allowGuests, allowRegister: s.allowRegister }); }));
app.get("/api/auth/me", wrap(async (req, res) => res.json({ user: await sessionUser(req) })));
// preferências da própria conta (lembretes por e-mail, tour feito)
app.put("/api/auth/prefs", wrap(async (req, res) => {
  const u = await sessionUser(req); if (!u) return res.status(401).json({ error: "faça login" });
  const b = req.body || {}; const patch = {};
  if (typeof b.reminders === "boolean") patch.reminders = b.reminders;
  if (typeof b.tourDone === "boolean") patch.tourDone = b.tourDone;
  res.json({ user: await accounts.update(u.id, patch) });
}));
// agenda (todo mundo lê; equipe edita)
app.get("/api/events", wrap(async (_req, res) => res.json({ events: await events.upcoming(), remindMin: REMIND_MIN, mail: notify.mailEnabled })));
// push: chave pública + assinatura (conta ou visitante)
app.get("/api/push/key", (_req, res) => res.json({ key: notify.publicKey }));
app.post("/api/push/subscribe", writeLimiter, wrap(async (req, res) => {
  const u = await sessionUser(req); // só contas: visitante não assina push (o id de visitante é público no estado do mapa)
  if (!u) return res.status(401).json({ error: "notificações push são só pra quem tem conta" });
  res.json({ ok: true, id: await notify.subscribe(u.id, req.body?.subscription, req.headers["user-agent"]) });
}));
app.post("/api/push/unsubscribe", wrap(async (req, res) => { await notify.unsubscribe(String(req.body?.endpoint || "")); res.json({ ok: true }); }));
app.post("/api/auth/login", authLimiter, wrap(async (req, res) => {
  const u = await accounts.login(v.str(req.body?.email, 254), v.str(req.body?.password, 200));
  if (!u) return res.status(401).json({ error: "e-mail ou senha inválidos" });
  if (u.role !== "admin" && await bans.get(u.id)) return res.status(403).json({ error: "esta conta foi removida do espaço" });
  setSessionCookie(res, u, SECURE); res.json({ user: u });
}));
app.post("/api/auth/logout", (_req, res) => { clearSessionCookie(res); res.json({ ok: true }); });
app.post("/api/auth/register", authLimiter, wrap(async (req, res) => {
  if (!(await getSettings()).allowRegister) return res.status(403).json({ error: "cadastro fechado. Peça acesso a um admin." });
  const u = await accounts.create({ email: req.body?.email, name: req.body?.name, password: req.body?.password, role: "member" });
  setSessionCookie(res, u, SECURE); res.json({ user: u });
}));
app.post("/api/auth/avatar", wrap(async (req, res) => {
  const u = await sessionUser(req); if (!u) return res.status(401).json({ error: "faça login" });
  res.json({ user: await accounts.update(u.id, { avatar: req.body?.avatar || null, name: req.body?.name }) });
}));

// ---------- API admin ----------
app.get("/api/admin/overview", admin, wrap(async (_req, res) => res.json({
  online: world.snapshot(), settings: await getSettings(), locked: [...world.locked], zones: world.map.zones,
  objects: world.map.objects, decor: world.map.decor, npcs: world.map.npcs, agents: (await agents.list()).length, users: (await accounts.list()).length,
  mapFile: world.map.tiledFile, uploadedMap: existsSync(UPLOADED_MAP), tools: TOOL_NAMES, channels: await store.channels(), content: (await library.list()).length,
})));
app.put("/api/admin/settings", admin, wrap(async (req, res) => {
  const cur = await getSettings(); const b = req.body || {};
  const next = { ...cur, communityName: String(b.communityName ?? cur.communityName).slice(0, 40), allowGuests: !!b.allowGuests, allowRegister: !!b.allowRegister };
  await store.putDoc("settings", "main", next); res.json(next);
}));

// usuários
app.get("/api/admin/events", staff, wrap(async (_req, res) => res.json(await events.list())));
app.post("/api/admin/events", staff, wrap(async (req, res) => { const e = await events.put(req.body || {}, req.user.id); io.to("world").emit("events:changed"); res.json(e); }));
app.delete("/api/admin/events/:id", staff, wrap(async (req, res) => { await events.remove(req.params.id); io.to("world").emit("events:changed"); res.json({ ok: true }); }));
app.get("/api/admin/moderation", staff, wrap(async (_req, res) => {
  const log = (await store.listDocs("modlog")).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  res.json({ log, bans: await bans.list(), mailEnabled: notify.mailEnabled, remindMin: REMIND_MIN });
}));
app.delete("/api/admin/bans/:id", staff, wrap(async (req, res) => { await bans.remove(req.params.id); await modlog({ action: "unban", by: req.user.id, byName: req.user.name, targetId: req.params.id }); res.json({ ok: true }); }));
app.get("/api/admin/users", admin, wrap(async (_req, res) => res.json(await accounts.list())));
app.post("/api/admin/users", admin, wrap(async (req, res) => res.json(await accounts.create(req.body || {}))));
app.put("/api/admin/users/:id", admin, wrap(async (req, res) => res.json(await accounts.update(req.params.id, req.body || {}))));
app.delete("/api/admin/users/:id", admin, wrap(async (req, res) => { if (req.params.id === req.user.id) throw new Error("não dá pra apagar a própria conta"); await accounts.remove(req.params.id); res.json({ ok: true }); }));

// provedores e agentes
app.get("/api/admin/providers", admin, wrap(async (_req, res) => res.json(await agents.listProviders())));
app.post("/api/admin/providers", admin, wrap(async (req, res) => res.json(await agents.putProvider(req.body || {}))));
app.delete("/api/admin/providers/:id", admin, wrap(async (req, res) => { await agents.delProvider(req.params.id); res.json({ ok: true }); }));
app.post("/api/admin/providers/:id/test", admin, wrap(async (req, res) => {
  const p = await agents.getProvider(req.params.id); if (!p) throw new Error("provedor não existe");
  const model = req.body?.model || p.models[0]; if (!model) throw new Error("informe um modelo");
  const t0 = Date.now();
  const m = await chatCompletion(p, model, [{ role: "user", content: "Responda só: ok" }], { max_tokens: 20 });
  res.json({ ok: true, ms: Date.now() - t0, reply: m.content });
}));
app.get("/api/admin/agents", admin, wrap(async (_req, res) => res.json(await agents.list())));
app.post("/api/admin/agents", admin, wrap(async (req, res) => { const a = await agents.put(req.body || {}); world.setAgents(await agents.list()); res.json(a); }));
app.delete("/api/admin/agents/:id", admin, wrap(async (req, res) => { await agents.del(req.params.id); world.setAgents(await agents.list()); res.json({ ok: true }); }));
app.post("/api/admin/agents/:id/test", admin, wrap(async (req, res) => {
  const a = await agents.get(req.params.id); if (!a) throw new Error("agente não existe");
  const p = a.providerId && await agents.getProvider(a.providerId); if (!p) throw new Error("agente sem provedor");
  const r = await runAgent({ agent: a, provider: p, history: [], userMessage: String(req.body?.message || "Se apresente em uma frase.") });
  res.json(r);
}));
app.post("/api/admin/agents/:id/run-schedule", admin, wrap(async (req, res) => {
  const a = await agents.get(req.params.id); if (!a?.schedule?.prompt) throw new Error("agente sem agenda");
  const p = a.providerId && await agents.getProvider(a.providerId); if (!p) throw new Error("agente sem provedor");
  const r = await runAgent({ agent: a, provider: p, history: [], userMessage: a.schedule.prompt });
  if (r.content) await postAsAgent(a.schedule.channel, a, r.content);
  await agents.put({ ...a, lastRun: new Date().toISOString() });
  res.json(r);
}));

// mundo: trancas, posições, bichos, mapa
app.put("/api/admin/world", admin, wrap(async (req, res) => {
  const cur = await getOverrides(); const b = req.body || {};
  const next = {
    locked: Array.isArray(b.locked) ? b.locked.filter((id) => world.map.zones.some((z) => z.id === id)) : cur.locked,
    objects: b.objects && typeof b.objects === "object" ? Object.fromEntries(Object.keys({ ...cur.objects, ...b.objects }).map((id) => [id, { ...(cur.objects?.[id] || {}), ...(b.objects[id] || {}) }])) : cur.objects,
    decor: b.decor && typeof b.decor === "object" ? b.decor : cur.decor,
    npcs: Array.isArray(b.npcs) ? b.npcs.filter((n) => ["fox", "hare", "deer", "boar", "grouse", "seller", "customer"].includes(n.kind) && world.map.zones.some((z) => z.id === n.zone)).slice(0, 30) : cur.npcs,
  };
  await store.putDoc("world", "overrides", next);
  world.setMap(loadTiled(), next);
  world.setAgents(await agents.list());
  io.to("world").emit("world:changed", { locked: [...world.locked], reload: !!(b.objects || b.decor) });
  res.json({ ok: true, locked: [...world.locked] });
}));
app.post("/api/admin/map", admin, express.json({ limit: "8mb" }), wrap(async (req, res) => {
  const t = req.body;
  if (!t || t.type !== "map" || !Array.isArray(t.layers)) throw new Error("envie o JSON exportado do Tiled");
  const parsed = parseTiled(t, "sede.json"); // valida
  if (!parsed.zones.length) throw new Error("mapa sem zonas (camada de objetos 'zones')");
  mkdirSync(path.dirname(UPLOADED_MAP), { recursive: true });
  writeFileSync(UPLOADED_MAP, JSON.stringify(t));
  // o cliente também precisa do arquivo: servimos o enviado em /maps/sede.json
  world.setMap(loadTiled(), await getOverrides());
  world.setAgents(await agents.list());
  io.to("world").emit("world:changed", { reload: true });
  res.json({ ok: true, zones: parsed.zones.map((z) => z.id) });
}));

// ---------- biblioteca (área de membros) ----------
// membros: só publicados e dentro da visibilidade; progresso por conta
app.get("/api/library", member, wrap(async (req, res) => {
  const items = (await library.visibleFor(req.user)).map((it) => ({ ...it, embed: embedUrl(it.video) }));
  res.json({ items, progress: await library.progress(req.user.id), types: TYPES, typeLabel: TYPE_LABEL, user: req.user });
}));
app.post("/api/library/:id/done", member, wrap(async (req, res) => {
  const it = await library.get(req.params.id); if (!it || !it.published) throw new Error("conteúdo não existe");
  res.json({ done: await library.setDone(req.user.id, it.id, !!req.body?.done) });
}));
// arquivos hospedados: só quem tem conta
app.get("/files/:name", member, (req, res) => {
  const p = uploadPath(req.params.name); if (!p) return res.status(404).json({ error: "arquivo não existe" });
  // só imagem/vídeo/áudio/pdf abrem no navegador; o resto baixa (um .html ou .svg enviado nunca roda como página do app)
  const inline = /\.(png|jpe?g|gif|webp|mp4|webm|mp3|m4a|ogg|wav|pdf)$/i.test(p);
  res.setHeader("Content-Disposition", (inline ? "inline" : "attachment") + `; filename="${path.basename(p).replace(/[^\w.-]/g, "_")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(p);
});
// gestão: admin e professores
app.get("/api/admin/content", staff, wrap(async (_req, res) => res.json({ items: await library.list(), types: TYPES, typeLabel: TYPE_LABEL })));
app.post("/api/admin/content", staff, wrap(async (req, res) => res.json(await library.put(req.body || {}, req.user))));
app.delete("/api/admin/content/:id", staff, wrap(async (req, res) => { await library.del(req.params.id); res.json({ ok: true }); }));
app.post("/api/admin/uploads", staff, express.raw({ type: () => true, limit: process.env.MAX_UPLOAD_MB ? `${process.env.MAX_UPLOAD_MB}mb` : "500mb" }), wrap(async (req, res) => {
  const name = decodeURIComponent(String(req.query.name || "arquivo"));
  res.json(saveUpload(name, req.body));
}));
app.delete("/api/admin/uploads/:name", staff, (req, res) => { removeUpload(req.params.name); res.json({ ok: true }); });

// LiveKit avisa aqui quando uma gravação termina: vira aula na biblioteca
app.post("/api/live/webhook", express.raw({ type: () => true, limit: "1mb" }), wrap(async (req, res) => {
  if (!liveEnabled()) return res.status(404).json({ error: "live desligado" });
  let ev; try { ev = await parseWebhook(req.body.toString("utf8"), req.headers.authorization); } catch { return res.status(401).json({ error: "assinatura inválida" }); }
  if (ev.event === "egress_ended" || ev.event === "egress_failed") {
    const rec = [...recordings.values()].find((r) => r.egressId === ev.egressInfo?.egressId);
    if (rec) recordings.delete(rec.room);
    if (ev.event === "egress_ended" && rec) {
      const file = ev.egressInfo?.fileResults?.[0];
      const url = file?.location || rec.url;
      if (url) {
        const it = await library.put({ type: "aula", title: rec.title, category: "Aulas ao vivo", summary: `Gravação de ${new Date(rec.startedAt).toLocaleString("pt-BR", { timeZone: process.env.TZ_DISPLAY || "America/Sao_Paulo" })}`, video: url, published: true, visibility: "member" }, { id: rec.by, name: rec.byName });
        io.to("world").emit("toast", `Gravação "${rec.title}" já está na biblioteca.`);
        console.log("[live] gravação salva na biblioteca:", it.id, url);
      }
    } else if (rec) console.warn("[live] gravação falhou:", ev.egressInfo?.error);
    io.to("world").emit("live:recording", { room: rec?.room, on: false });
  }
  res.json({ ok: true });
}));

// mapa enviado pelo painel tem prioridade sobre o do build
app.get("/maps/sede.json", (_req, res, next) => existsSync(UPLOADED_MAP) ? res.sendFile(UPLOADED_MAP) : next());

// Em produção serve o build do cliente
const dist = path.resolve(__dirname, "../../client/dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/admin", (_req, res) => res.sendFile(path.join(dist, "admin.html")));
  app.get("/membros", (_req, res) => res.sendFile(path.join(dist, "membros.html")));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: [ORIGIN, /localhost/], credentials: true } });

const socketsByUser = new Map(); // userId -> socket
const liveRoom = new Map();      // userId -> { room, canPublish } (sala do LiveKit em que a pessoa está)
const recordings = new Map();    // room -> { egressId, title, by, byName, startedAt, url }
const mutes = new Map();         // userId -> timestamp até quando está silenciado pela equipe
const lastVoice = new Map();     // userId -> JSON do último grupo enviado
const COLORS = ["#ffffff", "#c9c9c9", "#9a9a9a", "#e8e0d0", "#d6d6d6", "#b5b5b5"];

const AVATAR_MAX = { skin: 8, hair: 9, hairColor: 10, shirt: 12, accessory: 8, body: 2, outfit: 4, pants: 8, shoes: 6 };
function sanitizeAvatar(a) {
  const out = {};
  for (const k of Object.keys(AVATAR_MAX)) out[k] = a && Number.isInteger(a[k]) && a[k] >= 0 && a[k] < AVATAR_MAX[k] ? a[k] : 0;
  if (!a) out.skin = 1;
  return out;
}
function sanitizeName(n) {
  return String(n || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 24) || "visitante";
}

async function postAsAgent(channelId, agent, body) {
  const msg = await store.addMessage({ channel_id: channelId, user_id: "agent:" + agent.id, user_name: agent.name, user_color: "#9ad0ff", body: String(body).slice(0, 4000) });
  io.to("world").emit("chat:message", msg);
}

io.on("connection", (socket) => {
  let user = null;
  const busy = { agent: false };

  socket.on("join", async ({ name, userId, color, avatar, pos } = {}, ack) => {
    if (user) return;
    const settings = await getSettings();
    // conta logada (cookie) tem prioridade; senão visitante, se permitido
    const sess = sessionFromCookie(socket.handshake.headers.cookie);
    const acc = sess ? accounts.pub(await accounts.get(sess.uid)) : null;
    if (!acc && !settings.allowGuests) return ack?.({ error: "Entrada só com conta. Faça login." });
    const id = acc ? acc.id : (typeof userId === "string" && /^[a-z0-9-]{8,40}$/.test(userId)) ? userId : crypto.randomUUID();
    const ban = await bans.get(id); if (ban && acc?.role !== "admin") return ack?.({ error: "Você foi removido deste espaço" + (ban.reason ? ": " + ban.reason : ".") });
    const prev = socketsByUser.get(id);
    if (prev && prev.id !== socket.id) { prev.emit("kicked", "Você entrou em outra aba."); prev.disconnect(true); }
    const premium = !!acc && (acc.premium || acc.role !== "member");
    user = {
      id, name: acc ? acc.name : sanitizeName(name), color: /^#[0-9a-f]{6}$/i.test(color || "") ? color : COLORS[0],
      avatar: sanitizeAvatar(avatar || acc?.avatar), role: acc ? acc.role : "guest", accountId: acc?.id || null, premium,
      tourDone: !!acc?.tourDone, reminders: acc ? acc.reminders !== false : false,
    };
    if (user.avatar.body === 1 && !premium) user.avatar.body = 0; // corpo orc é skin premium
    if (acc && avatar) accounts.update(acc.id, { avatar: user.avatar }).catch(() => {});
    await store.upsertUser(user);
    socketsByUser.set(id, socket);
    const p = world.add(user, socket.id);
    socket.join("world");
    const { x, y } = pos || {};
    if (Number.isFinite(x) && Number.isFinite(y) && world.canEnter(p, Math.floor(x), Math.floor(y))) { p.x = x; p.y = y; world.updateZone(p); }
    const channels = await store.channels();
    ack?.({ user, map: world.map, channels, players: world.snapshot(), locked: [...world.locked], npcs: world.npcSnapshot(), communityName: settings.communityName, iceServers: ICE_SERVERS, speakers: await speakers.all(), events: await events.upcoming(), pushKey: notify.publicKey, mutedUntil: mutes.get(id) || 0, live: liveInfo(), recordings: [...recordings.keys()], serverTime: Date.now() });
    io.to("world").emit("system", { text: `${user.name} entrou.` });
    pushVoice();
  });

  const lim = { move: socketLimiter(40, 1000), chat: socketLimiter(5, 3000), bubble: socketLimiter(3, 3000), signal: socketLimiter(120, 10000), agent: socketLimiter(6, 60000), misc: socketLimiter(30, 10000) };
  socket.on("move", ({ x, y, dir, moving, running } = {}) => {
    if (!user || !lim.move()) return;
    if (world.move(user.id, x, y, dir, moving, running)) pushVoice();
  });

  socket.on("teleport", ({ x, y } = {}) => {
    if (!user) return;
    const p = world.players.get(user.id);
    if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!world.canEnter(p, Math.floor(x), Math.floor(y))) return socket.emit("toast", "Essa sala está trancada.");
    p.x = x; p.y = y; p.moving = false;
    world.updateZone(p);
    pushVoice();
  });

  socket.on("profile", ({ status, muted, presence, avatar } = {}) => {
    if (!user || !lim.misc()) return;
    const p = world.players.get(user.id);
    if (!p) return;
    if (avatar) { const a = sanitizeAvatar(avatar); if (a.body === 1 && !user.premium) a.body = 0; p.avatar = user.avatar = a; if (user.accountId) accounts.update(user.accountId, { avatar: p.avatar }).catch(() => {}); }
    if (typeof status === "string") p.status = status.slice(0, 40);
    if (typeof muted === "boolean") p.muted = muted || (mutes.get(user.id) || 0) > Date.now();
    if (["available", "busy", "focus"].includes(presence)) { p.presence = presence; pushVoice(); }
  });

  socket.on("speaking", (on) => { if (!user) return; const p = world.players.get(user.id); if (p) p.speaking = !!on; });

  // Conversa com um agente (precisa estar perto dele no mapa)
  socket.on("agent:chat", async ({ agentId, text } = {}, ack) => {
    if (!user) return;
    if (!lim.agent()) return ack?.({ error: "muitas perguntas seguidas; espere um minuto" });
    const p = world.players.get(user.id);
    const near = world.agents.find((a) => a.id === agentId);
    if (!p || !near) return ack?.({ error: "agente não está aqui" });
    if (Math.hypot(near.x - p.x, near.y - p.y) > 3 && user.role !== "admin") return ack?.({ error: "chega mais perto pra conversar" });
    text = String(text || "").trim().slice(0, 2000);
    if (!text) return ack?.({ error: "mensagem vazia" });
    if (busy.agent) return ack?.({ error: "espera a resposta anterior" });
    const a = await agents.get(agentId);
    const provider = a?.providerId && await agents.getProvider(a.providerId);
    if (!a || !provider) return ack?.({ error: "agente sem provedor configurado" });
    busy.agent = true;
    try {
      const history = await agents.history(agentId, user.id);
      const r = await runAgent({ agent: a, provider, history, userMessage: text, onTool: (name, args) => socket.emit("agent:tool", { agentId, name, args }) });
      await agents.saveHistory(agentId, user.id, [...history, { role: "user", content: text }, { role: "assistant", content: r.content }]);
      ack?.({ reply: r.content, trace: r.trace });
    } catch (e) { ack?.({ error: "o agente falhou: " + e.message.slice(0, 200) }); }
    finally { busy.agent = false; }
  });
  socket.on("agent:history", async ({ agentId } = {}, ack) => { if (!user) return; ack?.(await agents.history(agentId, user.id)); });

  socket.on("board:get", async ({ id } = {}, ack) => { if (!user || typeof id !== "string") return; ack?.(await store.getBoard(id)); });
  socket.on("board:set", async ({ id, content } = {}) => {
    if (!user || typeof id !== "string" || typeof content !== "string" || !lim.misc()) return;
    if (!world.map.objects.some((o) => o.id === id && o.kind === "board")) return;
    content = content.slice(0, 20000);
    await store.setBoard(id, content);
    socket.to("world").emit("board:update", { id, content, by: user.name });
  });

  // ---------- links editáveis (telão, palco, links): admin e professores ----------
  socket.on("object:set", async ({ id, url, label } = {}, ack) => {
    if (!user || !["admin", "professor"].includes(user.role)) return ack?.({ error: "só admin e professores editam links" });
    const o = world.map.objects.find((x) => x.id === id && ["video", "link"].includes(x.kind));
    if (!o) return ack?.({ error: "objeto não encontrado" });
    const patch = {};
    if (typeof url === "string") {
      let u = url.trim().slice(0, 500);
      const yt = parseYouTube(u);
      if (yt) u = `https://www.youtube.com/embed/${yt.videoId}?rel=0` + (yt.list ? `&list=${encodeURIComponent(yt.list)}` : "") + (yt.start ? `&start=${yt.start}` : "");
      else if (!/^(https?:\/\/|\/)/.test(u)) return ack?.({ error: "link inválido (use http(s)://)" });
      patch.url = u;
    }
    if (typeof label === "string" && label.trim()) patch.label = label.trim().slice(0, 40);
    if (!Object.keys(patch).length) return ack?.({ error: "nada pra salvar" });
    const cur = await getOverrides();
    cur.objects = { ...(cur.objects || {}), [id]: { ...(cur.objects?.[id] || {}), ...patch } };
    await store.putDoc("world", "overrides", cur);
    Object.assign(o, patch);
    io.to("world").emit("object:update", { id, ...patch, by: user.name });
    ack?.({ ok: true, ...patch });
  });

  // ---------- caixa de som da sala ----------
  const speakerObj = (id) => world.map.objects.find((x) => x.id === id && x.kind === "speaker");
  socket.on("speaker:get", async (_a, ack) => { if (user) ack?.(await speakers.all()); });
  // estado da caixa: { videoId, start, title, author, startedAt, by, byName, queue: [{videoId,title,author,by,byName}] }
  const isStaff = () => ["admin", "professor"].includes(user.role);
  const broadcastSpeaker = (id, state) => io.to("world").emit("speaker:update", { id, state, now: Date.now() });
  const advance = async (id) => { // próxima da fila (ou desliga)
    const cur = await speakers.get(id); if (!cur) return null;
    const next = (cur.queue || []).shift?.() || null;
    const state = next ? { ...next, start: 0, startedAt: Date.now(), queue: cur.queue || [] } : null;
    await speakers.set(id, state); broadcastSpeaker(id, state); return state;
  };
  socket.on("speaker:set", async ({ id, url, title, mode } = {}, ack) => {
    if (!user) return; if (!lim.misc()) return ack?.({ error: "calma, muitas trocas seguidas" });
    const o = speakerObj(id); if (!o) return ack?.({ error: "caixa de som não encontrada" });
    const yt = parseYouTube(url); if (!yt) return ack?.({ error: "cole um link do YouTube (ou pesquise)" });
    const info = await videoInfo(yt.videoId);
    const item = { videoId: yt.videoId, title: (info.title || String(title || "").slice(0, 120) || "YouTube"), author: info.author, by: user.id, byName: user.name };
    const cur = await speakers.get(id);
    // tocando algo: vai pra fila, a menos que seja "tocar agora" por quem colocou a atual ou pela equipe
    if (cur && !(mode === "now" && (cur.by === user.id || isStaff()))) {
      const queue = cur.queue || []; if (queue.length >= 20) return ack?.({ error: "fila cheia (20)" });
      if (cur.videoId === item.videoId || queue.some((q) => q.videoId === item.videoId)) return ack?.({ error: "essa já está na fila" });
      queue.push(item); const state = { ...cur, queue }; await speakers.set(id, state); broadcastSpeaker(id, state);
      return ack?.({ ok: true, queued: true, position: queue.length, state });
    }
    const state = { ...item, start: yt.start || 0, startedAt: Date.now(), queue: cur?.queue || [] };
    await speakers.set(id, state); broadcastSpeaker(id, state);
    ack?.({ ok: true, state });
  });
  socket.on("speaker:skip", async ({ id } = {}, ack) => {
    if (!user) return;
    const cur = await speakers.get(id); if (!cur) return ack?.({ ok: true });
    if (cur.by !== user.id && !isStaff()) return ack?.({ error: "só quem colocou (ou a equipe) pula" });
    ack?.({ ok: true, state: await advance(id) });
  });
  // o vídeo acabou no navegador de alguém: passa pra próxima (idempotente: só se ainda for a mesma)
  socket.on("speaker:ended", async ({ id, videoId, startedAt } = {}) => {
    if (!user) return;
    const cur = await speakers.get(id); if (!cur || cur.videoId !== videoId || cur.startedAt !== startedAt) return;
    if (Date.now() - cur.startedAt < 15000) return;
    await advance(id);
  });
  socket.on("speaker:remove", async ({ id, index } = {}, ack) => {
    if (!user) return;
    const cur = await speakers.get(id); const q = cur?.queue || []; const it = q[index];
    if (!it) return ack?.({ ok: true });
    if (it.by !== user.id && !isStaff()) return ack?.({ error: "só quem adicionou (ou a equipe) tira da fila" });
    q.splice(index, 1); const state = { ...cur, queue: q }; await speakers.set(id, state); broadcastSpeaker(id, state);
    ack?.({ ok: true, state });
  });
  socket.on("speaker:stop", async ({ id } = {}, ack) => {
    if (!user) return;
    const cur = await speakers.get(id); if (!cur) return ack?.({ ok: true });
    if (cur.by !== user.id && !isStaff()) return ack?.({ error: "só quem colocou (ou a equipe) pode parar" });
    await speakers.set(id, null);
    broadcastSpeaker(id, null);
    ack?.({ ok: true });
  });
  let lastSearch = 0;
  socket.on("speaker:search", async ({ q, ai } = {}, ack) => {
    if (!user) return;
    q = String(q || "").trim().slice(0, 200); if (!q) return ack?.({ error: "digite o que quer ouvir" });
    if (Date.now() - lastSearch < 2500) return ack?.({ error: "calma, uma pesquisa por vez" });
    lastSearch = Date.now();
    const direct = parseYouTube(q);
    if (direct) { const info = await videoInfo(direct.videoId); return ack?.({ query: q, results: [{ videoId: direct.videoId, title: info.title || q, author: info.author, length: "" }] }); }
    let query = q, aiQuery = null;
    if (ai !== false) { const prov = (await agents.listProviders())[0]; const r = prov && await refineQuery(prov, q); if (r) { aiQuery = r; query = r; } }
    try { ack?.({ query: q, aiQuery, results: await searchYouTube(query) }); }
    catch (e) { ack?.({ error: "a pesquisa no YouTube falhou: " + e.message.slice(0, 80), query: q, aiQuery, results: [] }); }
  });

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

  // ---------- gravação da aula (equipe, no palco) ----------
  socket.on("live:record", async ({ on, title } = {}, ack) => {
    if (!user || !["admin", "professor"].includes(user.role)) return ack?.({ error: "só a equipe grava" });
    if (!recordingEnabled()) return ack?.({ error: "gravação não configurada no servidor (LiveKit + S3)" });
    const g = world.voiceGroups().get(user.id); const room = roomFor(g?.id);
    if (!room || !room.startsWith("zone-")) return ack?.({ error: "entre no palco ou numa sala pra gravar" });
    try {
      if (on) {
        if (recordings.has(room)) return ack?.({ error: "já está gravando" });
        const live = (await events.upcoming()).find((e) => e.live);
        const t = String(title || live?.title || `Aula ao vivo ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 120);
        const r = await startRecording(room, { title: t });
        recordings.set(room, { ...r, room, by: user.id, byName: user.name, startedAt: Date.now() });
        io.to("world").emit("live:recording", { room, on: true, by: user.name, title: t });
        await modlog({ action: "record", by: user.id, byName: user.name, targetId: room, targetName: t });
      } else {
        const rec = recordings.get(room); if (!rec) return ack?.({ ok: true });
        await stopRecording(rec.egressId);
        io.to("world").emit("toast", `${user.name} parou a gravação; o vídeo entra na biblioteca em alguns minutos.`);
      }
      ack?.({ ok: true });
    } catch (e) { ack?.({ error: "gravação: " + e.message.slice(0, 120) }); }
  });

  socket.on("chat:history", async ({ channelId } = {}, ack) => { if (!user || typeof channelId !== "string") return; ack?.(await store.history(channelId)); });

  socket.on("chat:send", async ({ channelId, body } = {}) => {
    if (!user) return;
    if (!lim.chat()) return socket.emit("toast", "Calma, muitas mensagens seguidas.");
    body = String(body || "").trim().slice(0, 1000);
    if (!body || typeof channelId !== "string") return;
    const p = world.players.get(user.id);
    if (channelId.startsWith("zone:")) { if (!p || "zone:" + p.zone !== channelId) return; }
    else {
      const ch = (await store.channels()).find((c) => c.id === channelId && c.kind === "text");
      if (!ch) return;
      if (ch.id === "anuncios" && !["admin", "professor"].includes(user.role)) return socket.emit("toast", "Só professores postam em #anúncios.");
    }
    const msg = await store.addMessage({ channel_id: channelId, user_id: user.id, user_name: user.name, user_color: user.color, body });
    if (channelId.startsWith("zone:")) {
      for (const q of world.players.values()) if ("zone:" + q.zone === channelId) socketsByUser.get(q.id)?.emit("chat:message", msg);
    } else io.to("world").emit("chat:message", msg);
    // menção: push pra quem está fora do espaço (ou com a aba escondida); @todos só a equipe
    const names = [...body.matchAll(/@([\p{L}\p{N}_.\-]+)/gu)].map((m) => m[1].toLowerCase());
    if (names.length) {
      const all = names.includes("todos") && ["admin", "professor"].includes(user.role);
      const targets = (await accounts.list()).filter((u) => u.id !== user.id && (all || names.includes(u.name.toLowerCase())));
      for (const u of targets) {
        const sock = socketsByUser.get(u.id);
        if (sock && sock.visible !== false) continue;
        notify.push(u.id, { title: `${user.name} mencionou você`, body: body.slice(0, 120), url: "/", tag: "mention:" + user.id }).catch(() => {});
      }
    }
  });
  socket.on("visibility", (v) => { socket.visible = v !== false; });

  // ---------- moderação (admin e professores) ----------
  socket.on("mod:action", async ({ targetId, action, minutes, reason } = {}, ack) => {
    if (!user || !["admin", "professor"].includes(user.role)) return ack?.({ error: "sem permissão" });
    const t = world.players.get(targetId); const tSock = socketsByUser.get(targetId);
    if (!t) return ack?.({ error: "pessoa não está aqui" });
    if (t.id === user.id) return ack?.({ error: "isso é com você mesmo" });
    if (t.role === "admin" || (t.role === "professor" && user.role !== "admin")) return ack?.({ error: "não dá pra moderar a equipe" });
    reason = String(reason || "").slice(0, 140);
    const entry = { action, by: user.id, byName: user.name, targetId, targetName: t.name, reason };
    if (action === "mute") {
      const min = Math.min(720, Math.max(1, parseInt(minutes, 10) || 10));
      const until = Date.now() + min * 60000; mutes.set(targetId, until); t.muted = true;
      tSock?.emit("mod:muted", { until, by: user.name, reason });
      await modlog({ ...entry, minutes: min });
      return ack?.({ ok: true });
    }
    if (action === "unmute") { mutes.delete(targetId); tSock?.emit("mod:muted", { until: 0, by: user.name }); await modlog(entry); return ack?.({ ok: true }); }
    if (action === "kick" || action === "ban") {
      if (action === "ban") await bans.add(targetId, { name: t.name, role: t.role, reason, by: user.name, at: new Date().toISOString() });
      await modlog(entry);
      tSock?.emit("kicked", (action === "ban" ? "Você foi removido deste espaço" : "Você foi expulso por " + user.name) + (reason ? ": " + reason : "."));
      if (liveEnabled() && liveRoom.get(targetId)?.room) liveKick(liveRoom.get(targetId).room, targetId);
      setTimeout(() => tSock?.disconnect(true), 300);
      io.to("world").emit("system", { text: `${t.name} foi ${action === "ban" ? "banido" : "expulso"} por ${user.name}.` });
      return ack?.({ ok: true });
    }
    ack?.({ error: "ação desconhecida" });
  });

  socket.on("bubble", ({ text } = {}) => {
    if (!user || !lim.bubble()) return;
    text = String(text || "").trim().slice(0, 120);
    if (text) io.to("world").emit("bubble", { userId: user.id, text });
  });

  socket.on("rtc:signal", ({ to, data } = {}) => {
    if (!user || typeof to !== "string" || !data || typeof data !== "object" || !lim.signal()) return;
    socketsByUser.get(to)?.emit("rtc:signal", { from: user.id, data });
  });

  socket.on("disconnect", () => {
    if (!user) return;
    if (socketsByUser.get(user.id) === socket) {
      socketsByUser.delete(user.id);
      lastVoice.delete(user.id); liveRoom.delete(user.id);
      world.remove(user.id);
      io.to("world").emit("system", { text: `${user.name} saiu.` });
      pushVoice();
    }
  });
});

setInterval(() => {
  world.tickNpcs(1 / 12);
  if (world.players.size) { io.to("world").emit("state", world.snapshot()); io.to("world").emit("npcs", world.npcSnapshot()); }
}, 1000 / 12);

let pushing = false, pushAgain = false;
async function pushVoice() {
  if (pushing) { pushAgain = true; return; } // serializa: tokens são assíncronos
  pushing = true;
  try {
    const groups = world.voiceGroups();
    for (const [uid, g] of groups) {
      const key = JSON.stringify(g);
      if (lastVoice.get(uid) === key) continue;
      lastVoice.set(uid, key);
      const sock = socketsByUser.get(uid); if (!sock) continue;
      if (liveEnabled()) {
        const room = roomFor(g.id), canPublish = !!g.canSpeak, prev = liveRoom.get(uid);
        const u = world.players.get(uid);
        if (room && u) {
          g.live = { room, token: await tokenFor({ id: uid, name: u.name, role: u.role }, room, { canPublish }) };
          if (prev?.room === room && prev.canPublish !== canPublish) setCanPublish(room, uid, canPublish); // subiu/desceu do palco
          liveRoom.set(uid, { room, canPublish });
        } else { g.live = null; liveRoom.delete(uid); }
      }
      sock.emit("voice:group", g);
    }
  } finally { pushing = false; if (pushAgain) { pushAgain = false; pushVoice(); } }
}

startScheduler(agents, postAsAgent);
// relógio da agenda: lembra 15 min antes, coloca o link no telão e anuncia na hora
startEventClock({
  events, accounts, notify,
  onRemind: (e) => io.to("world").emit("event:soon", { event: e, minutes: REMIND_MIN }),
  onStart: async (e) => {
    if (e.url) {
      const o = world.map.objects.find((x) => x.id === e.objectId && ["video", "link"].includes(x.kind));
      if (o) {
        let u = e.url; const yt = parseYouTube(u);
        if (yt) u = `https://www.youtube.com/embed/${yt.videoId}?rel=0&autoplay=1` + (yt.list ? `&list=${encodeURIComponent(yt.list)}` : "");
        const cur = await getOverrides(); cur.objects = { ...(cur.objects || {}), [o.id]: { ...(cur.objects?.[o.id] || {}), url: u } };
        await store.putDoc("world", "overrides", cur); o.url = u;
        io.to("world").emit("object:update", { id: o.id, url: u, by: "agenda" });
      }
    }
    io.to("world").emit("event:started", { event: e });
    io.to("world").emit("events:changed");
    for (const u of await accounts.list()) if (u.reminders !== false && !socketsByUser.has(u.id)) notify.push(u.id, { title: `Começou: ${e.title}`, body: "Ao vivo agora no palco. Entre no espaço.", url: "/", tag: "event:" + e.id }).catch(() => {});
  },
});
server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));

// Estado do mundo em memória + cálculo dos grupos de voz.
import { WORLD, zoneAt, onStage, isBlocked } from "./map.js";

export class World {
  constructor() {
    this.map = WORLD;
    this.players = new Map(); // userId -> player
  }

  add(user, socketId) {
    const p = {
      id: user.id,
      socketId,
      name: user.name,
      color: user.color,
      avatar: user.avatar,
      x: this.map.spawn.x,
      y: this.map.spawn.y,
      dir: "down",
      moving: false,
      zone: null,
      onStage: false,
      voiceChannel: null, // canal de voz estilo Discord (sobrepõe o mapa)
      muted: false,
      status: "", // frase curta ao lado do nome
      presence: "available", // available | busy | focus
      speaking: false,
    };
    this.players.set(user.id, p);
    this.updateZone(p);
    return p;
  }

  remove(userId) { this.players.delete(userId); }

  move(userId, x, y, dir, moving) {
    const p = this.players.get(userId);
    if (!p) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (isBlocked(this.map, tx, ty)) return false;
    // anti-teleporte: no máximo ~2 tiles por mensagem
    if (Math.hypot(x - p.x, y - p.y) > 2.5) return false;
    p.x = x; p.y = y; p.dir = dir || p.dir; p.moving = !!moving;
    this.updateZone(p);
    return true;
  }

  updateZone(p) {
    const z = zoneAt(this.map, Math.floor(p.x), Math.floor(p.y));
    p.zone = z ? z.id : null;
    p.onStage = onStage(z, Math.floor(p.x), Math.floor(p.y));
  }

  zoneById(id) { return this.map.zones.find((z) => z.id === id) || null; }

  snapshot() {
    const out = [];
    for (const p of this.players.values()) {
      out.push({ id: p.id, name: p.name, color: p.color, avatar: p.avatar, x: p.x, y: p.y, dir: p.dir,
        moving: p.moving, zone: p.zone, onStage: p.onStage, voiceChannel: p.voiceChannel,
        muted: p.muted, status: p.status, presence: p.presence, speaking: p.speaking });
    }
    return out;
  }

  // Retorna Map userId -> { id: groupId, peers: [ids], canSpeak, label }
  voiceGroups() {
    const result = new Map();
    const free = []; // candidatos a proximidade
    const byGroup = new Map();
    const push = (gid, p, canSpeak, label) => {
      if (!byGroup.has(gid)) byGroup.set(gid, { members: [], label });
      byGroup.get(gid).members.push(p);
      result.set(p.id, { id: gid, canSpeak, label });
    };

    for (const p of this.players.values()) {
      if (p.voiceChannel) { push("ch:" + p.voiceChannel, p, true, "canal"); continue; }
      if (p.presence === "focus") { result.set(p.id, { id: null, canSpeak: false, label: "modo foco" }); continue; }
      const z = p.zone ? this.zoneById(p.zone) : null;
      if (!z || z.kind === "open") { free.push(p); continue; }
      if (z.kind === "silent") { result.set(p.id, { id: null, canSpeak: false, label: z.name }); continue; }
      if (z.kind === "meeting") { push("zone:" + z.id, p, true, z.name); continue; }
      if (z.kind === "stage") { push("zone:" + z.id, p, p.onStage, z.name); continue; }
    }

    // clusters por proximidade (união transitiva)
    const r = this.map.proximityRadius;
    const seen = new Set();
    for (const p of free) {
      if (seen.has(p.id)) continue;
      const cluster = [p]; seen.add(p.id);
      for (let i = 0; i < cluster.length; i++) {
        for (const q of free) {
          if (seen.has(q.id)) continue;
          if (Math.hypot(q.x - cluster[i].x, q.y - cluster[i].y) <= r) { seen.add(q.id); cluster.push(q); }
        }
      }
      if (cluster.length === 1) { result.set(p.id, { id: null, canSpeak: true, label: "" }); continue; }
      const gid = "prox:" + cluster.map((c) => c.id).sort().join(",");
      for (const c of cluster) push(gid, c, true, "por perto");
    }

    for (const [uid, g] of result) {
      const grp = g.id ? byGroup.get(g.id) : null;
      g.peers = grp ? grp.members.filter((m) => m.id !== uid).map((m) => m.id) : [];
    }
    return result;
  }
}

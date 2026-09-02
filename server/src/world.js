// Estado do mundo em memória + cálculo dos grupos de voz.
import { WORLD, zoneAt, onStage, isBlocked } from "./map.js";

const NPC_SPEED = { fox: 2.2, hare: 3.0, deer: 1.6, boar: 1.4, grouse: 1.1 };

export class World {
  constructor() {
    this.players = new Map(); // userId -> player
    this.locked = new Set();  // zonas trancadas (só admin/professor entram)
    this.agents = [];         // NPCs com LLM (posição no mapa)
    this.setMap(WORLD, {});
  }

  // (Re)carrega o mapa aplicando ajustes do painel (posições de objetos/árvores, bichos, trancas)
  setMap(base, overrides = {}) {
    const map = JSON.parse(JSON.stringify(base));
    for (const [id, pos] of Object.entries(overrides.objects || {})) { const o = map.objects.find((x) => x.id === id); if (o) Object.assign(o, { x: pos.x, y: pos.y }); }
    for (const [i, pos] of Object.entries(overrides.decor || {})) { const d = map.decor[Number(i)]; if (d) Object.assign(d, { x: pos.x, y: pos.y }); }
    if (overrides.npcs) map.npcs = overrides.npcs;
    // colisão = tiles do Tiled (paredes/móveis) + objetos e árvores nas posições atuais
    const grid = map.tiledGrid.map((row) => row.split(""));
    for (const o of [...map.objects, ...map.decor]) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (grid[y]?.[x] !== undefined) grid[y][x] = "1";
    map.grid = grid.map((r) => r.join(""));
    this.map = map;
    this.locked = new Set(overrides.locked || []);
    this.npcs = (map.npcs || []).map((n, i) => {
      const z = this.zoneById(n.zone) || map.zones[0];
      const spot = this.freeTile(z) || { x: z.x, y: z.y };
      return { id: "npc" + i, kind: n.kind, zone: z.id, x: spot.x + 0.5, y: spot.y + 0.5, dir: "down", moving: false, target: null, wait: 1 + Math.random() * 3 };
    });
    for (const p of this.players.values()) { if (isBlocked(map, Math.floor(p.x), Math.floor(p.y))) { p.x = map.spawn.x + 0.5; p.y = map.spawn.y + 0.5; } this.updateZone(p); }
  }

  // Agentes (LLM) como NPCs: ficam parados no ponto ou passeiam na zona
  setAgents(list) {
    const prev = new Map(this.agents.map((a) => [a.id, a]));
    this.agents = list.filter((a) => a.enabled).map((a) => {
      const z = a.zone ? this.zoneById(a.zone) : null;
      const old = prev.get(a.id);
      let x = a.x, y = a.y;
      if (!(x > 0 && y > 0) || isBlocked(this.map, Math.floor(x), Math.floor(y))) { const t = (z && this.freeTile(z)) || this.map.spawn; x = t.x + 0.5; y = t.y + 0.5; }
      else { x = Math.floor(x) + 0.5; y = Math.floor(y) + 0.5; }
      return { id: a.id, kind: "agent", name: a.name, role: a.role, avatar: a.avatar, zone: z?.id || null, wander: a.wander,
        x: old && old.wander && a.wander ? old.x : x, y: old && old.wander && a.wander ? old.y : y, dir: "down", moving: false, target: null, wait: 2 };
    });
  }

  canEnter(p, tx, ty) {
    if (isBlocked(this.map, tx, ty)) return false;
    if (!this.locked.size) return true;
    const z = zoneAt(this.map, tx, ty);
    if (z && this.locked.has(z.id) && !["admin", "professor"].includes(p.role)) return false;
    return true;
  }

  // agente mais próximo de um jogador (pra conversar com E)
  agentNear(p, reach = 2.2) {
    let best = null, bd = Infinity;
    for (const a of this.agents) { const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < reach && d < bd) { best = a; bd = d; } }
    return best;
  }

  freeTile(z) {
    for (let i = 0; i < 40; i++) {
      const tx = z.x + Math.floor(Math.random() * z.w), ty = z.y + Math.floor(Math.random() * z.h);
      if (!isBlocked(this.map, tx, ty)) return { x: tx, y: ty };
    }
    return null;
  }

  // Bichos passeando: escolhe um ponto livre na zona, anda até lá, para um pouco, repete
  tickNpcs(dt) {
    for (const n of [...this.npcs, ...this.agents.filter((a) => a.wander)]) {
      if (n.kind === "agent" && !n.zone) continue;
      if (n.wait > 0) { n.wait -= dt; n.moving = false; continue; }
      if (!n.target) { const t = this.freeTile(this.zoneById(n.zone)); if (!t) { n.wait = 2; continue; } n.target = { x: t.x + 0.5, y: t.y + 0.5 }; }
      const vx = n.target.x - n.x, vy = n.target.y - n.y, d = Math.hypot(vx, vy);
      const sp = NPC_SPEED[n.kind] || (n.kind === "agent" ? 1.4 : 1.5);
      if (d < 0.1) { n.target = null; n.wait = 1 + Math.random() * 5; n.moving = false; continue; }
      const nx = n.x + (vx / d) * sp * dt, ny = n.y + (vy / d) * sp * dt;
      if (isBlocked(this.map, Math.floor(nx), Math.floor(ny))) { n.target = null; n.wait = 0.5; n.moving = false; continue; }
      n.x = nx; n.y = ny; n.moving = true;
      n.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : (vy > 0 ? "down" : "up");
    }
  }

  npcSnapshot() {
    return [
      ...this.npcs.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, dir: n.dir, moving: n.moving })),
      ...this.agents.map((a) => ({ id: a.id, kind: "agent", name: a.name, role: a.role, avatar: a.avatar, x: a.x, y: a.y, dir: a.dir, moving: a.moving })),
    ];
  }

  add(user, socketId) {
    const p = {
      id: user.id,
      socketId,
      name: user.name,
      color: user.color,
      avatar: user.avatar,
      role: user.role || "guest",
      accountId: user.accountId || null,
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
    if (!this.canEnter(p, tx, ty)) return false;
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
      out.push({ id: p.id, name: p.name, color: p.color, avatar: p.avatar, role: p.role, x: p.x, y: p.y, dir: p.dir,
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

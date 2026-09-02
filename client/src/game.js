import Phaser from "phaser";
import { TILE, isBlocked, zoneAt, objectNear } from "./mapdata.js";
import { ensureAvatarTexture, avatarKey } from "./sprites.js";

const SPEED = 4.4; // tiles por segundo
const SEND_HZ = 15;
const STATUS_COLOR = { available: 0x6ef0a3, busy: 0xf06e6e, focus: 0xf0c76e };

export class WorldScene extends Phaser.Scene {
  constructor({ map, me, net, onZoneChange, onObjectNear }) {
    super("world");
    this.map = map;
    this.me = me;
    this.net = net;
    this.onZoneChange = onZoneChange;
    this.onObjectNear = onObjectNear;
    this.remote = new Map(); // id -> { container, target, last }
    this.bubbles = new Map();
    this.lastSent = 0;
    this.currentZone = undefined;
    this.nearObject = null;
    this.frozen = false; // true enquanto um modal está aberto
  }

  preload() {
    this.load.tilemapTiledJSON("sede", `/maps/${this.map.tiledFile || "sede.json"}`);
    this.load.image("tiles", "/assets/tiles/office.png");
    const kinds = [...new Set((this.map.npcs || []).map((n) => n.kind))];
    for (const k of kinds) {
      this.load.spritesheet(`npc:${k}:idle`, `/assets/animals/${k}_idle.png`, { frameWidth: 32, frameHeight: 32 });
      this.load.spritesheet(`npc:${k}:walk`, `/assets/animals/${k}_walk.png`, { frameWidth: 32, frameHeight: 32 });
    }
    for (const d of this.map.decor || []) this.load.image(`tree:${d.sprite}`, `/assets/trees/${d.sprite}.png`);
    for (const g of this.map.graffiti || []) this.load.image(`graf:${g.sprite}`, `/assets/graffiti/${g.sprite}.png`);
  }

  create() {
    const { map } = this;
    this.cameras.main.setBackgroundColor("#070707");
    this.drawTilemap();
    this.drawZones();
    this.drawObjects();
    this.drawGraffiti();
    this.drawDecor();
    this.setupNpcAnims();
    this.npcs = new Map();

    this.player = this.makeAvatar(this.me.name, this.me.avatar, true);
    this.player.setPosition((map.spawn.x + 0.5) * TILE, (map.spawn.y + 0.5) * TILE);
    this.pos = { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 };
    this.dir = "down";

    this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.4);
    this.cameras.main.roundPixels = true;

    this.keys = this.input.keyboard.addKeys({
      up: "W", down: "S", left: "A", right: "D",
      up2: "UP", down2: "DOWN", left2: "LEFT", right2: "RIGHT",
    });
    this.input.keyboard.disableGlobalCapture();

    // clique no mapa: anda até lá (linha reta simples com colisão)
    this.input.on("pointerdown", (p) => {
      if (this.frozen || p.event.target.tagName !== "CANVAS") return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      this.clickTarget = { x: w.x / TILE, y: w.y / TILE };
    });

    this.scale.on("resize", () => this.cameras.main.setSize(this.scale.width, this.scale.height));
    this.updateZone(true);
  }

  // --------- desenho do mundo (Tiled) ---------
  drawTilemap() {
    const tm = this.make.tilemap({ key: "sede" });
    const ts = tm.addTilesetImage("office", "tiles");
    this.textures.get("tiles").setFilter(1);
    for (const name of ["ground", "walls", "furniture"]) {
      const layer = tm.createLayer(name, ts, 0, 0);
      if (layer) layer.setDepth(name === "furniture" ? 2 : 0);
    }
    this.tilemap = tm;
  }

  drawZones() {
    for (const z of this.map.zones) {
      const g = this.add.graphics().setDepth(1);
      const x = z.x * TILE, y = z.y * TILE, w = z.w * TILE, h = z.h * TILE;
      // luz ambiente: mais clara no centro
      g.fillStyle(0xffffff, z.kind === "meeting" ? 0.035 : 0.02).fillEllipse(x + w / 2, y + h / 2, w * 0.9, h * 0.9);
      if (z.stage) {
        const s = z.stage;
        for (let i = 0; i < 4; i++) {
          const sx = (s.x + 3 + i * (s.w - 6) / 3) * TILE;
          g.fillStyle(0xfff4dc, 0.05).fillEllipse(sx, (s.y + 1) * TILE, 140, 60);
        }
        this.add.text((s.x + s.w / 2) * TILE, (s.y + s.h / 2) * TILE, "PALCO", {
          fontFamily: "JetBrains Mono", fontSize: "10px", color: "#ffffff", letterSpacing: 3,
        }).setOrigin(0.5).setAlpha(0.45).setDepth(3);
      }
      this.add.text(x + 14, y + 8, z.name, { fontFamily: "Instrument Serif", fontSize: "22px", color: "#f2efe9" }).setAlpha(0.7).setDepth(3);
      const tag = { open: "voz por perto", meeting: "call da sala", silent: "silêncio", stage: "auditório" }[z.kind];
      this.add.text(x + 15, y + 34, tag.toUpperCase(), { fontFamily: "JetBrains Mono", fontSize: "9px", color: "#f2efe9", letterSpacing: 2 }).setAlpha(0.35).setDepth(3);
    }
  }

  drawObjects() {
    for (const o of this.map.objects || []) {
      const x = o.x * TILE, y = o.y * TILE, w = o.w * TILE, h = o.h * TILE;
      const glow = this.add.graphics().setDepth(3);
      glow.lineStyle(1, 0xffffff, 0.5).strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 4);
      this.tweens.add({ targets: glow, alpha: { from: 0.25, to: 0.9 }, duration: 1600, yoyo: true, repeat: -1 });
      this.add.text(x + w / 2, y + h + 1, o.label, { fontFamily: "JetBrains Mono", fontSize: "8px", color: "#f2efe9", letterSpacing: 1, backgroundColor: "rgba(0,0,0,0.45)", padding: { x: 3, y: 1 } }).setOrigin(0.5, 0).setAlpha(0.7).setDepth(3);
    }
  }

  drawGraffiti() {
    for (const g of this.map.graffiti || []) {
      if (!this.textures.exists(`graf:${g.sprite}`)) continue;
      const img = this.add.image((g.x + 0.5) * TILE, (g.y + 0.5) * TILE, `graf:${g.sprite}`).setOrigin(0.5).setAlpha(0.92);
      img.setScale(g.scale || 1); img.texture.setFilter(1);
      img.setDepth(3);
    }
  }

  drawDecor() {
    for (const d of this.map.decor || []) {
      if (!this.textures.exists(`tree:${d.sprite}`)) continue;
      const cx = (d.x + d.w / 2) * TILE, by = (d.y + d.h) * TILE;
      const img = this.add.image(cx, by - 6, `tree:${d.sprite}`).setOrigin(0.5, 0.9);
      img.texture.setFilter(1);
      img.setDepth(10 + by / 10000); // ordena com os avatares pela base do tronco
    }
  }

  // --------- bichos (NPCs simulados no servidor) ---------
  setupNpcAnims() {
    // linhas do sheet: 0 frente, 1 costas, 2 esquerda, 3 direita
    const ROWS = { down: 0, up: 1, left: 2, right: 3 };
    for (const k of new Set((this.map.npcs || []).map((n) => n.kind))) {
      for (const st of ["idle", "walk"]) {
        const key = `npc:${k}:${st}`;
        if (!this.textures.exists(key)) continue;
        this.textures.get(key).setFilter(1);
        const perRow = Math.floor(this.textures.get(key).getSourceImage().width / 32);
        for (const [dir, row] of Object.entries(ROWS)) {
          this.anims.create({ key: `${key}:${dir}`, frames: this.anims.generateFrameNumbers(key, { start: row * perRow, end: row * perRow + perRow - 1 }), frameRate: st === "walk" ? 8 : 4, repeat: -1 });
        }
      }
    }
  }

  applyNpcs(list) {
    if (!this.npcs) return;
    const seen = new Set();
    for (const n of list) {
      seen.add(n.id);
      let r = this.npcs.get(n.id);
      if (!r) {
        if (!this.textures.exists(`npc:${n.kind}:idle`)) continue;
        const sp = this.add.sprite(n.x * TILE, n.y * TILE, `npc:${n.kind}:idle`, 0).setScale(1.3).setOrigin(0.5, 0.8);
        r = { sprite: sp, target: { x: n.x, y: n.y }, kind: n.kind };
        this.npcs.set(n.id, r);
      }
      r.target = { x: n.x, y: n.y }; r.dir = n.dir; r.moving = n.moving;
    }
    for (const [id, r] of this.npcs) if (!seen.has(id)) { r.sprite.destroy(); this.npcs.delete(id); }
  }

  // --------- avatares ---------
  makeAvatar(name, avatar, isMe) {
    const c = this.add.container(0, 0);
    const key = ensureAvatarTexture(this, avatar);
    if (isMe) {
      const ring = this.add.graphics();
      ring.lineStyle(1, 0xffffff, 0.16).strokeCircle(0, 4, this.map.proximityRadius * TILE);
      ring.fillStyle(0xffffff, 0.02).fillCircle(0, 4, this.map.proximityRadius * TILE);
      c.add(ring);
    }
    const speak = this.add.graphics();
    speak.lineStyle(2, 0x6ef0a3, 0.9).strokeEllipse(0, 2, 30, 12);
    speak.setVisible(false);
    c.add(speak); c.speak = speak;

    const sprite = this.add.sprite(0, 0, key + ":walk", 0).setScale(1.7).setOrigin(0.5, 44 / 64);
    c.add(sprite); c.sprite = sprite; c.texKey = key; c.dirNow = "down";
    c.setAvatar = (a) => {
      const k = ensureAvatarTexture(this, a);
      if (k === c.texKey) return;
      c.texKey = k; c.sprite.setTexture(k + ":walk", 0);
    };

    const label = this.add.text(0, 6, name, {
      fontFamily: "Inter", fontSize: "11px", color: "#f2efe9",
      backgroundColor: "rgba(0,0,0,0.55)", padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 0);
    c.add(label); c.label = label;
    const dot = this.add.graphics(); c.add(dot); c.dot = dot;
    c.mic = this.add.text(13, -36, "", { fontFamily: "Inter", fontSize: "12px", color: "#f06e6e", fontStyle: "bold" }).setOrigin(0.5);
    c.add(c.mic);
    c.setDepth(10);
    this.setStatus(c, "available");
    return c;
  }

  setStatus(c, status) {
    if (c.statusNow === status) return;
    c.statusNow = status;
    c.dot.clear();
    c.dot.fillStyle(STATUS_COLOR[status] || STATUS_COLOR.available, 1).fillCircle(-c.label.width / 2 - 1, 12, 3);
  }

  animate(c, dir, moving) {
    const anim = `${c.texKey}:${moving ? "walk" : "idle"}:${dir}`;
    if (c.sprite.anims.currentAnim?.key !== anim) c.sprite.play(anim, true);
  }

  applyState(players) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === this.me.id) continue;
      seen.add(p.id);
      let r = this.remote.get(p.id);
      if (!r) {
        r = { container: this.makeAvatar(p.name, p.avatar, false), target: { x: p.x, y: p.y }, dir: p.dir || "down" };
        r.container.setPosition(p.x * TILE, p.y * TILE);
        this.remote.set(p.id, r);
      }
      r.target = { x: p.x, y: p.y };
      r.dir = p.dir || r.dir;
      r.moving = !!p.moving;
      r.container.mic.setText(p.muted ? "×" : "");
      if (p.avatar && avatarKey(p.avatar) !== r.container.texKey) r.container.setAvatar(p.avatar);
      const text = p.status ? `${p.name} · ${p.status}` : p.name;
      if (r.container.label.text !== text) { r.container.label.setText(text); r.container.statusNow = null; }
      this.setStatus(r.container, p.presence || "available");
      r.container.speak.setVisible(!!p.speaking && !p.muted);
    }
    for (const [id, r] of this.remote) {
      if (!seen.has(id)) { r.container.destroy(); this.remote.delete(id); this.bubbles.get(id)?.destroy(); this.bubbles.delete(id); }
    }
  }

  setMyPresence(status) { this.setStatus(this.player, status); }
  setMySpeaking(on) { this.player.speak.setVisible(on); }
  setMuted(m) { this.player.mic.setText(m ? "×" : ""); }
  setMyAvatar(a) { this.player.setAvatar(a); }

  showBubble(userId, text) {
    const target = userId === this.me.id ? this.player : this.remote.get(userId)?.container;
    if (!target) return;
    this.bubbles.get(userId)?.destroy();
    const t = this.add.text(0, 0, text, {
      fontFamily: "Inter", fontSize: "12px", color: "#050505", backgroundColor: "#f2efe9",
      padding: { x: 8, y: 5 }, wordWrap: { width: 180 },
    }).setOrigin(0.5, 1).setDepth(20);
    t.follow = target;
    this.bubbles.set(userId, t);
    this.time.delayedCall(4500, () => { if (this.bubbles.get(userId) === t) { t.destroy(); this.bubbles.delete(userId); } });
  }

  // --------- loop ---------
  update(_t, dtMs) {
    const dt = Math.min(dtMs / 1000, 0.1);
    const k = this.keys;
    let dx = 0, dy = 0;
    if (!this.frozen) {
      if (k.left.isDown || k.left2.isDown) dx -= 1;
      if (k.right.isDown || k.right2.isDown) dx += 1;
      if (k.up.isDown || k.up2.isDown) dy -= 1;
      if (k.down.isDown || k.down2.isDown) dy += 1;
      if (dx || dy) this.clickTarget = null;
      else if (this.clickTarget) {
        const vx = this.clickTarget.x - this.pos.x, vy = this.clickTarget.y - this.pos.y;
        const d = Math.hypot(vx, vy);
        if (d < 0.15) this.clickTarget = null;
        else { dx = vx / d; dy = vy / d; }
      }
    }
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      if (dx && dy && !this.clickTarget) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
      const nx = this.pos.x + dx * SPEED * dt;
      const ny = this.pos.y + dy * SPEED * dt;
      const r = 0.26;
      let movedX = false, movedY = false;
      if (!this.hits(nx, this.pos.y, r)) { this.pos.x = nx; movedX = true; }
      if (!this.hits(this.pos.x, ny, r)) { this.pos.y = ny; movedY = true; }
      if (this.clickTarget && !movedX && !movedY) this.clickTarget = null; // travou: desiste
      this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      this.player.setPosition(this.pos.x * TILE, this.pos.y * TILE);
      this.updateZone();
      this.checkObjects();
    }
    this.animate(this.player, this.dir, moving);
    const now = performance.now();
    if ((moving || this.wasMoving) && now - this.lastSent > 1000 / SEND_HZ) {
      this.net.emit("move", { x: this.pos.x, y: this.pos.y, dir: this.dir, moving });
      this.lastSent = now;
    }
    this.wasMoving = moving;

    for (const r of this.remote.values()) {
      const tx = r.target.x * TILE, ty = r.target.y * TILE;
      r.container.x += (tx - r.container.x) * Math.min(1, dt * 12);
      r.container.y += (ty - r.container.y) * Math.min(1, dt * 12);
      r.container.setDepth(10 + r.container.y / 10000);
      this.animate(r.container, r.dir, r.moving);
    }
    this.player.setDepth(10 + this.player.y / 10000);
    for (const r of this.npcs?.values() || []) {
      const tx = r.target.x * TILE, ty = r.target.y * TILE;
      r.sprite.x += (tx - r.sprite.x) * Math.min(1, dt * 10);
      r.sprite.y += (ty - r.sprite.y) * Math.min(1, dt * 10);
      r.sprite.setDepth(10 + r.sprite.y / 10000);
      const anim = `npc:${r.kind}:${r.moving ? "walk" : "idle"}:${r.dir || "down"}`;
      if (r.sprite.anims.currentAnim?.key !== anim && this.anims.exists(anim)) r.sprite.play(anim, true);
    }
    for (const b of this.bubbles.values()) b.setPosition(b.follow.x, b.follow.y - 40);
  }

  hits(x, y, r) {
    const pts = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
    return pts.some(([px, py]) => isBlocked(this.map, Math.floor(px), Math.floor(py)));
  }

  updateZone(force) {
    const z = zoneAt(this.map, Math.floor(this.pos.x), Math.floor(this.pos.y));
    const id = z ? z.id : null;
    if (force || id !== this.currentZone) { this.currentZone = id; this.onZoneChange(z); }
  }

  checkObjects() {
    const o = objectNear(this.map, this.pos.x, this.pos.y);
    if ((o && o.id) !== (this.nearObject && this.nearObject.id)) { this.nearObject = o; this.onObjectNear(o); }
  }

  teleportTo(zone) {
    const cx = Math.floor(zone.x + zone.w / 2), cy = Math.floor(zone.y + zone.h / 2);
    for (let rad = 0; rad < 8; rad++) {
      for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
        const tx = cx + ox, ty = cy + oy;
        const occupied = [...this.remote.values()].some((r) => Math.floor(r.target.x) === tx && Math.floor(r.target.y) === ty);
        if (!occupied && !isBlocked(this.map, tx, ty) && zoneAt(this.map, tx, ty)?.id === zone.id) {
          this.pos = { x: tx + 0.5, y: ty + 0.5 };
          this.clickTarget = null;
          this.player.setPosition(this.pos.x * TILE, this.pos.y * TILE);
          this.net.emit("teleport", { x: this.pos.x, y: this.pos.y });
          this.updateZone(); this.checkObjects();
          return;
        }
      }
    }
  }
}

export function createGame(parent, opts) {
  const scene = new WorldScene(opts);
  const game = new Phaser.Game({
    type: new URLSearchParams(location.search).has("canvas") ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    backgroundColor: "#070707",
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    render: { antialias: true, pixelArt: false },
    scene: [scene],
  });
  return { game, scene };
}

import Phaser from "phaser";
import { TILE, isBlocked, zoneAt, objectNear } from "./mapdata.js";
import { ensureAvatarTexture } from "./sprites.js";

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

  create() {
    const { map } = this;
    this.cameras.main.setBackgroundColor("#070707");
    this.drawFloor();
    this.drawZones();
    this.drawWalls();
    this.drawProps();
    this.drawObjects();

    this.player = this.makeAvatar(this.me.name, this.me.color, true);
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

  // --------- desenho do mundo ---------
  drawFloor() {
    const { map } = this;
    const g = this.add.graphics();
    g.fillStyle(0x0b0b0b, 1).fillRect(0, 0, map.width * TILE, map.height * TILE);
    g.lineStyle(1, 0xffffff, 0.03);
    for (let x = 0; x <= map.width; x++) g.lineBetween(x * TILE, 0, x * TILE, map.height * TILE);
    for (let y = 0; y <= map.height; y++) g.lineBetween(0, y * TILE, map.width * TILE, y * TILE);
  }

  drawZones() {
    for (const z of this.map.zones) {
      const g = this.add.graphics();
      const alpha = { silent: 0.02, meeting: 0.06, stage: 0.045, open: 0.03 }[z.kind];
      const x = z.x * TILE + 2, y = z.y * TILE + 2, w = z.w * TILE - 4, h = z.h * TILE - 4;
      g.fillStyle(0xffffff, alpha).fillRoundedRect(x, y, w, h, 10);
      // piso: padrão leve por tipo de área
      if (z.id === "terraco") {
        g.lineStyle(1, 0xffffff, 0.05);
        for (let i = 0; i < w + h; i += 24) g.lineBetween(x + Math.max(0, i - h), y + Math.min(i, h), x + Math.min(i, w), y + Math.max(0, i - w));
      } else if (z.kind === "open" && z.id !== "recepcao") {
        g.fillStyle(0xffffff, 0.02);
        for (let ty = 0; ty < z.h; ty++) for (let tx = (ty % 2); tx < z.w; tx += 2) g.fillRect((z.x + tx) * TILE + 2, (z.y + ty) * TILE + 2, TILE - 4, TILE - 4);
      }
      g.lineStyle(1, 0xffffff, 0.12).strokeRoundedRect(x, y, w, h, 10);
      if (z.stage) {
        const s = z.stage;
        g.fillStyle(0xffffff, 0.08).fillRoundedRect(s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE, 6);
        g.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE, 6);
        this.add.text((s.x + s.w / 2) * TILE, (s.y + s.h / 2) * TILE, "PALCO", {
          fontFamily: "JetBrains Mono", fontSize: "10px", color: "#ffffff", letterSpacing: 3,
        }).setOrigin(0.5).setAlpha(0.5);
      }
      this.add.text(z.x * TILE + 14, z.y * TILE + 8, z.name, {
        fontFamily: "Instrument Serif", fontSize: "22px", color: "#f2efe9",
      }).setAlpha(0.7);
      const tag = { open: "voz por perto", meeting: "call da sala", silent: "silêncio", stage: "auditório" }[z.kind];
      this.add.text(z.x * TILE + 15, z.y * TILE + 34, tag.toUpperCase(), {
        fontFamily: "JetBrains Mono", fontSize: "9px", color: "#f2efe9", letterSpacing: 2,
      }).setAlpha(0.35);
    }
  }

  drawWalls() {
    const g = this.add.graphics();
    for (const w of this.map.walls) {
      if (w.door) continue;
      g.fillStyle(0x1c1c1c, 1).fillRect(w.x * TILE, w.y * TILE, w.w * TILE, w.h * TILE);
      g.fillStyle(0xffffff, 0.14).fillRect(w.x * TILE, w.y * TILE, w.w * TILE, 2);
    }
    for (const w of this.map.walls) {
      if (!w.door) continue;
      g.fillStyle(0x0b0b0b, 1).fillRect(w.x * TILE, w.y * TILE, w.w * TILE, w.h * TILE);
      g.lineStyle(1, 0xffffff, 0.2).strokeRect(w.x * TILE + 3, w.y * TILE + 3, w.w * TILE - 6, w.h * TILE - 6);
    }
    g.lineStyle(2, 0xffffff, 0.18).strokeRect(1, 1, this.map.width * TILE - 2, this.map.height * TILE - 2);
  }

  drawProps() {
    const g = this.add.graphics();
    for (const p of this.map.props) {
      const x = p.x * TILE, y = p.y * TILE, w = p.w * TILE, h = p.h * TILE;
      switch (p.kind) {
        case "plant":
          g.fillStyle(0x2a2a2a, 1).fillCircle(x + 16, y + 20, 8);
          g.fillStyle(0x5a5a5a, 1).fillCircle(x + 16, y + 12, 9);
          g.fillStyle(0x7a7a7a, 1).fillCircle(x + 12, y + 9, 5);
          break;
        case "sofa":
          g.fillStyle(0x222222, 1).fillRoundedRect(x + 3, y + 6, w - 6, h - 8, 8);
          g.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(x + 3, y + 6, w - 6, h - 8, 8);
          g.fillStyle(0xffffff, 0.06).fillRoundedRect(x + 6, y + 8, w - 12, 8, 4);
          break;
        case "bench":
          g.fillStyle(0x1e1e1e, 1).fillRoundedRect(x + 2, y + 10, w - 4, 14, 4);
          g.lineStyle(1, 0xffffff, 0.2).strokeRoundedRect(x + 2, y + 10, w - 4, 14, 4);
          for (let i = 1; i < p.w; i++) g.lineBetween(x + i * TILE, y + 12, x + i * TILE, y + 22);
          break;
        case "desk":
          g.fillStyle(0x1a1a1a, 1).fillRoundedRect(x + 3, y + 5, w - 6, h - 8, 4);
          g.lineStyle(1, 0xffffff, 0.3).strokeRoundedRect(x + 3, y + 5, w - 6, h - 8, 4);
          for (let i = 0; i < p.w; i++) { // monitores
            g.fillStyle(0x0a0a0a, 1).fillRect(x + i * TILE + 9, y + 8, 14, 9);
            g.lineStyle(1, 0xffffff, 0.35).strokeRect(x + i * TILE + 9, y + 8, 14, 9);
            g.fillStyle(0xffffff, 0.12).fillRect(x + i * TILE + 11, y + 10, 10, 5);
          }
          break;
        default: // table, counter
          g.fillStyle(0x1a1a1a, 1).fillRoundedRect(x + 4, y + 4, w - 8, h - 8, 6);
          g.lineStyle(1, 0xffffff, 0.3).strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, 6);
          g.fillStyle(0xffffff, 0.06).fillRoundedRect(x + 8, y + 8, w - 16, h - 16, 4);
      }
    }
  }

  drawObjects() {
    const icons = { board: "▤", link: "⇗", video: "▶", info: "i" };
    for (const o of this.map.objects || []) {
      const x = o.x * TILE, y = o.y * TILE, w = o.w * TILE, h = o.h * TILE;
      const g = this.add.graphics();
      g.fillStyle(0x151515, 1).fillRoundedRect(x + 3, y + 3, w - 6, h - 6, 5);
      g.lineStyle(1, 0xffffff, 0.45).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 5);
      if (o.kind === "video") g.fillStyle(0xffffff, 0.08).fillRect(x + 7, y + 7, w - 14, h - 14);
      this.add.text(x + w / 2, y + h / 2, icons[o.kind] || "•", {
        fontFamily: "Inter", fontSize: "13px", color: "#f2efe9",
      }).setOrigin(0.5).setAlpha(0.85);
      this.add.text(x + w / 2, y + h + 2, o.label, {
        fontFamily: "JetBrains Mono", fontSize: "8px", color: "#f2efe9", letterSpacing: 1,
      }).setOrigin(0.5, 0).setAlpha(0.45);
    }
  }

  // --------- avatares ---------
  makeAvatar(name, color, isMe) {
    const c = this.add.container(0, 0);
    const key = ensureAvatarTexture(this, color);
    if (isMe) {
      const ring = this.add.graphics();
      ring.lineStyle(1, 0xffffff, 0.16).strokeCircle(0, 4, this.map.proximityRadius * TILE);
      ring.fillStyle(0xffffff, 0.02).fillCircle(0, 4, this.map.proximityRadius * TILE);
      c.add(ring);
    }
    const speak = this.add.graphics();
    speak.lineStyle(2, 0x6ef0a3, 0.9).strokeEllipse(0, 20, 30, 12);
    speak.setVisible(false);
    c.add(speak); c.speak = speak;

    const sprite = this.add.sprite(0, 0, key, 0).setScale(2).setOrigin(0.5, 0.75);
    c.add(sprite); c.sprite = sprite; c.texKey = key; c.dirNow = "down";

    const label = this.add.text(0, 22, name, {
      fontFamily: "Inter", fontSize: "11px", color: "#f2efe9",
      backgroundColor: "rgba(0,0,0,0.55)", padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 0);
    c.add(label); c.label = label;
    const dot = this.add.graphics(); c.add(dot); c.dot = dot;
    c.mic = this.add.text(14, -30, "", { fontFamily: "Inter", fontSize: "10px" }).setOrigin(0.5);
    c.add(c.mic);
    c.setDepth(10);
    this.setStatus(c, "available");
    return c;
  }

  setStatus(c, status) {
    if (c.statusNow === status) return;
    c.statusNow = status;
    c.dot.clear();
    c.dot.fillStyle(STATUS_COLOR[status] || STATUS_COLOR.available, 1).fillCircle(-c.label.width / 2 - 1, 28, 3);
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
        r = { container: this.makeAvatar(p.name, p.color, false), target: { x: p.x, y: p.y }, dir: p.dir || "down" };
        r.container.setPosition(p.x * TILE, p.y * TILE);
        this.remote.set(p.id, r);
      }
      r.target = { x: p.x, y: p.y };
      r.dir = p.dir || r.dir;
      r.moving = !!p.moving;
      r.container.mic.setText(p.muted ? "🔇" : "");
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
  setMuted(m) { this.player.mic.setText(m ? "🔇" : ""); }

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
    for (const b of this.bubbles.values()) b.setPosition(b.follow.x, b.follow.y - 34);
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

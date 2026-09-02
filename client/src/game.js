import Phaser from "phaser";
import { TILE, isBlocked, zoneAt, objectNear } from "./mapdata.js";
import { ensureAvatarTexture, avatarKey } from "./sprites.js";
import { shadowTexture, glowTexture, waveTexture, steamTexture, screenGlowTexture, drawPixelRing, drawPixelBubble } from "./pixelfx.js";

const SPEED = 4.4; // tiles por segundo
const SEND_HZ = 15;
const STATUS_COLOR = { available: 0x6ef0a3, busy: 0xf06e6e, focus: 0xf0c76e };
const ZOOMS = [1, 2, 3];          // só zoom inteiro: cada pixel da arte vira 1, 2 ou 3 pixels na tela
const DEFAULT_ZOOM = 2;
// o personagem da CraftPix ocupa 13x22 px do quadro de 64: em 2x fica com 1,4 tile de altura (e 2x2 = 4 na tela, inteiro)
const AVATAR_SCALE = 2;
// tiles "de chão" da camada de móveis: ficam rentes ao piso, sem ordenação por profundidade
const FLAT_TILES = /^(floor|rug|grass|path|door|flowers|stage_light|plant_small)/;
// profundidades: 0 chão/paredes · 1 luzes · 2 rasteiro · 3 marcas · 10+y móveis e gente · 20 nomes · 22 escurecimento de outras salas · 24 títulos · 30 balões
const D = { LABEL: 20, DIM: 22, TITLE: 24, BUBBLE: 30 };

export class WorldScene extends Phaser.Scene {
  constructor({ map, me, net, onZoneChange, onObjectNear, locked = [] }) {
    super("world");
    this.map = map;
    this.locked = new Set(locked);
    this.lockMarks = new Map();
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
    this.load.spritesheet("tilesheet", "/assets/tiles/office.png", { frameWidth: TILE, frameHeight: TILE });
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
    shadowTexture(this); waveTexture(this); steamTexture(this); screenGlowTexture(this);
    this.anims.create({ key: "fx:wave", frames: this.anims.generateFrameNumbers("fx:wave", { start: 0, end: 2 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: "fx:steam", frames: this.anims.generateFrameNumbers("fx:steam", { start: 0, end: 3 }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: "fx:screen", frames: this.anims.generateFrameNumbers("fx:screen", { start: 0, end: 1 }), frameRate: 2, repeat: -1 });
    this.drawTilemap();
    this.drawZones();
    this.drawObjects();
    this.drawGraffiti();
    this.drawDecor();
    this.setupNpcAnims();
    this.npcs = new Map();
    this.setLocked([...this.locked]);

    this.player = this.makeAvatar(this.me.name, this.me.avatar, true);
    this.player.setPosition((map.spawn.x + 0.5) * TILE, (map.spawn.y + 0.5) * TILE);
    this.pos = { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 };
    this.dir = "down";

    this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.zoom = DEFAULT_ZOOM;
    this.cameras.main.setZoom(this.zoom);
    this.cameras.main.roundPixels = true;
    // roda do mouse: troca entre zooms inteiros (1x, 2x, 3x)
    this.input.on("wheel", (_p, _o, _dx, dy) => {
      const i = ZOOMS.indexOf(this.zoom), next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (dy > 0 ? -1 : 1)))];
      if (next !== this.zoom) { this.zoom = next; this.cameras.main.setZoom(next); }
    });

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
    for (const name of ["ground", "walls"]) {
      const layer = tm.createLayer(name, ts, 0, 0);
      if (layer) layer.setDepth(0);
    }
    const furn = tm.createLayer("furniture", ts, 0, 0);
    if (furn) { this.sortFurniture(furn, ts); furn.setVisible(false); }
    this.tilemap = tm;
  }

  // Móveis viram imagens individuais ordenadas pela base: quem passa atrás de uma mesa fica atrás dela.
  // Tiles empilhados na mesma coluna (mesa de 2 linhas, mesa + cadeira) compartilham a base do de baixo.
  sortFurniture(layer, ts) {
    const nameOf = (idx) => ts.getTileData(idx)?.type || "";
    const solid = (t) => t && t.index > 0 && !FLAT_TILES.test(nameOf(t.index)) && nameOf(t.index) !== "chair_back";
    const w = layer.layer.width, h = layer.layer.height;
    this.chairs = new Map();   // "x,y" -> direção que a cadeira encara (pra "sentar")
    this.chairBase = new Map(); // "x,y" -> base (px) da pilha mesa+cadeira
    this.occupied = new Set(); // tiles com móvel (pra achar lugar livre pros títulos)
    const baseOf = new Map(); // "x,y" -> y da base (px) do empilhamento
    for (let x = 0; x < w; x++) {
      let base = null;
      for (let y = h - 1; y >= 0; y--) {
        const t = layer.getTileAt(x, y);
        if (!solid(t)) { base = null; continue; }
        if (base === null) base = (y + 1) * TILE;
        baseOf.set(`${x},${y}`, base);
      }
    }
    layer.forEachTile((t) => {
      if (!t || t.index <= 0) return;
      const frame = t.index - ts.firstgid, name = nameOf(t.index);
      this.occupied.add(`${t.x},${t.y}`);
      if (name === "chair" || name === "chair_back") {
        // encara o móvel vizinho: cadeira normal olha pra cima (mesa acima), de costas olha pra baixo
        const above = layer.getTileAt(t.x, t.y - 1), below = layer.getTileAt(t.x, t.y + 1);
        this.chairs.set(`${t.x},${t.y}`, name === "chair_back" ? "down" : solid(above) ? "up" : solid(below) ? "down" : "down");
        this.chairBase.set(`${t.x},${t.y}`, baseOf.get(`${t.x},${t.y}`) || (t.y + 1) * TILE);
      }
      if (name === "chair_back") { this.add.image(t.pixelX, t.pixelY, "tilesheet", frame).setOrigin(0).setDepth(10 + (t.pixelY + TILE - 14) / 10000); return; }
      const img = this.add.image(t.pixelX, t.pixelY, "tilesheet", frame).setOrigin(0);
      if (FLAT_TILES.test(name)) { img.setDepth(2); return; }
      img.setDepth(10 + (baseOf.get(`${t.x},${t.y}`) - 4) / 10000);
      this.decorateTile(name, t.pixelX, t.pixelY, img.depth);
    });
  }

  // micro-animações ambientais por tipo de móvel
  decorateTile(name, px, py, depth) {
    if (name === "coffee") this.add.sprite(px + 8, py - 6, "fx:steam", 0).setOrigin(0).setDepth(depth + 0.00001).setAlpha(0.8).play("fx:steam");
    else if (/^(screen_m|tv|desk_m)$/.test(name)) this.add.sprite(px, py, "fx:screen", 0).setOrigin(0).setDepth(depth + 0.00001).play({ key: "fx:screen", startFrame: (px / TILE) % 2 });
    else if (name === "lamp_post") this.add.image(px + TILE / 2, py + TILE + 6, glowTexture(this, 96, 48, "255,240,200", 3)).setAlpha(0.14).setDepth(1);
  }

  // texto nítido no zoom inteiro (renderiza em 2x e mostra em escala)
  txt(x, y, str, style) { return this.add.text(x, y, str, { resolution: 2, ...style }); }

  drawZones() {
    for (const z of this.map.zones) {
      const x = z.x * TILE, y = z.y * TILE, w = z.w * TILE, h = z.h * TILE;
      // luz ambiente com dithering: mais clara no centro
      const gw = Math.round(w * 0.9 / 4) * 4, gh = Math.round(h * 0.9 / 4) * 4;
      this.add.image(x + w / 2, y + h / 2, glowTexture(this, gw, gh)).setAlpha(z.kind === "meeting" ? 0.05 : 0.03).setDepth(1);
      if (z.stage) {
        const s = z.stage;
        for (let i = 0; i < 4; i++) {
          const sx = (s.x + 3 + i * (s.w - 6) / 3) * TILE;
          this.add.image(sx, (s.y + 1) * TILE, glowTexture(this, 140, 60, "255,244,220", 4)).setAlpha(0.09).setDepth(1);
        }
        this.txt((s.x + s.w / 2) * TILE, (s.y + s.h / 2) * TILE, "PALCO", {
          fontFamily: "JetBrains Mono", fontSize: "10px", color: "#ffffff", letterSpacing: 3,
        }).setOrigin(0.5).setAlpha(0.45).setDepth(3);
      }
      // título num trecho livre da primeira linha da sala (sem móvel/objeto embaixo)
      const spot = this.freeSpot(z, 5, 2);
      const tx = spot.x * TILE + 6, ty = spot.y * TILE + 4;
      this.txt(tx, ty, z.name, { fontFamily: "Instrument Serif", fontSize: "22px", color: "#f2efe9", stroke: "#000000", strokeThickness: 3 }).setAlpha(0.8).setDepth(D.TITLE);
      const tag = { open: "voz por perto", meeting: "call da sala", silent: "silêncio", stage: "auditório" }[z.kind];
      this.txt(tx + 1, ty + 26, tag.toUpperCase(), { fontFamily: "JetBrains Mono", fontSize: "9px", color: "#f2efe9", letterSpacing: 2, stroke: "#000000", strokeThickness: 2 }).setAlpha(0.5).setDepth(D.TITLE);
      // escurecimento quando você está em outra sala (foco na sala atual)
      const dim = this.add.graphics().setDepth(D.DIM).setAlpha(0);
      dim.fillStyle(0x000000, 0.42).fillRect(x, y, w, h);
      z.dim = dim;
    }
  }

  // primeiro bloco de `w`x`h` tiles livre (sem móvel, objeto ou parede) varrendo a sala de cima pra baixo
  freeSpot(z, w, h) {
    const busy = (tx, ty) => this.occupied?.has(`${tx},${ty}`) || isBlocked(this.map, tx, ty) ||
      (this.map.objects || []).some((o) => tx >= o.x - 1 && tx < o.x + o.w + 1 && ty >= o.y - 1 && ty < o.y + o.h + 1);
    for (let ty = z.y; ty <= z.y + z.h - h; ty++) for (let tx = z.x; tx <= z.x + z.w - w; tx++) {
      let ok = true;
      for (let j = 0; j < h && ok; j++) for (let i = 0; i < w; i++) if (busy(tx + i, ty + j)) { ok = false; break; }
      if (ok) return { x: tx, y: ty };
    }
    return { x: z.x, y: z.y };
  }

  // sala atual clara, as outras escurecem (no corredor, nada escurece)
  focusZone(id) {
    for (const z of this.map.zones) {
      if (!z.dim) continue;
      const want = id && z.id !== id ? 1 : 0;
      if (z.dim.alpha !== want) this.tweens.add({ targets: z.dim, alpha: want, duration: 350 });
    }
  }

  drawObjects() {
    for (const o of this.map.objects || []) {
      const x = o.x * TILE, y = o.y * TILE, w = o.w * TILE, h = o.h * TILE;
      const glow = this.add.graphics().setDepth(3);
      // contorno em pixels com cantos chanfrados
      glow.fillStyle(0xffffff, 0.6);
      glow.fillRect(x + 2, y, w - 4, 1); glow.fillRect(x + 2, y + h - 1, w - 4, 1); glow.fillRect(x, y + 2, 1, h - 4); glow.fillRect(x + w - 1, y + 2, 1, h - 4);
      glow.fillRect(x + 1, y + 1, 1, 1); glow.fillRect(x + w - 2, y + 1, 1, 1); glow.fillRect(x + 1, y + h - 2, 1, 1); glow.fillRect(x + w - 2, y + h - 2, 1, 1);
      this.tweens.add({ targets: glow, alpha: { from: 0.3, to: 1 }, duration: 1600, yoyo: true, repeat: -1 });
      this.txt(x + w / 2, y + h + 1, o.label, { fontFamily: "JetBrains Mono", fontSize: "8px", color: "#f2efe9", letterSpacing: 1, backgroundColor: "rgba(0,0,0,0.45)", padding: { x: 3, y: 1 } }).setOrigin(0.5, 0).setAlpha(0.7).setDepth(D.LABEL - 1);
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
      this.add.image(cx, by - 4, "fx:shadow").setScale(2, 1.2).setAlpha(0.5).setDepth(2);
      // balanço leve da copa
      this.tweens.add({ targets: img, scaleX: { from: 0.985, to: 1.015 }, duration: 1800 + (cx % 700), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
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
      if (!r && n.kind === "agent") {
        const c = this.makeAvatar(n.name, n.avatar, false);
        c.setPosition(n.x * TILE, n.y * TILE);
        c.label.setText(`${n.name}${n.role ? " · " + n.role : ""}`);
        c.label.setStyle({ color: "#9ad0ff" });
        const tag = this.txt(0, -56, "IA", { fontFamily: "JetBrains Mono", fontSize: "9px", color: "#050505", backgroundColor: "#9ad0ff", padding: { x: 4, y: 1 } }).setOrigin(0.5);
        c.add(tag);
        r = { sprite: c, target: { x: n.x, y: n.y }, kind: "agent", name: n.name, role: n.role, container: c, avatarKey: c.texKey };
        this.npcs.set(n.id, r);
      } else if (!r) {
        if (!this.textures.exists(`npc:${n.kind}:idle`)) continue;
        const sp = this.add.sprite(n.x * TILE, n.y * TILE, `npc:${n.kind}:idle`, 0).setOrigin(0.5, 0.8);
        const sh = this.add.image(sp.x, sp.y + 4, "fx:shadow").setScale(0.8, 0.8).setAlpha(0.45).setDepth(2);
        r = { sprite: sp, shadow: sh, target: { x: n.x, y: n.y }, kind: n.kind };
        this.npcs.set(n.id, r);
      }
      if (r.kind === "agent" && n.avatar && avatarKey(n.avatar) !== r.container.texKey) r.container.setAvatar(n.avatar);
      r.target = { x: n.x, y: n.y }; r.dir = n.dir; r.moving = n.moving;
    }
    for (const [id, r] of this.npcs) if (!seen.has(id)) { r.sprite.destroy(); r.shadow?.destroy(); this.npcs.delete(id); }
  }

  // --------- avatares ---------
  makeAvatar(name, avatar, isMe) {
    const c = this.add.container(0, 0);
    const key = ensureAvatarTexture(this, avatar);
    if (isMe) {
      const ring = this.add.graphics();
      drawPixelRing(ring, 0, 4, this.map.proximityRadius * TILE, 0xffffff, 0.3);
      c.add(ring);
    }
    c.shadow = this.add.image(0, 3, "fx:shadow").setAlpha(0.55); c.add(c.shadow); // sombra de contato
    const speak = this.add.sprite(0, -50, "fx:wave", 0).setOrigin(0.5, 1);
    speak.play("fx:wave"); speak.setVisible(false);
    c.add(speak); c.speak = speak;

    const sprite = this.add.sprite(0, 0, key + ":walk", 0).setScale(AVATAR_SCALE).setOrigin(0.5, 44 / 64);
    c.add(sprite); c.sprite = sprite; c.texKey = key; c.dirNow = "down";
    c.setAvatar = (a) => {
      const k = ensureAvatarTexture(this, a);
      if (k === c.texKey) return;
      c.texKey = k; c.sprite.setTexture(k + ":walk", 0);
    };

    // nome + bolinha de status ficam numa camada acima dos móveis (senão mesa/balcão cobrem o nome)
    const tag = this.add.container(0, 0).setDepth(D.LABEL);
    const label = this.txt(0, 6, name, {
      fontFamily: "Inter", fontSize: "11px", color: "#f2efe9",
      backgroundColor: "rgba(0,0,0,0.55)", padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 0);
    const dot = this.add.graphics();
    tag.add([label, dot]); c.label = label; c.dot = dot; c.tag = tag;
    c.on("destroy", () => tag.destroy());
    c.mic = this.txt(17, -46, "", { fontFamily: "Inter", fontSize: "12px", color: "#f06e6e", fontStyle: "bold" }).setOrigin(0.5);
    c.add(c.mic);
    c.setDepth(10);
    this.setStatus(c, "available");
    return c;
  }

  // sentado de frente pra mesa (de costas pra câmera): sobe o sprite e deixa mesa+cadeira na frente do tronco
  setSeated(c, dir, key) {
    const up = dir === "up" && !!key;
    if (c.seatedUp === up) return up;
    c.seatedUp = up; c.seatKey = key;
    c.sprite.y = up ? -18 : 0; c.shadow.setVisible(!up);
    return up;
  }
  depthFor(c, y) { return c.seatedUp && this.chairBase?.has(c.seatKey) ? 10 + (this.chairBase.get(c.seatKey) - 6) / 10000 : 10 + y / 10000; }

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
      const seatKey = `${Math.floor(p.x)},${Math.floor(p.y)}`, ch = !r.moving && this.chairs?.get(seatKey);
      if (ch) { r.target = { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.6 }; r.dir = ch; }
      this.setSeated(r.container, ch || null, ch ? seatKey : null);
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
    // balão estilo RPG em pixels: caixa desenhada por trás do texto, rabicho na cabeça
    const t = this.add.container(0, 0).setDepth(D.BUBBLE);
    const txt = this.txt(0, -11, text, { fontFamily: "Inter", fontSize: "12px", color: "#050505", wordWrap: { width: 180 }, align: "center" }).setOrigin(0.5, 1);
    const w = Math.ceil(txt.width) + 16, h = Math.ceil(txt.height) + 10;
    const box = this.add.graphics(); drawPixelBubble(box, w, h);
    t.add([box, txt]);
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
    // parou numa cadeira: encaixa no assento e vira pra mesa ("sentar")
    if (!moving && !this.frozen) {
      const ch = this.chairs?.get(`${Math.floor(this.pos.x)},${Math.floor(this.pos.y)}`);
      if (ch) {
        const cx = Math.floor(this.pos.x) + 0.5, cy = Math.floor(this.pos.y) + 0.6;
        if (Math.abs(this.pos.x - cx) > 0.01 || Math.abs(this.pos.y - cy) > 0.01) {
          this.pos.x += (cx - this.pos.x) * Math.min(1, dt * 10); this.pos.y += (cy - this.pos.y) * Math.min(1, dt * 10);
          if (Math.hypot(cx - this.pos.x, cy - this.pos.y) < 0.02) { this.pos.x = cx; this.pos.y = cy; }
          this.player.setPosition(this.pos.x * TILE, this.pos.y * TILE);
          this.sitSync = true;
        }
        if (this.dir !== ch) { this.dir = ch; this.sitSync = true; }
        this.setSeated(this.player, ch, `${Math.floor(this.pos.x)},${Math.floor(this.pos.y)}`);
      } else this.setSeated(this.player, null, null);
    } else if (moving) this.setSeated(this.player, null, null);
    if (this.sitSync && !moving && performance.now() - this.lastSent > 120) { this.net.emit("move", { x: this.pos.x, y: this.pos.y, dir: this.dir, moving: false }); this.lastSent = performance.now(); this.sitSync = false; }
    this.animate(this.player, this.dir, moving);
    const now = performance.now();
    if (now - (this.lastNearCheck || 0) > 300) { this.lastNearCheck = now; this.checkObjects(); }
    if ((moving || this.wasMoving) && now - this.lastSent > 1000 / SEND_HZ) {
      this.net.emit("move", { x: this.pos.x, y: this.pos.y, dir: this.dir, moving });
      this.lastSent = now;
    }
    this.wasMoving = moving;

    for (const r of this.remote.values()) {
      const tx = r.target.x * TILE, ty = r.target.y * TILE;
      r.container.x += (tx - r.container.x) * Math.min(1, dt * 12);
      r.container.y += (ty - r.container.y) * Math.min(1, dt * 12);
      r.container.setDepth(this.depthFor(r.container, r.container.y));
      r.container.tag.setPosition(Math.round(r.container.x), Math.round(r.container.y));
      this.animate(r.container, r.dir, r.moving);
    }
    this.player.setDepth(this.depthFor(this.player, this.player.y));
    this.player.tag.setPosition(Math.round(this.player.x), Math.round(this.player.y));
    for (const r of this.npcs?.values() || []) {
      const tx = r.target.x * TILE, ty = r.target.y * TILE;
      r.sprite.x += (tx - r.sprite.x) * Math.min(1, dt * 10);
      r.sprite.y += (ty - r.sprite.y) * Math.min(1, dt * 10);
      r.sprite.setDepth(10 + r.sprite.y / 10000);
      if (r.shadow) r.shadow.setPosition(r.sprite.x, r.sprite.y + 4);
      if (r.kind === "agent") { r.container.tag.setPosition(Math.round(r.sprite.x), Math.round(r.sprite.y)); this.animate(r.container, r.dir || "down", !!r.moving); continue; }
      const anim = `npc:${r.kind}:${r.moving ? "walk" : "idle"}:${r.dir || "down"}`;
      if (r.sprite.anims.currentAnim?.key !== anim && this.anims.exists(anim)) r.sprite.play(anim, true);
    }
    for (const b of this.bubbles.values()) b.setPosition(Math.round(b.follow.x), Math.round(b.follow.y) - 50);
  }

  blocked(tx, ty) {
    if (isBlocked(this.map, tx, ty)) return true;
    if (this.locked.size && !["admin", "professor"].includes(this.me.role)) { const z = zoneAt(this.map, tx, ty); if (z && this.locked.has(z.id)) return true; }
    return false;
  }
  hits(x, y, r) {
    const pts = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
    return pts.some(([px, py]) => this.blocked(Math.floor(px), Math.floor(py)));
  }

  setLocked(ids) {
    this.locked = new Set(ids);
    for (const [, m] of this.lockMarks) m.destroy();
    this.lockMarks.clear();
    for (const id of this.locked) {
      const z = this.map.zones.find((x) => x.id === id); if (!z) continue;
      const c = this.add.container(0, 0).setDepth(4);
      const g = this.add.graphics();
      g.fillStyle(0xf06e6e, 0.07).fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE);
      g.lineStyle(2, 0xf06e6e, 0.5).strokeRect(z.x * TILE + 1, z.y * TILE + 1, z.w * TILE - 2, z.h * TILE - 2);
      c.add(g);
      c.add(this.txt((z.x + z.w / 2) * TILE, (z.y + z.h / 2) * TILE, "TRANCADA", { fontFamily: "JetBrains Mono", fontSize: "11px", color: "#f0a0a0", letterSpacing: 4, backgroundColor: "rgba(0,0,0,0.5)", padding: { x: 8, y: 4 } }).setOrigin(0.5));
      this.lockMarks.set(id, c);
    }
  }

  // agente (LLM) mais próximo, pra conversar com E
  agentNear(reach = 2.2) {
    let best = null, bd = Infinity;
    for (const [id, r] of this.npcs || []) {
      if (r.kind !== "agent") continue;
      const d = Math.hypot(r.target.x - this.pos.x, r.target.y - this.pos.y);
      if (d < reach && d < bd) { best = { id, name: r.name, role: r.role }; bd = d; }
    }
    return best;
  }

  updateZone(force) {
    const z = zoneAt(this.map, Math.floor(this.pos.x), Math.floor(this.pos.y));
    const id = z ? z.id : null;
    if (force || id !== this.currentZone) { this.currentZone = id; this.focusZone(id); this.onZoneChange(z); }
  }

  checkObjects() {
    let o = objectNear(this.map, this.pos.x, this.pos.y);
    if (!o) { const a = this.agentNear(); if (a) o = { id: "agent:" + a.id, kind: "agent", label: a.name, agentId: a.id, role: a.role }; }
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
    render: { antialias: false, pixelArt: true, roundPixels: true },
    scene: [scene],
  });
  return { game, scene };
}

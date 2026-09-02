// Avatar: personagem base da CraftPix (64x64, 4 direções) pintado em tempo real
// conforme a config (pele, cabelo, cor do cabelo, roupa, acessório).
// Linhas do sheet: 0 frente (down), 1 esquerda, 2 direita, 3 costas (up).
const FW = 64, FH = 64;
const WALK_FRAMES = 6, IDLE_FRAMES = 12;
const DIRS = ["down", "left", "right", "up"];
const ROW = { down: 0, left: 1, right: 2, up: 3 };

export const SKINS = ["#f4dcc4", "#e8c3a0", "#c9926a", "#a06b47", "#6b4530"];
export const HAIR_COLORS = ["#1a1a1a", "#4a2f1f", "#8a5a2b", "#d9b27a", "#e8e0d0", "#7a7a7a"];
export const HAIRS = ["curto", "longo", "raspado", "cacheado", "coque", "moicano", "franja", "afro", "rabo de cavalo"];
export const BODIES = ["humano", "orc"];   // orc = skin premium (pack Orc da CraftPix)
export const ASSET_V = "11";
export const SHIRTS = ["#ffffff", "#c9c9c9", "#8a8a8a", "#3a3a3a", "#e8e0d0", "#8b7355", "#5b6b5a", "#4a5a7a"];
export const ACCESSORIES = ["nenhum", "óculos", "boné", "fone"];
export const DEFAULT_AVATAR = { skin: 1, hair: 0, hairColor: 0, shirt: 0, accessory: 0, body: 0 };

export function normalizeAvatar(a) {
  const n = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  a = a || {};
  return {
    skin: n(a.skin, SKINS.length), hair: n(a.hair, HAIRS.length), hairColor: n(a.hairColor, HAIR_COLORS.length),
    shirt: n(a.shirt, SHIRTS.length), accessory: n(a.accessory, ACCESSORIES.length), body: n(a.body, BODIES.length),
  };
}
export function avatarKey(a) { const n = normalizeAvatar(a); return n.body === 1 ? "av:orc" : `av:${n.skin}${n.hair}${n.hairColor}${n.shirt}${n.accessory}`; }

// ---------- base ----------
const base = { walk: null, idle: null, ready: null };
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function toImageData(im) {
  const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
  const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
  return ctx.getImageData(0, 0, im.width, im.height);
}
export function loadBase() {
  if (!base.ready) base.ready = Promise.all([loadImage(`/assets/char/walk.png?v=${ASSET_V}`), loadImage(`/assets/char/idle.png?v=${ASSET_V}`), loadImage(`/assets/char/orc_idle.png?v=${ASSET_V}`).catch(() => null)])
    .then(([w, i, o]) => { base.walk = toImageData(w); base.idle = toImageData(i); base.orc = o; });
  return base.ready;
}

// paleta de pele do sheet original, do mais claro ao mais escuro
const SKIN_PAL = [[246, 202, 116], [225, 178, 110], [190, 134, 95], [164, 111, 89], [121, 80, 72], [85, 45, 36]];
const EYES = new Set(["63,106,212", "55,74,143", "210,221,232"]);
const clamp = (v) => Math.max(0, Math.min(255, v | 0));
function ramp(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const sh = (k) => [clamp(r * k), clamp(g * k), clamp(b * k)];
  return [[clamp(r + (255 - r) * 0.35), clamp(g + (255 - g) * 0.35), clamp(b + (255 - b) * 0.35)], [r, g, b], sh(0.82), sh(0.66), sh(0.5), sh(0.34)];
}
const PANTS = ramp("#2e2e36"), SHOES = ramp("#1c1c1c");
const skinIndex = (r, g, b) => SKIN_PAL.findIndex((p) => p[0] === r && p[1] === g && p[2] === b);

function bbox(src, fx, fy) {
  let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (src.data[((fy + y) * src.width + fx + x) * 4 + 3]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

const rowFrames = new Map();
function framesInRow(src, row, max) {
  const k = `${src.width}:${row}`;
  if (!rowFrames.has(k)) { let n = 0; for (let f = 0; f < max; f++) { if (bbox(src, f * FW, row * FH)) n = f + 1; else break; } rowFrames.set(k, Math.max(1, n)); }
  return rowFrames.get(k);
}

// Pinta um sheet inteiro (walk ou idle) com a config. Retorna canvas.
export function paintSheet(src, frames, a) {
  a = normalizeAvatar(a);
  const out = document.createElement("canvas"); out.width = src.width; out.height = src.height;
  const ctx = out.getContext("2d"); const img = ctx.createImageData(src.width, src.height);
  const S = src.data, O = img.data, W = src.width;
  const skinR = ramp(SKINS[a.skin]), hairR = ramp(HAIR_COLORS[a.hairColor]), shirtR = ramp(SHIRTS[a.shirt]);
  const H = a.hair, A = a.accessory;
  const put = (x, y, c) => { const i = (y * W + x) * 4; O[i] = c[0]; O[i + 1] = c[1]; O[i + 2] = c[2]; O[i + 3] = 255; };

  for (let r = 0; r < 4; r++) {
    const dir = DIRS[r];
    for (let f = 0; f < frames; f++) {
      const fx = f * FW, fy = r * FH;
      const bb = bbox(src, fx, fy); if (!bb) continue;
      const { x0, y0: top, x1, y1: bot } = bb; const w = x1 - x0;
      const mid = w >> 1, center = (rx) => Math.abs(rx - mid) <= 1;
      const hairAt = (rx, ry) => {
        if (dir === "up") {
          if (H === 5) return ry <= 4 && center(rx);                       // moicano: só a crista
          if (H === 8) return ry <= 9 || (ry <= 14 && center(rx));         // rabo de cavalo desce pelo meio
          return ry <= [9, 11, 8, 10, 9, 4, 9, 11, 9][H];
        }
        const edge = rx <= 1 || rx >= w - 2;
        if (dir === "down") {
          if (H === 2) return ry <= 3;
          if (H === 0) return ry <= 4 || (ry <= 6 && edge);
          if (H === 1) return ry <= 4 || (edge && ry <= 11);
          if (H === 3) return ry <= 5 || (ry <= 7 && edge);
          if (H === 5) return ry <= 3 && center(rx);
          if (H === 6) return ry <= 5 || (ry <= 7 && edge);                // franja cobre a testa
          if (H === 7) return ry <= 6 || (ry <= 9 && edge);                // afro
          if (H === 8) return ry <= 4 || (ry <= 6 && edge);
          return ry <= 4 || (ry <= 6 && edge);
        }
        const backside = dir === "left" ? rx >= mid : rx < mid;
        const backEdge = dir === "left" ? rx >= w - 3 : rx <= 2;
        if (H === 2) return ry <= 3;
        if (H === 0) return ry <= 4 || (ry <= 7 && backEdge);
        if (H === 1) return ry <= 4 || (ry <= 11 && backside);
        if (H === 3) return ry <= 5 || (ry <= 8 && backEdge);
        if (H === 5) return ry <= 3 && center(rx);
        if (H === 6) return ry <= 5 || (ry <= 7 && backEdge);
        if (H === 7) return ry <= 6 || (ry <= 9 && backside);
        if (H === 8) return ry <= 4 || (ry <= 13 && backEdge);            // rabo caindo atrás
        return ry <= 4 || (ry <= 6 && backEdge);
      };
      for (let y = top; y < bot; y++) for (let x = x0; x < x1; x++) {
        const si = ((fy + y) * W + fx + x) * 4;
        if (!S[si + 3]) continue;
        const R = S[si], G = S[si + 1], B = S[si + 2];
        const i = skinIndex(R, G, B);
        const rx = x - x0, ry = y - top;
        const px = fx + x, py = fy + y;
        if (i < 0) {
          if (A === 1 && dir !== "up" && EYES.has(`${R},${G},${B}`)) put(px, py, [24, 24, 28]);
          else put(px, py, [R, G, B]);
          continue;
        }
        let c;
        if (y < top + 11) { // cabeça
          c = hairAt(rx, ry) ? hairR[i] : skinR[i];
          if (A === 2 && ry <= 4) c = i < 4 ? [40, 40, 44] : [24, 24, 26];
          if (A === 2 && ry === 5 && (dir === "down" || (dir === "left" && rx <= 3) || (dir === "right" && rx >= w - 4))) c = [20, 20, 22];
          if (A === 3 && ry === 1) c = [200, 200, 200];
          if (A === 3 && ry >= 7 && ry <= 9 && (rx <= 1 || rx >= w - 2)) c = [210, 210, 215];
          if (A === 1 && ry === 8 && dir === "down" && rx >= 2 && rx <= w - 3) c = i >= 2 ? [24, 24, 28] : [60, 60, 66];
        } else if (y === top + 11) c = skinR[i];               // pescoço
        else if (y < bot - 5) {                                 // tronco
          c = shirtR[i];
          if (y >= bot - 7 && (rx <= 1 || rx >= w - 2)) c = skinR[i]; // mãos
        } else if (y < bot - 2) c = PANTS[i];                   // pernas
        else c = SHOES[i];                                      // pés
        put(px, py, c);
      }
      // volume extra acima da cabeça: coque e cacheado
      const cx = fx + x0 + (w >> 1), ty = fy + top;
      if (H === 4) {
        for (let dx = -2; dx < 2; dx++) { put(cx + dx, ty - 3, hairR[1]); put(cx + dx, ty - 2, hairR[2]); }
        put(cx - 3, ty - 2, hairR[4]); put(cx + 2, ty - 2, hairR[4]);
      }
      if (H === 3) {
        for (let dx = -4; dx < 4; dx++) put(cx + dx, ty - 1, hairR[(dx + 4) % 3 === 0 ? 1 : 2]);
        put(fx + x0, ty + 2, hairR[3]); put(fx + x1 - 1, ty + 2, hairR[3]);
      }
      if (H === 5) { for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx < 1; dx++) put(cx + dx, ty - dy, hairR[dy === 3 ? 1 : 2]); }   // crista do moicano
      if (H === 7) {
        for (let dx = -5; dx < 5; dx++) { put(cx + dx, ty - 1, hairR[2]); if (Math.abs(dx + 0.5) < 4) put(cx + dx, ty - 2, hairR[(dx + 5) % 2 ? 1 : 2]); }
        for (let dy = 0; dy < 8; dy++) { put(fx + x0 - 1, ty + dy, hairR[3]); put(fx + x1, ty + dy, hairR[3]); }
      }
      if (H === 8 && dir !== "down") {                                                       // rabo de cavalo
        const bx = dir === "left" ? fx + x1 : dir === "right" ? fx + x0 - 1 : cx;
        for (let dy = 2; dy < 13; dy++) put(bx, ty + dy, hairR[dy % 3 === 0 ? 1 : 2]);
        if (dir !== "up") put(bx + (dir === "left" ? 1 : -1), ty + 6, hairR[3]);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// Preview de um quadro pro editor (após loadBase)
const ORC_ROW = { down: 0, up: 1, left: 2, right: 3 };
export function drawPreview(canvas, a, dir = "down", scale = 4) {
  if (!base.walk) return;
  canvas.width = 24 * scale; canvas.height = 28 * scale;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (normalizeAvatar(a).body === 1 && base.orc) { ctx.drawImage(base.orc, 14, ORC_ROW[dir] * FH + 12, 36, 34, -6 * scale, -3 * scale, 36 * scale, 34 * scale); return; }
  const sheet = paintSheet(base.walk, 1, a);
  ctx.drawImage(sheet, 20, ROW[dir] * FH + 18, 24, 28, 0, 0, 24 * scale, 28 * scale);
}

// Registra texturas + animações no Phaser pra uma config. Precisa de loadBase() antes.
export function ensureAvatarTexture(scene, a) {
  const key = avatarKey(a);
  if (scene.textures.exists(key + ":walk")) return key;
  if (key === "av:orc") {
    // orc: sheets prontos do pack (idle 4, walk 6, run 8 quadros; linhas frente, costas, esquerda, direita)
    const frames = { idle: 4, walk: 6, run: 8 };
    for (const st of ["idle", "walk", "run"]) {
      const tex = scene.textures.get("orc:" + st); tex.setFilter(1);
      for (const [dir, row] of Object.entries(ORC_ROW))
        scene.anims.create({ key: `${key}:${st}:${dir}`, frames: scene.anims.generateFrameNumbers("orc:" + st, { start: row * frames[st], end: row * frames[st] + frames[st] - 1 }), frameRate: st === "run" ? 14 : st === "walk" ? 10 : 5, repeat: -1 });
    }
    return key;
  }
  const walk = paintSheet(base.walk, WALK_FRAMES, a);
  const idle = paintSheet(base.idle, IDLE_FRAMES, a);
  scene.textures.addSpriteSheet(key + ":walk", walk, { frameWidth: FW, frameHeight: FH });
  scene.textures.addSpriteSheet(key + ":idle", idle, { frameWidth: FW, frameHeight: FH });
  scene.textures.get(key + ":walk").setFilter(1); scene.textures.get(key + ":idle").setFilter(1);
  DIRS.forEach((dir, row) => {
    // só quadros desenhados: a linha "de costas" do idle da CraftPix tem 4 quadros, o resto é vazio (o boneco sumia/piscava)
    const nWalk = framesInRow(base.walk, row, WALK_FRAMES), nIdle = framesInRow(base.idle, row, IDLE_FRAMES);
    scene.anims.create({ key: `${key}:walk:${dir}`, frames: scene.anims.generateFrameNumbers(key + ":walk", { start: row * WALK_FRAMES, end: row * WALK_FRAMES + nWalk - 1 }), frameRate: 10, repeat: -1 });
    scene.anims.create({ key: `${key}:idle:${dir}`, frames: scene.anims.generateFrameNumbers(key + ":idle", { start: row * IDLE_FRAMES, end: row * IDLE_FRAMES + nIdle - 1 }), frameRate: 6, repeat: -1 });
    scene.anims.create({ key: `${key}:run:${dir}`, frames: scene.anims.generateFrameNumbers(key + ":walk", { start: row * WALK_FRAMES, end: row * WALK_FRAMES + nWalk - 1 }), frameRate: 16, repeat: -1 });
  });
  return key;
}

export const SPRITE = { FW, FH, DIRS, ROW };

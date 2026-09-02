// Gera spritesheets de avatar em pixel art por código (sem assets externos).
// 4 direções x 4 quadros, 16x24 px cada, escalado no Phaser.
const FW = 16, FH = 24, FRAMES = 4;
const DIRS = ["down", "left", "right", "up"];

export const SKINS = ["#f4dcc4", "#e8c3a0", "#c9926a", "#a06b47", "#6b4530"];
export const HAIR_COLORS = ["#1a1a1a", "#4a2f1f", "#8a5a2b", "#d9b27a", "#e8e0d0", "#7a7a7a"];
export const HAIRS = ["curto", "longo", "raspado", "cacheado", "coque"];
export const SHIRTS = ["#ffffff", "#c9c9c9", "#8a8a8a", "#3a3a3a", "#e8e0d0", "#8b7355", "#5b6b5a", "#4a5a7a"];
export const ACCESSORIES = ["nenhum", "óculos", "boné", "fone"];

export const DEFAULT_AVATAR = { skin: 1, hair: 0, hairColor: 0, shirt: 0, accessory: 0 };

export function normalizeAvatar(a) {
  const n = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  a = a || {};
  return {
    skin: n(a.skin, SKINS.length), hair: n(a.hair, HAIRS.length), hairColor: n(a.hairColor, HAIR_COLORS.length),
    shirt: n(a.shirt, SHIRTS.length), accessory: n(a.accessory, ACCESSORIES.length),
  };
}
export function avatarKey(a) { const n = normalizeAvatar(a); return `av:${n.skin}${n.hair}${n.hairColor}${n.shirt}${n.accessory}`; }

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

function drawFrame(ctx, ox, oy, dir, frame, a) {
  const skin = SKINS[a.skin], skinD = shade(skin, -40);
  const hair = HAIR_COLORS[a.hairColor], hairD = shade(hair, -30);
  const shirt = SHIRTS[a.shirt], shirtD = shade(shirt, -45);
  const pants = "#26262b", pantsD = "#18181c", shoe = "#0d0d0d", outline = "#0a0a0a";
  const step = [0, 1, 0, -1][frame];
  const bob = frame % 2 === 1 ? 1 : 0;
  const side = dir === "left" || dir === "right";

  // sombra no chão
  px(ctx, ox + 3, oy + 22, 10, 2, "rgba(0,0,0,0.35)");
  // pernas
  const lA = step > 0 ? 1 : 0, lB = step < 0 ? 1 : 0;
  px(ctx, ox + 5, oy + 16 + bob, 3, 4 + lA, pants); px(ctx, ox + 8, oy + 16 + bob, 3, 4 + lB, pants);
  px(ctx, ox + 5, oy + 16 + bob, 1, 4 + lA, pantsD); px(ctx, ox + 10, oy + 16 + bob, 1, 4 + lB, pantsD);
  px(ctx, ox + 5, oy + 20 + bob + lA, 3, 2, shoe); px(ctx, ox + 8, oy + 20 + bob + lB, 3, 2, shoe);
  // tronco
  px(ctx, ox + 4, oy + 10 + bob, 8, 6, shirt);
  px(ctx, ox + 10, oy + 10 + bob, 2, 6, shirtD); // sombra lateral
  px(ctx, ox + 4, oy + 15 + bob, 8, 1, shirtD);
  px(ctx, ox + 3, oy + 10 + bob, 1, 6, outline); px(ctx, ox + 12, oy + 10 + bob, 1, 6, outline);
  if (dir === "down") px(ctx, ox + 7, oy + 10 + bob, 2, 1, skinD); // gola
  // braços
  const swing = side ? step : 0;
  px(ctx, ox + 2, oy + 11 + bob + swing, 2, 4, shirt); px(ctx, ox + 12, oy + 11 + bob - swing, 2, 4, shirt);
  px(ctx, ox + 2, oy + 15 + bob + swing, 2, 1, skin); px(ctx, ox + 12, oy + 15 + bob - swing, 2, 1, skin);
  // cabeça
  px(ctx, ox + 4, oy + 3 + bob, 8, 8, skin);
  px(ctx, ox + 11, oy + 4 + bob, 1, 6, skinD);
  px(ctx, ox + 3, oy + 4 + bob, 1, 6, outline); px(ctx, ox + 12, oy + 4 + bob, 1, 6, outline);
  px(ctx, ox + 6, oy + 11 + bob, 4, 1, skinD); // pescoço
  // cabelo por estilo
  const H = a.hair;
  if (H === 2) { // raspado
    px(ctx, ox + 4, oy + 2 + bob, 8, 2, hair);
    if (dir === "up") px(ctx, ox + 4, oy + 2 + bob, 8, 5, hair);
  } else if (H === 1) { // longo
    px(ctx, ox + 4, oy + 1 + bob, 8, 4, hair);
    px(ctx, ox + 3, oy + 3 + bob, 1, 8, hair); px(ctx, ox + 12, oy + 3 + bob, 1, 8, hairD);
    if (dir === "up") px(ctx, ox + 4, oy + 1 + bob, 8, 10, hair);
    if (dir === "left") px(ctx, ox + 8, oy + 3 + bob, 4, 8, hair);
    if (dir === "right") px(ctx, ox + 4, oy + 3 + bob, 4, 8, hair);
  } else if (H === 3) { // cacheado
    px(ctx, ox + 3, oy + 1 + bob, 10, 4, hair);
    px(ctx, ox + 3, oy + 5 + bob, 1, 2, hair); px(ctx, ox + 12, oy + 5 + bob, 1, 2, hairD);
    px(ctx, ox + 4, oy + 0 + bob, 3, 1, hair); px(ctx, ox + 9, oy + 0 + bob, 3, 1, hair);
    if (dir === "up") px(ctx, ox + 3, oy + 1 + bob, 10, 7, hair);
  } else if (H === 4) { // coque
    px(ctx, ox + 4, oy + 1 + bob, 8, 3, hair);
    px(ctx, ox + 6, oy - 1 + bob, 4, 2, hair);
    if (dir === "up") px(ctx, ox + 4, oy + 1 + bob, 8, 6, hair);
  } else { // curto
    px(ctx, ox + 4, oy + 1 + bob, 8, 3, hair);
    px(ctx, ox + 4, oy + 4 + bob, 1, 2, hair); px(ctx, ox + 11, oy + 4 + bob, 1, 2, hairD);
    if (dir === "up") px(ctx, ox + 4, oy + 1 + bob, 8, 6, hair);
    if (dir === "left") px(ctx, ox + 4, oy + 1 + bob, 3, 6, hair);
    if (dir === "right") px(ctx, ox + 9, oy + 1 + bob, 3, 6, hairD);
  }
  // rosto
  if (dir === "down") { px(ctx, ox + 6, oy + 7 + bob, 1, 1, outline); px(ctx, ox + 9, oy + 7 + bob, 1, 1, outline); px(ctx, ox + 7, oy + 9 + bob, 2, 1, skinD); }
  if (dir === "left") px(ctx, ox + 5, oy + 7 + bob, 1, 1, outline);
  if (dir === "right") px(ctx, ox + 10, oy + 7 + bob, 1, 1, outline);
  // acessórios
  const A = a.accessory;
  if (A === 1 && dir !== "up") { // óculos
    const c = "#e8e0d0";
    if (dir === "down") { px(ctx, ox + 5, oy + 6 + bob, 3, 2, c); px(ctx, ox + 8, oy + 6 + bob, 3, 2, c); px(ctx, ox + 6, oy + 7 + bob, 1, 1, outline); px(ctx, ox + 9, oy + 7 + bob, 1, 1, outline); }
    if (dir === "left") px(ctx, ox + 4, oy + 6 + bob, 3, 2, c);
    if (dir === "right") px(ctx, ox + 9, oy + 6 + bob, 3, 2, c);
  }
  if (A === 2) { // boné
    px(ctx, ox + 4, oy + 1 + bob, 8, 3, "#2a2a2a"); px(ctx, ox + 4, oy + 1 + bob, 8, 1, "#3a3a3a");
    if (dir === "down") px(ctx, ox + 3, oy + 3 + bob, 10, 1, "#1a1a1a");
    if (dir === "left") px(ctx, ox + 1, oy + 3 + bob, 5, 1, "#1a1a1a");
    if (dir === "right") px(ctx, ox + 10, oy + 3 + bob, 5, 1, "#1a1a1a");
  }
  if (A === 3) { // fone
    px(ctx, ox + 4, oy + 1 + bob, 8, 1, "#e8e0d0");
    px(ctx, ox + 3, oy + 5 + bob, 2, 3, "#e8e0d0"); px(ctx, ox + 11, oy + 5 + bob, 2, 3, "#e8e0d0");
  }
}

export function buildSheet(a) {
  a = normalizeAvatar(a);
  const c = document.createElement("canvas");
  c.width = FW * FRAMES; c.height = FH * DIRS.length;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  DIRS.forEach((dir, row) => { for (let f = 0; f < FRAMES; f++) drawFrame(ctx, f * FW, row * FH, dir, f, a); });
  return c;
}

// Preview grande de um quadro (pro editor de avatar)
export function drawPreview(canvas, a, dir = "down", scale = 6) {
  a = normalizeAvatar(a);
  canvas.width = FW * scale; canvas.height = FH * scale;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const tmp = document.createElement("canvas"); tmp.width = FW; tmp.height = FH;
  drawFrame(tmp.getContext("2d"), 0, 0, dir, 0, a);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, FW * scale, FH * scale);
}

export function ensureAvatarTexture(scene, a) {
  const key = avatarKey(a);
  if (scene.textures.exists(key)) return key;
  const canvas = buildSheet(a);
  scene.textures.addSpriteSheet(key, canvas, { frameWidth: FW, frameHeight: FH });
  scene.textures.get(key).setFilter(1); // NEAREST: pixel art nítida
  DIRS.forEach((dir, row) => {
    scene.anims.create({
      key: `${key}:walk:${dir}`,
      frames: scene.anims.generateFrameNumbers(key, { start: row * FRAMES, end: row * FRAMES + FRAMES - 1 }),
      frameRate: 8, repeat: -1,
    });
    scene.anims.create({ key: `${key}:idle:${dir}`, frames: [{ key, frame: row * FRAMES }], frameRate: 1 });
  });
  return key;
}

export const SPRITE = { FW, FH, DIRS };

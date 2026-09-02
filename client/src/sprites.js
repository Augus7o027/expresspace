// Gera spritesheets de avatar em pixel art por código (sem assets externos).
// 4 direções x 4 quadros, 16x24 px cada, escalado no Phaser.
const FW = 16, FH = 24, FRAMES = 4;
const DIRS = ["down", "left", "right", "up"];

function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

function drawFrame(ctx, ox, oy, dir, frame, shirt) {
  const skin = "#e8cfb5", hair = "#1a1a1a", pants = "#2a2a2a", shoe = "#101010", outline = "#0a0a0a";
  const step = [0, 1, 0, -1][frame]; // balanço da caminhada
  const bob = frame % 2 === 1 ? 1 : 0;
  // sombra
  px(ctx, ox + 3, oy + 21, 10, 2, "rgba(0,0,0,0.35)");
  // pernas
  const lA = step > 0 ? 1 : 0, lB = step < 0 ? 1 : 0;
  px(ctx, ox + 5, oy + 15 + bob, 3, 5 + lA, pants); px(ctx, ox + 8, oy + 15 + bob, 3, 5 + lB, pants);
  px(ctx, ox + 5, oy + 20 + bob + lA, 3, 1, shoe); px(ctx, ox + 8, oy + 20 + bob + lB, 3, 1, shoe);
  // corpo
  px(ctx, ox + 4, oy + 9 + bob, 8, 7, shirt);
  px(ctx, ox + 3, oy + 9 + bob, 1, 7, outline); px(ctx, ox + 12, oy + 9 + bob, 1, 7, outline);
  // braços
  const armSwing = dir === "left" || dir === "right" ? step : 0;
  px(ctx, ox + 2, oy + 10 + bob + armSwing, 2, 5, shirt); px(ctx, ox + 12, oy + 10 + bob - armSwing, 2, 5, shirt);
  px(ctx, ox + 2, oy + 15 + bob + armSwing, 2, 1, skin); px(ctx, ox + 12, oy + 15 + bob - armSwing, 2, 1, skin);
  // cabeça
  px(ctx, ox + 4, oy + 2 + bob, 8, 8, skin);
  px(ctx, ox + 3, oy + 3 + bob, 1, 6, outline); px(ctx, ox + 12, oy + 3 + bob, 1, 6, outline);
  // cabelo
  px(ctx, ox + 4, oy + 1 + bob, 8, 3, hair);
  if (dir === "up") px(ctx, ox + 4, oy + 1 + bob, 8, 6, hair);
  if (dir === "left") px(ctx, ox + 4, oy + 1 + bob, 3, 6, hair);
  if (dir === "right") px(ctx, ox + 9, oy + 1 + bob, 3, 6, hair);
  // olhos
  if (dir === "down") { px(ctx, ox + 6, oy + 6 + bob, 1, 1, outline); px(ctx, ox + 9, oy + 6 + bob, 1, 1, outline); }
  if (dir === "left") px(ctx, ox + 5, oy + 6 + bob, 1, 1, outline);
  if (dir === "right") px(ctx, ox + 10, oy + 6 + bob, 1, 1, outline);
}

// Retorna um canvas com o sheet: linhas = direções, colunas = quadros
export function buildSheet(shirt) {
  const c = document.createElement("canvas");
  c.width = FW * FRAMES; c.height = FH * DIRS.length;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  DIRS.forEach((dir, row) => { for (let f = 0; f < FRAMES; f++) drawFrame(ctx, f * FW, row * FH, dir, f, shirt); });
  return c;
}

export function ensureAvatarTexture(scene, color) {
  const key = "avatar:" + color;
  if (scene.textures.exists(key)) return key;
  const canvas = buildSheet(color);
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

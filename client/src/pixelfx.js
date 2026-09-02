import Phaser from "phaser";
// Texturas e formas em pixel art geradas em canvas (sombras, luzes com dithering, onda de voz, vapor, balões).
// Tudo é desenhado em pixels inteiros pra casar com o tileset de 32px e o zoom inteiro da câmera.

function canvasTex(scene, key, w, h, draw, frameW) {
  if (scene.textures.exists(key)) return key;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  if (frameW) scene.textures.addSpriteSheet(key, c, { frameWidth: frameW, frameHeight: h });
  else scene.textures.addCanvas(key, c);
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

// Elipse "escadinha": preenche por linhas inteiras, sem antialias
function pixelEllipse(ctx, cx, cy, rx, ry, step = 1) {
  for (let y = -ry; y < ry; y += step) {
    const t = (y + step / 2) / ry;
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)) / step) * step;
    if (half > 0) ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, step);
  }
}

// Sombra de contato sob os pés (22x8)
export function shadowTexture(scene) {
  return canvasTex(scene, "fx:shadow", 22, 8, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.55)"; pixelEllipse(ctx, 11, 4, 11, 4);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; pixelEllipse(ctx, 11, 4, 7, 2.5);
  });
}

// Luz ambiente com dithering (xadrez nas bordas, cheia no centro), em células de `step` px
export function glowTexture(scene, w, h, rgb = "255,255,255", step = 4) {
  const key = `fx:glow:${w}x${h}:${rgb}:${step}`;
  return canvasTex(scene, key, w, h, (ctx) => {
    const rx = w / 2, ry = h / 2;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const nx = (x + step / 2 - rx) / rx, ny = (y + step / 2 - ry) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) continue;
      const cell = (x / step + y / step) % 2 === 0;
      // 4 anéis: centro cheio, depois xadrez cada vez mais ralo
      let a = 0;
      if (d < 0.35) a = 1; else if (d < 0.6) a = cell ? 1 : 0.5; else if (d < 0.82) a = cell ? 1 : 0; else a = cell && (x / step) % 4 === 0 ? 1 : 0;
      if (!a) continue;
      ctx.fillStyle = `rgba(${rgb},${a})`; ctx.fillRect(x, y, step, step);
    }
  });
}

// Onda sonora animada (3 quadros de 12x10): barras que sobem e descem
export function waveTexture(scene) {
  const frames = [[3, 6, 3], [6, 9, 6], [4, 3, 4]], W = 12, H = 10;
  return canvasTex(scene, "fx:wave", W * frames.length, H, (ctx) => {
    frames.forEach((bars, f) => {
      bars.forEach((hh, i) => {
        const x = f * W + 1 + i * 4, y = H - 1 - hh;
        ctx.fillStyle = "#050505"; ctx.fillRect(x - 1, y - 1, 4, hh + 2);
        ctx.fillStyle = "#6ef0a3"; ctx.fillRect(x, y, 2, hh);
      });
    });
  }, W);
}

// Vapor da cafeteira (4 quadros de 16x16): pontinhos subindo
export function steamTexture(scene) {
  const W = 16, H = 16, N = 4;
  return canvasTex(scene, "fx:steam", W * N, H, (ctx) => {
    for (let f = 0; f < N; f++) {
      const pts = [[7, 13 - f * 3], [9, 10 - f * 3], [6, 7 - f * 3], [9, 4 - f * 3]];
      pts.forEach(([x, y], i) => { if (y < 0 || y > 14) return; ctx.fillStyle = `rgba(255,255,255,${0.75 - i * 0.15 - f * 0.08})`; ctx.fillRect(f * W + x, y, 2, 2); });
    }
  }, W);
}

// Brilho de tela ligada (2 quadros 32x32): retângulo claro com scanline
export function screenGlowTexture(scene) {
  return canvasTex(scene, "fx:screen", 64, 32, (ctx) => {
    for (let f = 0; f < 2; f++) {
      ctx.fillStyle = `rgba(200,225,255,${f ? 0.16 : 0.08})`; ctx.fillRect(f * 32 + 6, 6, 20, 14);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(f * 32 + 8, 8 + f * 4, 16, 1);
    }
  }, 32);
}

// Anel de proximidade pontilhado em pixels (Graphics)
export function drawPixelRing(g, cx, cy, r, color = 0xffffff, alpha = 0.35) {
  g.fillStyle(color, alpha);
  const n = Math.max(12, Math.round((2 * Math.PI * r) / 7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 2, 2);
  }
}

// Balão estilo RPG: borda escura 1px, canto chanfrado, rabicho embaixo apontando pra cabeça
export function drawPixelBubble(g, w, h, fill = 0xf2efe9, ink = 0x050505) {
  const x = -Math.round(w / 2), y = -h; // origem: ponta do rabicho em (0,0)
  const top = y - 6;
  g.fillStyle(ink, 1);
  g.fillRect(x + 2, top, w - 4, h); g.fillRect(x, top + 2, w, h - 4); g.fillRect(x + 1, top + 1, w - 2, h - 2);
  g.fillStyle(fill, 1);
  g.fillRect(x + 2, top + 1, w - 4, h - 2); g.fillRect(x + 1, top + 2, w - 2, h - 4);
  // rabicho (3 degraus)
  g.fillStyle(ink, 1); g.fillRect(-4, top + h - 1, 8, 2); g.fillRect(-3, top + h + 1, 6, 2); g.fillRect(-2, top + h + 3, 4, 2); g.fillRect(-1, top + h + 5, 2, 1);
  g.fillStyle(fill, 1); g.fillRect(-3, top + h - 2, 6, 2); g.fillRect(-2, top + h, 4, 2); g.fillRect(-1, top + h + 2, 2, 2);
  // brilho interno no topo
  g.fillStyle(0xffffff, 0.6); g.fillRect(x + 3, top + 2, w - 6, 1);
}

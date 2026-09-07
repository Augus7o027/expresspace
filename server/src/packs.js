// Importador de packs de arte (zip com PNGs, estilo CraftPix): fatia as folhas em peças, guarda em DATA_DIR/packs
// e mantém um índice que a paleta do editor e o gerador do mapa leem. Arte de 16px é ampliada 2x (a densidade do jogo).
// Modos de fatiamento: "auto" (cada desenho separado por transparência vira uma peça) ou "grid16"/"grid32" (grade fixa).
import AdmZip from "adm-zip";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const TILE = 32;
export const INTERACTIONS = { none: "nenhuma", sit: "sentar", lie: "deitar", use: "usar (liga/desliga)", portal: "portal (teleporta)", sign: "placa (mostra texto)", work: "estação de trabalho (senta e entra em foco)" };
export const PIECE_KINDS = { prop: "objeto (bloqueia a base)", decal: "no chão (não bloqueia)", floor: "piso ou caminho (não bloqueia)" };

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "peca";

// ---------- imagem ----------
function decode(buf) { return PNG.sync.read(buf); }
function encode(png) { return PNG.sync.write(png); }
function crop(src, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const si = ((y0 + y) * src.width + (x0 + x)) * 4, di = (y * w + x) * 4; out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3]; }
  return out;
}
function scale2(src) {
  const out = new PNG({ width: src.width * 2, height: src.height * 2 });
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) { const si = ((y >> 1) * src.width + (x >> 1)) * 4, di = (y * out.width + x) * 4; out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3]; }
  return out;
}
function alphaAt(p, x, y) { return x >= 0 && y >= 0 && x < p.width && y < p.height ? p.data[(y * p.width + x) * 4 + 3] : 0; }
function isEmpty(p) { for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 8) return false; return true; }

// componentes conexos por transparência (com tolerância de 1px de vão, pra não partir um desenho em dois)
function components(p, gap = 1) {
  const W = p.width, H = p.height, seen = new Uint8Array(W * H), boxes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (seen[y * W + x] || alphaAt(p, x, y) <= 8) continue;
    let x0 = x, y0 = y, x1 = x, y1 = y; const q = [[x, y]]; seen[y * W + x] = 1; let n = 0;
    while (q.length) {
      const [cx, cy] = q.pop(); n++;
      if (cx < x0) x0 = cx; if (cy < y0) y0 = cy; if (cx > x1) x1 = cx; if (cy > y1) y1 = cy;
      for (let dy = -1 - gap; dy <= 1 + gap; dy++) for (let dx = -1 - gap; dx <= 1 + gap; dx++) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
        if (alphaAt(p, nx, ny) > 8) { seen[ny * W + nx] = 1; q.push([nx, ny]); }
      }
    }
    if (n >= 12) boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  boxes.sort((a, b) => a.y - b.y || a.x - b.x);
  return boxes;
}
// grade fixa: cada célula não vazia vira peça
function gridCells(p, size) {
  const out = [];
  for (let y = 0; y + size <= p.height; y += size) for (let x = 0; x + size <= p.width; x += size) { let any = false; for (let yy = 0; yy < size && !any; yy++) for (let xx = 0; xx < size; xx++) if (alphaAt(p, x + xx, y + yy) > 8) { any = true; break; } if (any) out.push({ x, y, w: size, h: size }); }
  return out;
}
// palpite: folha densa em grade de 16 (poucos vãos) = tileset; senão, objetos soltos
function guessMode(p) {
  if (p.width <= 128 && p.height <= 128) return "auto"; // objeto solto (pasta "separately" da CraftPix)
  if (p.width % 16 || p.height % 16) return "auto";
  // só vira grade quando a folha é um tileset de verdade (quase sem vão); o resto são desenhos soltos
  const cells = gridCells(p, 16).length, total = (p.width / 16) * (p.height / 16);
  return cells >= total * 0.95 ? "grid16" : "auto";
}

// ---------- fatiamento de uma folha ----------
// devolve peças já ampliadas: { id, name, file(png buffer), w, h (tiles), bw, bh, kind }
export function slice(png, { mode = "auto", scale = 2, baseName = "peca" } = {}) {
  const boxes = mode === "grid16" ? gridCells(png, 16) : mode === "grid32" ? gridCells(png, 32) : components(png);
  const pieces = [];
  boxes.forEach((b, i) => {
    let piece = crop(png, b.x, b.y, b.w, b.h);
    if (scale === 2) piece = scale2(piece);
    // encaixa num múltiplo de tile, ancorado embaixo e centralizado (a base do desenho é o que pisa no chão)
    const w = Math.max(1, Math.ceil(piece.width / TILE)), h = Math.max(1, Math.ceil(piece.height / TILE));
    const canvas = new PNG({ width: w * TILE, height: h * TILE });
    const ox = Math.floor((w * TILE - piece.width) / 2), oy = h * TILE - piece.height;
    for (let y = 0; y < piece.height; y++) for (let x = 0; x < piece.width; x++) { const si = (y * piece.width + x) * 4, di = ((y + oy) * canvas.width + (x + ox)) * 4; canvas.data[di] = piece.data[si]; canvas.data[di + 1] = piece.data[si + 1]; canvas.data[di + 2] = piece.data[si + 2]; canvas.data[di + 3] = piece.data[si + 3]; }
    const isTile = mode !== "auto", decal = !isTile && (/road|path|ground|floor|rug|carpet|tile|grass|water/i.test(baseName) || (/shadow/i.test(baseName) && !/no_shadow/i.test(baseName)));
    pieces.push({ id: `${slug(baseName)}-${i + 1}`, name: boxes.length === 1 ? baseName : `${baseName} ${i + 1}`, png: encode(canvas), w, h, bw: isTile || decal ? 0 : w, bh: isTile || decal ? 0 : h <= 2 ? 1 : Math.round(h / 2), kind: isTile ? "floor" : decal ? "decal" : "prop", interact: "none", dir: "down", enabled: true, src: { x: b.x, y: b.y, w: b.w, h: b.h } });
  });
  return pieces;
}

// ---------- repositório ----------
export function packsRepo(store, dataDir) {
  const DIR = path.join(dataDir, "packs");
  const C = "packs";
  const pub = (p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, sheets: p.sheets, pieces: p.pieces.map((x) => ({ ...x, url: `/packs/${p.id}/${x.file}` })) });
  return {
    dir: DIR,
    list: async () => (await store.listDocs(C)).map(pub),
    get: async (id) => { const p = await store.getDoc(C, id); return p ? pub(p) : null; },
    // importa um zip: cada PNG útil vira uma folha fatiada
    importZip: async (buf, name) => {
      const zip = new AdmZip(buf);
      const id = crypto.randomBytes(4).toString("hex");
      const dir = path.join(DIR, id); mkdirSync(dir, { recursive: true });
      const sheets = [], pieces = [];
      const names = zip.getEntries().map((e) => e.entryName);
      const hasSeparate = names.some((n) => /separat/i.test(n) && /\.png$/i.test(n));
      for (const e of zip.getEntries()) {
        const n = e.entryName;
        if (e.isDirectory || !/\.png$/i.test(n) || /__MACOSX|\/\._|preview|coupon|cover|thumbnail/i.test(n)) continue;
        // variantes com sombra pintada só servem num piso específico: fica a versão limpa; folha-fonte é redundante quando há objetos separados
        if (/shadow/i.test(n) && !/no_shadow/i.test(n)) continue;
        if (hasSeparate && /source/i.test(n)) continue;
        let png; try { png = decode(e.getData()); } catch { continue; }
        if (png.width > 2048 || png.height > 2048 || png.width < 8 || isEmpty(png)) continue; // banners e imagens de divulgação ficam de fora
        const base = path.basename(n, path.extname(n));
        // preferimos "sem sombra" quando existem as duas versões; tiles em pastas "Tiled" viram grade
        const mode = guessMode(png);
        const sheetPieces = slice(png, { mode, scale: png.width % 16 === 0 || png.width < 128 ? 2 : 1, baseName: base });
        if (!sheetPieces.length) continue;
        const sheetId = slug(base) + "-" + crypto.randomBytes(2).toString("hex");
        writeFileSync(path.join(dir, sheetId + ".png"), e.getData());
        sheets.push({ id: sheetId, name: base, mode, width: png.width, height: png.height, count: sheetPieces.length, file: sheetId + ".png" });
        for (const pc of sheetPieces) { const file = `${sheetId}--${pc.id}.png`; writeFileSync(path.join(dir, file), pc.png); const { png: _p, ...meta } = pc; pieces.push({ ...meta, id: `${sheetId}--${pc.id}`, sheet: sheetId, file }); }
      }
      if (!pieces.length) { rmSync(dir, { recursive: true, force: true }); throw new Error("nenhuma folha PNG aproveitável no zip"); }
      const doc = { id, name: String(name || "pack").replace(/\.zip$/i, "").slice(0, 60), createdAt: new Date().toISOString(), sheets, pieces };
      await store.putDoc(C, id, doc);
      return pub(doc);
    },
    // refatia uma folha com outro modo (auto/grid16/grid32) e escala
    reslice: async (id, sheetId, { mode, scale }) => {
      const p = await store.getDoc(C, id); if (!p) throw new Error("pack não existe");
      const sh = p.sheets.find((s) => s.id === sheetId); if (!sh) throw new Error("folha não existe");
      const png = decode(readFileSync(path.join(DIR, id, sh.file)));
      for (const pc of p.pieces.filter((x) => x.sheet === sheetId)) { try { rmSync(path.join(DIR, id, pc.file)); } catch {} }
      p.pieces = p.pieces.filter((x) => x.sheet !== sheetId);
      const news = slice(png, { mode, scale: scale === 1 ? 1 : 2, baseName: sh.name });
      for (const pc of news) { const file = `${sheetId}--${pc.id}.png`; writeFileSync(path.join(DIR, id, file), pc.png); const { png: _p, ...meta } = pc; p.pieces.push({ ...meta, id: `${sheetId}--${pc.id}`, sheet: sheetId, file }); }
      sh.mode = mode; sh.count = news.length;
      await store.putDoc(C, id, p); return pub(p);
    },
    // edita metadados das peças (nome, tipo, base, interação, ligada/desligada)
    update: async (id, patch) => {
      const p = await store.getDoc(C, id); if (!p) throw new Error("pack não existe");
      if (typeof patch.name === "string") p.name = patch.name.trim().slice(0, 60) || p.name;
      for (const u of Array.isArray(patch.pieces) ? patch.pieces : []) {
        const pc = p.pieces.find((x) => x.id === u.id); if (!pc) continue;
        if (typeof u.name === "string") pc.name = u.name.trim().slice(0, 40) || pc.name;
        if (PIECE_KINDS[u.kind]) pc.kind = u.kind;
        if (u.bh !== undefined) pc.bh = Math.max(0, Math.min(pc.h, parseInt(u.bh, 10) || 0));
        if (u.bw !== undefined) pc.bw = Math.max(0, Math.min(pc.w, parseInt(u.bw, 10) || 0));
        if (INTERACTIONS[u.interact]) pc.interact = u.interact;
        if (["down", "up", "left", "right"].includes(u.dir)) pc.dir = u.dir;
        if (typeof u.enabled === "boolean") pc.enabled = u.enabled;
        if (typeof u.alt === "string") pc.alt = p.pieces.some((x) => x.id === u.alt) ? u.alt : null;
        if (pc.kind !== "prop") { pc.bw = 0; pc.bh = 0; }
      }
      await store.putDoc(C, id, p); return pub(p);
    },
    remove: async (id) => { await store.delDoc(C, id); rmSync(path.join(DIR, id), { recursive: true, force: true }); },
    // índice no formato do props/index.json, só peças ligadas: "pk:<pack>/<peça>" -> { w, h, bw, bh, url, kind, interact, dir, alt }
    propIndex: async () => {
      const out = {};
      for (const p of await store.listDocs(C)) for (const pc of p.pieces) if (pc.enabled !== false) out[`pk:${p.id}/${pc.id}`] = { w: pc.w, h: pc.h, bw: pc.kind === "prop" ? pc.bw : 0, bh: pc.kind === "prop" ? pc.bh : 0, url: `/packs/${p.id}/${pc.file}`, kind: pc.kind, interact: pc.interact || "none", dir: pc.dir || "down", alt: pc.alt ? `/packs/${p.id}/${p.pieces.find((x) => x.id === pc.alt)?.file || ""}` : undefined, name: pc.name, pack: p.name };
      return out;
    },
  };
}

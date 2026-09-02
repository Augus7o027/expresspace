// Carrega o mapa no formato do Tiled (client/public/maps/sede.json) e normaliza pro app.
// Camadas de tiles: ground, walls, furniture (tiles com propriedade "collides" bloqueiam).
// Camadas de objetos: zones (zone/stage), objects (interactive), decor (tree), graffiti, npcs, meta (spawn).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TILE = 32;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Em dev o mapa está em client/public; na imagem de produção só existe o build (client/dist, onde o Vite copia o public/)
// Um mapa enviado pelo painel admin fica em DATA_DIR/maps/sede.json e tem prioridade
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
export const UPLOADED_MAP = path.join(DATA_DIR, "maps", "sede.json");
const CANDIDATES = [process.env.MAP_FILE, UPLOADED_MAP, path.resolve(__dirname, "../../client/public/maps/sede.json"), path.resolve(__dirname, "../../client/dist/maps/sede.json")].filter(Boolean);
export function mapFile() { return CANDIDATES.find((f) => existsSync(f)) || CANDIDATES[0]; }

function props(o) {
  const out = {};
  for (const p of o.properties || []) out[p.name] = p.value;
  return out;
}

export function loadTiled(file = mapFile()) {
  return parseTiled(JSON.parse(readFileSync(file, "utf8")), path.basename(file));
}

export function parseTiled(t, fileName = "sede.json") {
  const W = t.width, H = t.height;
  const mp = props(t);
  const world = {
    name: mp.name || "ExpresSpace", width: W, height: H, proximityRadius: Number(mp.proximityRadius) || 3.2,
    spawn: { x: 2, y: 2 }, zones: [], objects: [], decor: [], graffiti: [], npcs: [], walls: [], props: [],
    grid: [], // linhas de "0"/"1": 1 = bloqueado
  };

  // tiles que colidem (por gid)
  const collides = new Set();
  for (const ts of t.tilesets) for (const tile of ts.tiles || []) {
    if ((tile.properties || []).some((p) => p.name === "collides" && p.value)) collides.add(ts.firstgid + tile.id);
  }
  const grid = new Uint8Array(W * H);
  for (const L of t.layers) {
    if (L.type !== "tilelayer") continue;
    L.data.forEach((g, i) => { if (g && collides.has(g & 0x1fffffff)) grid[i] = 1; });
  }
  // borda do mapa sempre bloqueia
  for (let x = 0; x < W; x++) { grid[x] = 1; grid[(H - 1) * W + x] = 1; }
  for (let y = 0; y < H; y++) { grid[y * W] = 1; grid[y * W + W - 1] = 1; }

  const tx = (v) => Math.round(v / TILE);
  const stages = [];
  for (const L of t.layers) {
    if (L.type !== "objectgroup") continue;
    for (const o of L.objects) {
      const p = props(o);
      const r = { x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE), w: Math.max(1, tx(o.width)), h: Math.max(1, tx(o.height)) };
      switch (o.type) {
        case "zone": world.zones.push({ id: p.id || o.name.toLowerCase(), name: o.name, kind: p.kind || "open", ...r }); break;
        case "stage": stages.push({ zone: p.zone, ...r }); break;
        case "interactive": world.objects.push({ ...r, id: p.id, kind: p.kind, label: p.label || o.name, url: p.url, text: p.text }); break;
        case "tree": world.decor.push({ kind: "tree", sprite: p.sprite || o.name, ...r }); break;
        case "graffiti": world.graffiti.push({ sprite: p.sprite || o.name, x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE), scale: p.scale || 1 }); break;
        case "npc": world.npcs.push({ kind: p.kind || o.name, zone: p.zone }); break;
        case "spawn": world.spawn = { x: Math.floor(o.x / TILE), y: Math.floor(o.y / TILE) }; break;
      }
    }
  }
  for (const s of stages) { const z = world.zones.find((z) => z.id === s.zone); if (z) z.stage = { x: s.x, y: s.y, w: s.w, h: s.h }; }
  // objetos interativos e árvores bloqueiam
  world.tiledGrid = [];
  for (let y = 0; y < H; y++) world.tiledGrid.push(Array.from(grid.subarray(y * W, (y + 1) * W)).join(""));
  for (const o of [...world.objects, ...world.decor]) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = 1;
  for (let y = 0; y < H; y++) world.grid.push(Array.from(grid.subarray(y * W, (y + 1) * W)).join(""));
  world.tiledFile = fileName;
  return world;
}

export const WORLD = loadTiled();

export function zoneAt(world, tx, ty) {
  for (const z of world.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z;
  }
  return null;
}

export function onStage(zone, tx, ty) {
  if (!zone || !zone.stage) return false;
  const s = zone.stage;
  return tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h;
}

export function isBlocked(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return true;
  return world.grid[ty][tx] === "1";
}

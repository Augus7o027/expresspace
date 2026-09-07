// Gera o mapa (Tiled JSON) a partir de um "layout" editável: zonas, paredes, móveis, props, objetos, NPCs.
// Porte do tools/build-map.py pra JS, pra o editor dentro do app salvar sem depender de script nem deploy.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "../../client/public/assets");
const TS = JSON.parse(readFileSync(path.join(ASSETS, "tiles/office.json"), "utf8"));
export const PROPS = JSON.parse(readFileSync(path.join(ASSETS, "props/index.json"), "utf8"));
export const DEFAULT_LAYOUT = JSON.parse(readFileSync(path.join(__dirname, "layout-default.json"), "utf8"));
const TILE = TS.tilewidth, COLS = TS.columns;
const gid = (name) => { const t = TS.tiles[name]; if (!t) throw new Error("tile desconhecido: " + name); return t.id + 1; };

// catálogo pro editor: o que dá pra colocar e de que tamanho
export const FLOORS = ["floor_wood", "floor_wood2", "floor_tile", "floor_marble", "floor_carpet", "floor_carpet2", "floor_concrete", "floor_deck", "grass"];
export const ZONE_KINDS = ["open", "meeting", "stage", "silent"];
export const FURNITURE = {
  desk: { label: "mesa de trabalho (com cadeira)", w: [1, 6], h: [1, 1] }, table: { label: "mesa de reunião (cadeiras em volta)", w: [2, 8], h: [1, 3] },
  sofa: { label: "sofá", w: [1, 5], h: [1, 1] }, counter: { label: "balcão", w: [1, 8], h: [1, 1] }, bench: { label: "banco (auditório)", w: [1, 12], h: [1, 1] },
  bench_park: { label: "banco de praça", w: [1, 3], h: [1, 1] }, bookshelf: { label: "estante", w: [1, 1], h: [1, 1] }, cooler: { label: "bebedouro (som)", w: [1, 1], h: [1, 1] },
  coffee: { label: "cafeteira (som + vapor)", w: [1, 1], h: [1, 1] }, lamp_post: { label: "poste de luz", w: [1, 1], h: [1, 1] }, chair: { label: "cadeira avulsa", w: [1, 1], h: [1, 1] },
};
export const TREES = ["green_l", "green_m", "green_s", "apple_l", "apple_m", "apple_s", "oak_l", "oak_m", "oak_s"];
export const OBJECT_KINDS = { board: "quadro compartilhado", info: "mural (texto)", video: "telão (link em iframe)", link: "link (iframe)", speaker: "caixa de som" };
export const NPC_KINDS = ["fox", "hare", "deer", "boar", "grouse", "seller", "customer"];
export const GRAFFITI = ["expresspace", "slogan", "shortway", "n7", "cafe", "foco", "benice", "greenteam", "loot"];
export function catalog() {
  return { floors: FLOORS, zoneKinds: ZONE_KINDS, furniture: FURNITURE, props: PROPS, trees: TREES, objectKinds: OBJECT_KINDS, npcKinds: NPC_KINDS, graffiti: GRAFFITI, tiles: Object.fromEntries(Object.entries(TS.tiles).map(([k, t]) => [k, t.id])), columns: COLS, tile: TILE };
}

// gerador determinístico de "variação" de piso (mesmo layout → mesmo mapa)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 10000) / 10000; }; }

const INTERACT = ["none", "sit", "lie", "use", "portal", "sign", "work"], DIRS = ["down", "up", "left", "right"];
// packs importados entram por aqui (índice "pk:<pack>/<peça>" -> { w, h, bw, bh, url, interact, ... })
export function generate(layout, packIndex = {}) {
  const L = normalizeLayout(layout, packIndex); L._packs = packIndex;
  const W = L.width, H = L.height;
  const ground = new Array(W * H).fill(0), walls = new Array(W * H).fill(0), furn = new Array(W * H).fill(0);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const put = (layer, x, y, name) => { if (inb(x, y)) layer[idx(x, y)] = gid(name); };
  const get = (layer, x, y) => (inb(x, y) ? layer[idx(x, y)] : 0);
  const rnd = rng(3);

  // piso das zonas (com variações) e palco
  for (const z of L.zones) {
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
      let name = z.floor;
      if (name === "grass" && rnd() < 0.18) name = "grass2";
      if (name === "grass" && rnd() < 0.04) name = "flowers";
      if (name === "floor_wood" && rnd() < 0.15) name = "floor_wood2";
      if (name === "floor_wood" && rnd() < 0.1) name = "floor_wood3";
      if (name === "floor_wood" && rnd() < 0.1) name = "floor_wood4";
      if (name === "grass" && rnd() < 0.12) name = "grass3";
      if (name === "grass" && rnd() < 0.05) name = "grass_dirt";
      if (name === "floor_concrete" && rnd() < 0.12) name = "floor_concrete2";
      put(ground, x, y, name);
    }
    if (z.stage) {
      const s = z.stage;
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) put(ground, x, y, y === s.y + s.h - 1 ? "floor_stage_edge" : "floor_stage");
      for (let x = s.x + 3; x < s.x + s.w - 2; x += 7) put(furn, x, s.y - 1, "stage_light");
    }
  }
  // caminhos
  for (const p of L.paths) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) put(ground, x, y, "path");
  const grassIds = new Set([gid("grass"), gid("grass2"), gid("flowers")]);
  for (const p of L.paths) if (p.h <= 2) for (let x = p.x; x < p.x + p.w; x++) if (get(ground, x, p.y) === gid("path") && grassIds.has(get(ground, x, p.y - 1))) put(ground, x, p.y - 1, "path_edge");

  // paredes e portas
  const outside = (y) => L.zones.some((z) => z.floor === "grass" && y >= z.y - 1);
  for (const wl of L.walls) {
    if (wl.door) { for (let y = wl.y; y < wl.y + wl.h; y++) for (let x = wl.x; x < wl.x + wl.w; x++) { if (inb(x, y)) walls[idx(x, y)] = 0; put(ground, x, y, outside(y) ? "door_outside" : "door"); } continue; }
    for (let y = wl.y; y < wl.y + wl.h; y++) for (let x = wl.x; x < wl.x + wl.w; x++) put(walls, x, y, wl.w === 1 && wl.h > 1 ? "wall_side" : "wall_front");
  }
  const FRONT = gid("wall_front"), SIDE = gid("wall_side"), TOP = gid("wall_top");
  for (let x = 0; x < W; x++) if (get(walls, x, 0) === FRONT) { put(walls, x, 0, "wall_top"); put(walls, x, 1, "wall_front"); }
  for (let y = 2; y < H; y++) for (let x = 0; x < W; x++) if (get(walls, x, y) === FRONT && !get(walls, x, y - 1)) put(walls, x, y - 1, "wall_top");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(walls, x, y) === TOP && get(walls, x + 1, y) === SIDE && get(walls, x + 1, y + 1) !== SIDE) put(walls, x, y, "wall_top_end");
  // janelas nas faces longas de cima e de fundo
  const backRow = L.zones.filter((z) => z.floor === "grass").map((z) => z.y - 1)[0];
  for (let x = 2; x < W - 2; x += 3) { if (get(walls, x, 1) === FRONT) put(walls, x, 1, "wall_front_window"); if (backRow && get(walls, x, backRow) === FRONT) put(walls, x, backRow, "wall_front_window"); }
  for (const l of L.lamps) if (get(walls, l.x, l.y)) put(walls, l.x, l.y, "wall_lamp");
  for (const g of L.graffiti) for (const dx of [-1, 0, 1]) if (get(walls, g.x + dx, g.y) === FRONT) put(walls, g.x + dx, g.y, "wall_graffiti_bg");
  // cerca do jardim
  const garden = L.zones.find((z) => z.floor === "grass");
  if (garden) { for (let x = 0; x < W; x++) put(walls, x, H - 1, "fence"); for (let y = garden.y; y < H; y++) { put(walls, 0, y, "fence"); put(walls, W - 1, y, "fence"); } }

  // móveis feitos de tiles
  const table = (x, y, w, h) => {
    if (h === 1) { for (let i = 0; i < w; i++) put(furn, x + i, y, i === 0 ? "table_l" : i === w - 1 ? "table_r" : "table_m"); return; }
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const top = yy === 0, bot = yy === h - 1, left = xx === 0, right = xx === w - 1;
      put(furn, x + xx, y + yy, top && left ? "table_tl" : top && right ? "table_tr" : bot && left ? "table_bl" : bot && right ? "table_br" : top ? "table_t" : bot ? "table_b" : left ? "table_ml" : right ? "table_mr" : "table_c");
    }
  };
  for (const f of L.furniture) {
    const { kind, x, y, w, h } = f;
    if (kind === "desk") { for (let i = 0; i < w; i++) { put(furn, x + i, y, i === 0 ? "desk_l" : i === w - 1 ? "desk_r" : "desk_m"); if (!get(furn, x + i, y + 1) && !get(walls, x + i, y + 1)) put(furn, x + i, y + 1, "chair"); } }
    else if (kind === "table") { table(x, y, w, h); if (h === 2 && w >= 3) for (let i = 0; i < w; i++) { if (!get(furn, x + i, y - 1) && !get(walls, x + i, y - 1)) put(furn, x + i, y - 1, "chair_back"); if (!get(furn, x + i, y + h) && !get(walls, x + i, y + h)) put(furn, x + i, y + h, "chair"); } }
    else if (kind === "sofa") for (let i = 0; i < w; i++) put(furn, x + i, y, i === 0 ? "sofa_l" : i === w - 1 ? "sofa_r" : "sofa_m");
    else if (kind === "counter") for (let i = 0; i < w; i++) put(furn, x + i, y, i === 0 ? "counter_l" : i === w - 1 ? "counter_r" : "counter_m");
    else if (kind === "bench" || kind === "bench_park") for (let i = 0; i < w; i++) put(furn, x + i, y, kind);
    else put(furn, x, y, kind);
  }
  // tile embaixo dos objetos interativos
  for (const o of L.objects) {
    const screen = (xx) => (xx === 0 ? "screen_l" : xx === o.w - 1 ? "screen_r" : "screen_m");
    if (o.kind === "board") for (let yy = 0; yy < o.h; yy++) put(furn, o.x, o.y + yy, "whiteboard");
    else if (o.kind === "info") for (let xx = 0; xx < o.w; xx++) put(furn, o.x + xx, o.y, "noticeboard");
    else if (o.kind === "video") for (let xx = 0; xx < o.w; xx++) put(furn, o.x + xx, o.y, screen(xx));
    else if (o.kind === "speaker") put(furn, o.x, o.y, "radio");
    else if (o.kind === "link" && o.tile !== "none") for (let xx = 0; xx < o.w; xx++) put(furn, o.x + xx, o.y, screen(xx));
  }

  // ---------- objetos do Tiled ----------
  let oid = 1;
  const obj = (name, type, x, y, w = 0, h = 0, props = null, point = false) => {
    const o = { id: oid++, name, type, x: x * TILE, y: y * TILE, width: w * TILE, height: h * TILE, rotation: 0, visible: true };
    if (point) o.point = true;
    if (props) o.properties = Object.entries(props).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ({ name: k, type: typeof v === "boolean" ? "bool" : typeof v === "number" ? (Number.isInteger(v) ? "int" : "float") : "string", value: v }));
    return o;
  };
  // zonas: tira as linhas que viraram parede
  const rowIsWall = (z, yy) => { for (let xx = z.x; xx < z.x + z.w; xx++) if (!get(walls, xx, yy)) return false; return true; };
  const zones = L.zones.map((z) => ({ ...z, stage: z.stage ? { ...z.stage } : undefined }));
  for (const z of zones) {
    while (z.h > 1 && rowIsWall(z, z.y)) { z.y++; z.h--; }
    while (z.h > 1 && rowIsWall(z, z.y + z.h - 1)) z.h--;
    if (z.stage && z.stage.y < z.y) z.stage.y = z.y;
  }
  const zoneObjs = [];
  for (const z of zones) {
    zoneObjs.push(obj(z.name, "zone", z.x, z.y, z.w, z.h, { id: z.id, kind: z.kind }));
    if (z.stage) zoneObjs.push(obj(z.name + " palco", "stage", z.stage.x, z.stage.y, z.stage.w, z.stage.h, { zone: z.id }));
  }
  const interObjs = L.objects.map((o) => obj(o.label, "interactive", o.x, o.y, o.w, o.h, { id: o.id, kind: o.kind, label: o.label, url: o.url, text: o.text }));
  const decorObjs = [];
  const PI = { ...PROPS, ...(L._packs || {}) };
  for (const p of L.props) { const pi = PI[p.sprite]; if (!pi) continue; decorObjs.push(obj(p.sprite, "prop", p.x, p.y, pi.w, pi.h, { sprite: p.sprite, bw: pi.bw, bh: pi.bh, url: pi.url, interact: (p.interact || pi.interact) && (p.interact || pi.interact) !== "none" ? (p.interact || pi.interact) : undefined, dir: p.dir || pi.dir, alt: pi.alt, text: p.text, label: p.label, toX: p.to?.x, toY: p.to?.y })); }
  for (const t of L.trees) decorObjs.push(obj(t.sprite, "tree2", t.x, t.y, 4, 5, { sprite: t.sprite, bw: 2, bh: 1 }));
  for (const f of L.fires) decorObjs.push(obj("campfire", "fire", f.x, f.y, 3, 3, { sprite: "campfire", bw: 2, bh: 1 }));
  const grafObjs = L.graffiti.map((g) => obj(g.sprite, "graffiti", g.x + 0.5, g.y + 0.5, 0, 0, { sprite: g.sprite }, true));
  const npcObjs = [...L.npcs.map((n) => obj(n.kind, "npc", 0, 0, 0, 0, { kind: n.kind, zone: n.zone }, true)), ...L.staticNpcs.map((n) => obj(n.kind, "npc", n.x, n.y, 0, 0, { kind: n.kind, zone: n.zone, static: true }, true))];
  const metaObjs = [obj("spawn", "spawn", L.spawn.x + 0.5, L.spawn.y + 0.5, 0, 0, null, true)];

  const tilelayer = (id, name, data) => ({ id, name, type: "tilelayer", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data });
  const objlayer = (id, name, objects) => ({ id, name, type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true, objects });
  const tileset = {
    firstgid: 1, name: "office", tilewidth: TILE, tileheight: TILE, tilecount: TS.count, columns: COLS,
    image: "../assets/tiles/office.png", imagewidth: COLS * TILE, imageheight: Math.ceil(TS.count / COLS) * TILE, margin: 0, spacing: 0,
    tiles: Object.entries(TS.tiles).map(([name, t]) => ({ id: t.id, type: name, properties: [{ name: "collides", type: "bool", value: !!t.collides }] })),
  };
  return {
    type: "map", version: "1.10", tiledversion: "1.10.2", orientation: "orthogonal", renderorder: "right-down", infinite: false,
    width: W, height: H, tilewidth: TILE, tileheight: TILE, compressionlevel: -1, nextlayerid: 10, nextobjectid: oid,
    properties: [{ name: "name", type: "string", value: L.name }, { name: "proximityRadius", type: "float", value: L.proximityRadius }],
    tilesets: [tileset],
    layers: [tilelayer(1, "ground", ground), tilelayer(2, "walls", walls), tilelayer(3, "furniture", furn), objlayer(4, "zones", zoneObjs), objlayer(5, "objects", interObjs), objlayer(6, "decor", decorObjs), objlayer(7, "graffiti", grafObjs), objlayer(8, "npcs", npcObjs), objlayer(9, "meta", metaObjs)],
  };
}

// ---------- validação/saneamento do layout vindo do editor ----------
const int = (v, min, max, def = min) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const str = (v, max, def = "") => (typeof v === "string" ? v.trim().slice(0, max) : def);
const slug = (v) => str(v, 40).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
export function normalizeLayout(raw, packIndex = {}) {
  const PI = { ...PROPS, ...packIndex };
  const L = raw && typeof raw === "object" ? raw : {};
  const W = int(L.width, 20, 200, 58), H = int(L.height, 20, 200, 50);
  const rect = (r, maxW = W, maxH = H) => ({ x: int(r.x, 0, W - 1), y: int(r.y, 0, H - 1), w: int(r.w, 1, maxW, 1), h: int(r.h, 1, maxH, 1) });
  const list = (a, max = 400) => (Array.isArray(a) ? a.slice(0, max) : []);
  const zones = list(L.zones, 40).map((z, i) => ({ ...rect(z), id: slug(z.id) || "sala-" + (i + 1), name: str(z.name, 40) || "Sala " + (i + 1), kind: ZONE_KINDS.includes(z.kind) ? z.kind : "open", floor: FLOORS.includes(z.floor) ? z.floor : "floor_wood", stage: z.stage ? rect(z.stage) : undefined }));
  const ids = new Set(); for (const z of zones) { let id = z.id, n = 2; while (ids.has(id)) id = z.id + "-" + n++; z.id = id; ids.add(id); }
  const zoneIds = new Set(zones.map((z) => z.id));
  const objIds = new Set();
  const objects = list(L.objects, 80).map((o, i) => {
    const kind = OBJECT_KINDS[o.kind] ? o.kind : "board";
    let id = slug(o.id) || kind + "-" + (i + 1); let n = 2; while (objIds.has(id)) id = slug(o.id || kind) + "-" + n++; objIds.add(id);
    const r = rect(o, 12, 4);
    return { id, kind, ...r, label: str(o.label, 40) || OBJECT_KINDS[kind], url: kind === "video" || kind === "link" ? (/^(https?:\/\/|\/)/.test(str(o.url, 500)) ? str(o.url, 500) : "/membros") : undefined, text: kind === "info" ? str(o.text, 2000) : undefined, tile: o.tile === "none" ? "none" : undefined };
  });
  return {
    name: str(L.name, 40) || "ExpresSpace", width: W, height: H, spawn: { x: int(L.spawn?.x, 0, W - 1, 2), y: int(L.spawn?.y, 0, H - 1, 2) }, proximityRadius: Math.min(8, Math.max(1.5, Number(L.proximityRadius) || 3.2)),
    zones, walls: list(L.walls, 200).map((w) => ({ ...rect(w), door: !!w.door })), paths: list(L.paths, 60).map((p) => rect(p)), lamps: list(L.lamps, 60).map((l) => ({ x: int(l.x, 0, W - 1), y: int(l.y, 0, H - 1) })),
    furniture: list(L.furniture, 300).map((f) => { const k = FURNITURE[f.kind] ? f.kind : "desk", d = FURNITURE[k]; return { kind: k, x: int(f.x, 0, W - 1), y: int(f.y, 0, H - 1), w: int(f.w, d.w[0], d.w[1], d.w[0]), h: int(f.h, d.h[0], d.h[1], d.h[0]) }; }),
    props: list(L.props, 600).filter((p) => PI[p.sprite]).map((p) => ({ sprite: p.sprite, x: int(p.x, 0, W - 1), y: int(p.y, 0, H - 1), ...(p.text ? { text: str(p.text, 500) } : {}), ...(p.label ? { label: str(p.label, 40) } : {}), ...(INTERACT.includes(p.interact) ? { interact: p.interact } : {}), ...(DIRS.includes(p.dir) ? { dir: p.dir } : {}), ...(p.to && Number.isFinite(Number(p.to.x)) ? { to: { x: int(p.to.x, 0, W - 1), y: int(p.to.y, 0, H - 1) } } : {}) })),
    trees: list(L.trees, 120).filter((t) => TREES.includes(t.sprite)).map((t) => ({ sprite: t.sprite, x: int(t.x, 0, W - 1), y: int(t.y, 0, H - 1) })),
    fires: list(L.fires, 20).map((f) => ({ x: int(f.x, 0, W - 1), y: int(f.y, 0, H - 1) })),
    objects,
    npcs: list(L.npcs, 30).filter((n) => NPC_KINDS.includes(n.kind) && zoneIds.has(n.zone)).map((n) => ({ kind: n.kind, zone: n.zone })),
    staticNpcs: list(L.staticNpcs, 20).filter((n) => NPC_KINDS.includes(n.kind)).map((n) => ({ kind: n.kind, x: Math.min(W - 1, Math.max(0, Number(n.x) || 0)), y: Math.min(H - 1, Math.max(0, Number(n.y) || 0)), zone: zoneIds.has(n.zone) ? n.zone : zones[0]?.id })),
    graffiti: list(L.graffiti, 40).filter((g) => GRAFFITI.includes(g.sprite)).map((g) => ({ sprite: g.sprite, x: int(g.x, 0, W - 1), y: int(g.y, 0, H - 1) })),
  };
}

// alcançabilidade a partir do spawn (pra avisar o editor antes de salvar algo que tranca gente)
export function reachability(parsedMap) {
  const g = parsedMap.grid, H = g.length, W = g[0].length;
  const seen = new Set(); const q = [[parsedMap.spawn.x, parsedMap.spawn.y]]; seen.add(q[0].join(","));
  if (g[parsedMap.spawn.y]?.[parsedMap.spawn.x] !== "0") return { ok: false, reason: "o ponto de entrada está em cima de algo bloqueado" };
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || g[ny][nx] !== "0") continue; const k = nx + "," + ny; if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
  const unreachableZones = parsedMap.zones.filter((z) => { for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (seen.has(x + "," + y)) return false; return true; }).map((z) => z.name);
  const lostObjects = parsedMap.objects.filter((o) => { for (let y = o.y - 1; y <= o.y + o.h; y++) for (let x = o.x - 1; x <= o.x + o.w; x++) if (seen.has(x + "," + y)) return false; return true; }).map((o) => o.label);
  return { ok: !unreachableZones.length && !lostObjects.length, reachable: seen.size, unreachableZones, lostObjects };
}

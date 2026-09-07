// Editor do espaço (admin): coloca, move e apaga móveis, decoração, objetos e bichos em cima do mapa,
// edita salas (nome, tipo, piso) e o ponto de entrada. Salva um "layout"; o servidor gera o mapa e recarrega todo mundo.
// Enquanto edita, a cena esconde o que é editável e este módulo redesenha a partir do layout (WYSIWYG).
const TILE = 32;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k.startsWith("on")) e[k] = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : String(k)); return e; };

// mesma composição de tiles do gerador do servidor (só o que aparece; o servidor é quem manda no arquivo final)
function furnitureTiles(f, occupied) {
  const out = [], { kind, x, y, w, h } = f;
  const free = (xx, yy) => !occupied.has(`${xx},${yy}`);
  if (kind === "desk") { for (let i = 0; i < w; i++) { out.push([x + i, y, i === 0 ? "desk_l" : i === w - 1 ? "desk_r" : "desk_m"]); if (free(x + i, y + 1)) out.push([x + i, y + 1, "chair"]); } }
  else if (kind === "table") {
    if (h === 1) for (let i = 0; i < w; i++) out.push([x + i, y, i === 0 ? "table_l" : i === w - 1 ? "table_r" : "table_m"]);
    else for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const t = yy === 0, b = yy === h - 1, l = xx === 0, r = xx === w - 1; out.push([x + xx, y + yy, t && l ? "table_tl" : t && r ? "table_tr" : b && l ? "table_bl" : b && r ? "table_br" : t ? "table_t" : b ? "table_b" : l ? "table_ml" : r ? "table_mr" : "table_c"]); }
    if (h === 2 && w >= 3) for (let i = 0; i < w; i++) { if (free(x + i, y - 1)) out.push([x + i, y - 1, "chair_back"]); if (free(x + i, y + h)) out.push([x + i, y + h, "chair"]); }
  }
  else if (kind === "sofa") for (let i = 0; i < w; i++) out.push([x + i, y, i === 0 ? "sofa_l" : i === w - 1 ? "sofa_r" : "sofa_m"]);
  else if (kind === "counter") for (let i = 0; i < w; i++) out.push([x + i, y, i === 0 ? "counter_l" : i === w - 1 ? "counter_r" : "counter_m"]);
  else if (kind === "bench" || kind === "bench_park") for (let i = 0; i < w; i++) out.push([x + i, y, kind]);
  else out.push([x, y, kind]);
  return out;
}
function objectTiles(o) {
  const out = [], screen = (xx) => (xx === 0 ? "screen_l" : xx === o.w - 1 ? "screen_r" : "screen_m");
  if (o.kind === "board") for (let yy = 0; yy < o.h; yy++) out.push([o.x, o.y + yy, "whiteboard"]);
  else if (o.kind === "info") for (let xx = 0; xx < o.w; xx++) out.push([o.x + xx, o.y, "noticeboard"]);
  else if (o.kind === "video" || (o.kind === "link" && o.tile !== "none")) for (let xx = 0; xx < o.w; xx++) out.push([o.x + xx, o.y, screen(xx)]);
  else if (o.kind === "speaker") out.push([o.x, o.y, "radio"]);
  return out;
}
const INTER_LABEL = { sit: "sentar", lie: "deitar", use: "ligar/desligar", portal: "portal", sign: "placa", work: "trabalho" };
const OBJ_DEFAULT = { board: { w: 1, h: 2, label: "Quadro" }, info: { w: 3, h: 1, label: "Mural", text: "Escreva aqui o texto do mural." }, video: { w: 5, h: 1, label: "Telão", url: "https://www.youtube.com/embed/jfKfPfyJRdk" }, link: { w: 2, h: 1, label: "Link", url: "/membros" }, speaker: { w: 1, h: 1, label: "Caixa de som" } };

export async function openEditor({ scene, apiJson, toast, onClose }) {
  const { layout: L, catalog: cat, saved } = await apiJson("GET", "/api/admin/layout");
  const root = $("#editor"); root.innerHTML = ""; root.classList.remove("hidden");
  $("#chat").classList.add("hidden");
  scene.setEditMode(true); scene.frozen = false;

  // ---------- estado ----------
  let tool = null, sel = null, hover = null, dirty = false, drag = null, pan = null;
  const history = []; const snap = () => { history.push(JSON.stringify(L)); if (history.length > 60) history.shift(); dirty = true; paintStatus(); };
  const undo = () => { const h = history.pop(); if (!h) return; const prev = JSON.parse(h); for (const k of Object.keys(prev)) L[k] = prev[k]; sel = null; render(); paintProps(); paintStatus(); };
  const pi = (sprite) => cat.props[sprite];
  const rectOf = (t, it) => t === "props" ? { x: it.x, y: it.y, w: pi(it.sprite)?.w || 1, h: pi(it.sprite)?.h || 1 } : t === "trees" ? { x: it.x, y: it.y, w: 4, h: 5 } : t === "fires" ? { x: it.x, y: it.y, w: 3, h: 3 } : t === "staticNpcs" ? { x: Math.floor(it.x), y: Math.floor(it.y), w: 1, h: 1 } : { x: it.x, y: it.y, w: it.w, h: it.h };
  const LISTS = ["objects", "staticNpcs", "props", "trees", "fires", "furniture"]; // ordem de prioridade no clique
  const hit = (tx, ty) => { for (const t of LISTS) for (let i = L[t].length - 1; i >= 0; i--) { const r = rectOf(t, L[t][i]); if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return { list: t, index: i }; } return null; };

  // ---------- desenho ----------
  const gfx = scene.add.graphics().setDepth(45);
  let drawn = [];
  const tileFrame = (name) => cat.tiles[name];
  const img = (x, y, name, depth, alpha = 1) => { const f = tileFrame(name); if (f === undefined) return; const o = scene.add.image(x * TILE, y * TILE, "tilesheet", f).setOrigin(0).setDepth(depth).setAlpha(alpha); drawn.push(o); return o; };
  const pending = new Set();
  const ensureTex = (key, load) => { if (scene.textures.exists(key) || pending.has(key)) return scene.textures.exists(key); pending.add(key); load(); scene.load.once("complete", () => { pending.delete(key); render(); }); scene.load.start(); return false; };
  function render() {
    for (const o of drawn) o.destroy(); drawn = [];
    const occupied = new Set();
    for (const f of L.furniture) for (const [x, y] of furnitureTiles(f, new Set())) occupied.add(`${x},${y}`);
    for (const o of L.objects) for (const [x, y] of objectTiles(o)) occupied.add(`${x},${y}`);
    for (const f of L.furniture) for (const [x, y, name] of furnitureTiles(f, occupied)) img(x, y, name, /chair/.test(name) ? 10 + ((y + 1) * TILE - 2) / 10000 : 10 + ((y + 1) * TILE - 4) / 10000);
    for (const o of L.objects) {
      for (const [x, y, name] of objectTiles(o)) img(x, y, name, 10 + ((y + 1) * TILE - 4) / 10000);
      const t = scene.add.text(o.x * TILE + o.w * TILE / 2, o.y * TILE + o.h * TILE + 1, o.label, { fontFamily: "JetBrains Mono", fontSize: "8px", color: "#f2efe9", backgroundColor: "rgba(0,0,0,0.5)", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5, 0).setDepth(21); drawn.push(t);
    }
    for (const p of L.props) {
      const key = "prop:" + p.sprite, d = pi(p.sprite);
      if (ensureTex(key, () => scene.load.image(key, d?.url || `/assets/props/${p.sprite}.png`))) { const o = scene.add.image(p.x * TILE, p.y * TILE, key).setOrigin(0).setDepth((d?.bh ?? 1) === 0 ? 2 : 10 + ((p.y + (d?.h || 1)) * TILE - 4) / 10000); drawn.push(o); }
      const inter = p.interact || d?.interact;
      if (inter && inter !== "none") { const t = scene.add.text(p.x * TILE + (d?.w || 1) * TILE / 2, p.y * TILE + (d?.h || 1) * TILE + 1, INTER_LABEL[inter] || inter, { fontFamily: "JetBrains Mono", fontSize: "8px", color: "#9ad0ff", backgroundColor: "rgba(0,0,0,0.5)", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5, 0).setDepth(21); drawn.push(t); }
      if (inter === "portal" && p.to) { const t = scene.add.text((p.to.x + 0.5) * TILE, (p.to.y + 0.5) * TILE, "◎ destino", { fontFamily: "JetBrains Mono", fontSize: "8px", color: "#9ad0ff", backgroundColor: "rgba(0,0,0,0.6)", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(21); drawn.push(t); }
    }
    for (const t of L.trees) { const key = "tree2:" + t.sprite; if (ensureTex(key, () => scene.load.spritesheet(key, `/assets/trees2/${t.sprite}.png`, { frameWidth: 128, frameHeight: 160 }))) { const o = scene.add.image(t.x * TILE, t.y * TILE, key, 0).setOrigin(0).setDepth(10 + ((t.y + 5) * TILE - 4) / 10000); drawn.push(o); } }
    for (const f of L.fires) { if (ensureTex("fx:campfire", () => scene.load.spritesheet("fx:campfire", "/assets/fx/campfire.png", { frameWidth: 88, frameHeight: 96 }))) { const o = scene.add.image(f.x * TILE, f.y * TILE, "fx:campfire", 0).setOrigin(0).setDepth(10 + ((f.y + 3) * TILE - 4) / 10000); drawn.push(o); } }
    for (const n of L.staticNpcs) { const t = scene.add.text(n.x * TILE, n.y * TILE, "☺ " + n.kind, { fontFamily: "JetBrains Mono", fontSize: "9px", color: "#9ad0ff", backgroundColor: "rgba(0,0,0,0.6)", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(21); drawn.push(t); }
    { const t = scene.add.text((L.spawn.x + 0.5) * TILE, (L.spawn.y + 0.5) * TILE, "⌂ entrada", { fontFamily: "JetBrains Mono", fontSize: "9px", color: "#6ef0a3", backgroundColor: "rgba(0,0,0,0.6)", padding: { x: 3, y: 1 }, resolution: 2 }).setOrigin(0.5).setDepth(21); drawn.push(t); }
    for (const n of L.npcs) { /* bichos que andam não têm posição fixa: aparecem só na aba Bichos */ }
    paintOverlay(); paintStatus();
  }
  function paintOverlay() {
    gfx.clear();
    // salas
    for (const z of L.zones) { gfx.lineStyle(1, 0x9ad0ff, 0.25); gfx.strokeRect(z.x * TILE + 0.5, z.y * TILE + 0.5, z.w * TILE - 1, z.h * TILE - 1); }
    if (sel) { const r = rectOf(sel.list, L[sel.list][sel.index]); if (r) { gfx.lineStyle(2, 0xffffff, 0.95); gfx.strokeRect(r.x * TILE + 1, r.y * TILE + 1, r.w * TILE - 2, r.h * TILE - 2); } }
    if (hover) {
      if (tool) { const r = toolRect(hover.x, hover.y); gfx.fillStyle(0x6ef0a3, 0.18); gfx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE); gfx.lineStyle(1, 0x6ef0a3, 0.9); gfx.strokeRect(r.x * TILE + 0.5, r.y * TILE + 0.5, r.w * TILE - 1, r.h * TILE - 1); }
      else { gfx.lineStyle(1, 0xffffff, 0.35); gfx.strokeRect(hover.x * TILE + 0.5, hover.y * TILE + 0.5, TILE - 1, TILE - 1); }
    }
  }
  const toolRect = (x, y) => tool.type === "props" ? { x, y, w: pi(tool.sprite)?.w || 1, h: pi(tool.sprite)?.h || 1 } : tool.type === "trees" ? { x, y, w: 4, h: 5 } : tool.type === "fires" ? { x, y, w: 3, h: 3 } : tool.type === "furniture" ? { x, y, w: tool.w, h: tool.h } : tool.type === "objects" ? { x, y, w: OBJ_DEFAULT[tool.kind].w, h: OBJ_DEFAULT[tool.kind].h } : { x, y, w: 1, h: 1 };

  // ---------- entrada do mouse na cena ----------
  const cam = scene.cameras.main;
  const tileAt = (p) => { const w = cam.getWorldPoint(p.x, p.y); return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) }; };
  const inMap = (t) => t.x >= 0 && t.y >= 0 && t.x < L.width && t.y < L.height;
  const onDown = (p) => {
    if (p.event.target.tagName !== "CANVAS") return;
    const t = tileAt(p);
    if (p.rightButtonDown()) { tool = null; sel = null; paintPalette(); paintProps(); paintOverlay(); return; }
    if (tool) { if (inMap(t)) place(t); return; }
    const h = hit(t.x, t.y);
    if (h) { sel = h; const r = rectOf(h.list, L[h.list][h.index]); drag = { dx: t.x - r.x, dy: t.y - r.y, moved: false, before: JSON.stringify(L) }; paintProps(); paintOverlay(); }
    else { sel = null; pan = { x: p.x, y: p.y }; paintProps(); paintOverlay(); }
  };
  const onMove = (p) => {
    const t = tileAt(p);
    if (pan && p.isDown) { scene.panBy(pan.x - p.x, pan.y - p.y); pan = { x: p.x, y: p.y }; return; }
    if (drag && p.isDown && sel) {
      const it = L[sel.list][sel.index], r = rectOf(sel.list, it), nx = Math.max(0, Math.min(L.width - r.w, t.x - drag.dx)), ny = Math.max(0, Math.min(L.height - r.h, t.y - drag.dy));
      if (sel.list === "staticNpcs") { if (Math.floor(it.x) !== nx || Math.floor(it.y) !== ny) { it.x = nx + 0.5; it.y = ny + 0.7; drag.moved = true; render(); } }
      else if (it.x !== nx || it.y !== ny) { it.x = nx; it.y = ny; drag.moved = true; render(); }
      return;
    }
    if (!hover || hover.x !== t.x || hover.y !== t.y) { hover = t; paintOverlay(); }
  };
  const onUp = () => { if (drag?.moved) { history.push(drag.before); if (history.length > 60) history.shift(); dirty = true; paintStatus(); paintProps(); } drag = null; pan = null; };
  scene.input.on("pointerdown", onDown); scene.input.on("pointermove", onMove); scene.input.on("pointerup", onUp);
  const onKey = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === "Escape") { if (tool) tool = null; else sel = null; paintPalette(); paintProps(); paintOverlay(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && sel) { snap(); L[sel.list].splice(sel.index, 1); sel = null; render(); paintProps(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  };
  document.addEventListener("keydown", onKey);

  function place(t) {
    snap();
    if (tool.type === "furniture") { L.furniture.push({ kind: tool.kind, x: t.x, y: t.y, w: tool.w, h: tool.h }); sel = { list: "furniture", index: L.furniture.length - 1 }; }
    else if (tool.type === "props") { L.props.push({ sprite: tool.sprite, x: t.x, y: t.y }); sel = { list: "props", index: L.props.length - 1 }; }
    else if (tool.type === "trees") { L.trees.push({ sprite: tool.sprite, x: t.x, y: t.y }); sel = { list: "trees", index: L.trees.length - 1 }; }
    else if (tool.type === "fires") { L.fires.push({ x: t.x, y: t.y }); sel = { list: "fires", index: L.fires.length - 1 }; }
    else if (tool.type === "objects") { const d = OBJ_DEFAULT[tool.kind]; const n = L.objects.filter((o) => o.kind === tool.kind).length + 1; L.objects.push({ id: `${tool.kind}-${Date.now().toString(36)}`, kind: tool.kind, x: t.x, y: t.y, w: d.w, h: d.h, label: d.label + (n > 1 ? " " + n : ""), url: d.url, text: d.text }); sel = { list: "objects", index: L.objects.length - 1 }; }
    else if (tool.type === "staticNpcs") { L.staticNpcs.push({ kind: tool.kind, x: t.x + 0.5, y: t.y + 0.7, zone: zoneAt(t)?.id || L.zones[0]?.id }); sel = { list: "staticNpcs", index: L.staticNpcs.length - 1 }; }
    else if (tool.type === "spawn") { L.spawn = { x: t.x, y: t.y }; tool = null; paintPalette(); }
    else if (tool.type === "portalTo") { const it = L.props[tool.index]; if (it) { it.to = { x: t.x, y: t.y }; sel = { list: "props", index: tool.index }; } tool = null; paintPalette(); }
    render(); paintProps();
  }
  const zoneAt = (t) => L.zones.find((z) => t.x >= z.x && t.x < z.x + z.w && t.y >= z.y && t.y < z.y + z.h);

  // ---------- painel ----------
  const head = el("header", {}, el("div", {}, el("div", { class: "mono dim", text: "editor do espaço" }), el("div", { class: "serif", text: "Montar o espaço" })), el("button", { class: "icon-btn", title: "Fechar (descarta o que não foi salvo)", onclick: () => close() }, "✕"));
  const status = el("div", { class: "ed-status mono dim" });
  const tabs = el("nav", { class: "ed-tabs" });
  const pal = el("div", { class: "ed-palette" });
  const props = el("div", { class: "ed-props" });
  const foot = el("div", { class: "ed-foot" },
    el("button", { class: "sp-btn", onclick: undo, title: "Ctrl+Z" }, "desfazer"),
    el("button", { class: "sp-btn", onclick: async () => { if (!confirm("Voltar pro espaço padrão? Perde tudo que foi personalizado.")) return; await apiJson("POST", "/api/admin/layout/reset"); toast("Espaço padrão restaurado. Recarregando…"); } }, "padrão"),
    el("button", { class: "sp-btn primary", onclick: () => save(), title: "Ctrl+S" }, "Salvar e aplicar"));
  const hint = el("div", { class: "sp-hint", text: "clique numa peça da paleta e depois no mapa · arraste pra mover · Delete apaga · botão direito ou Esc cancela · arraste o fundo pra rolar · roda do mouse dá zoom · setas movem a câmera" });
  root.append(head, status, tabs, pal, props, hint, foot);
  const TABS = { furniture: "Móveis", props: "Decoração", trees: "Árvores", objects: "Objetos", zones: "Salas", npcs: "Bichos" };
  let tab = "furniture", propQuery = "";
  const paintTabs = () => { tabs.innerHTML = ""; for (const [k, v] of Object.entries(TABS)) tabs.append(el("button", { class: k === tab ? "active" : "", onclick: () => { tab = k; paintTabs(); paintPalette(); } }, v)); };
  const thumbTile = (name) => { const id = cat.tiles[name]; const d = el("div", { class: "ed-thumb" }); if (id !== undefined) { d.style.backgroundImage = "url(/assets/tiles/office.png)"; d.style.backgroundPosition = `-${(id % cat.columns) * TILE}px -${Math.floor(id / cat.columns) * TILE}px`; } return d; };
  const item = (label, thumb, active, onclick) => el("button", { class: "ed-item" + (active ? " active" : ""), onclick, title: label }, thumb, el("span", { text: label }));
  function paintPalette() {
    pal.innerHTML = "";
    const isTool = (t, k) => tool && tool.type === t && (tool.kind === k || tool.sprite === k);
    if (tab === "furniture") {
      for (const [kind, d] of Object.entries(cat.furniture)) { const first = { desk: "desk_l", table: "table_l", sofa: "sofa_l", counter: "counter_l" }[kind] || kind; pal.append(item(d.label, thumbTile(first), isTool("furniture", kind), () => { tool = { type: "furniture", kind, w: Math.max(d.w[0], Math.min(d.w[1], kind === "table" ? 4 : kind === "desk" ? 2 : kind === "sofa" ? 3 : d.w[0])), h: kind === "table" ? 2 : d.h[0] }; sel = null; paintPalette(); paintProps(); })); }
    } else if (tab === "props") {
      // embutidas primeiro, depois um grupo por pack importado (painel → Packs); busca filtra pelo nome
      const q = el("input", { class: "ed-search", placeholder: "buscar peça…", value: propQuery }); q.oninput = () => { propQuery = q.value.toLowerCase(); paintPalette(); q.focus(); };
      pal.append(q);
      const groups = new Map([["embutidas", []]]);
      for (const [sprite, d] of Object.entries(cat.props)) { const g = d.pack || "embutidas"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push([sprite, d]); }
      for (const [g, items] of groups) {
        const list = items.filter(([sprite, d]) => !propQuery || (d.name || sprite).toLowerCase().includes(propQuery) || (d.interact && d.interact !== "none" && INTER_LABEL[d.interact]?.includes(propQuery))).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));
        if (!list.length) continue;
        pal.append(el("div", { class: "ed-group mono dim", text: `${g} · ${list.length}` }));
        for (const [sprite, d] of list) { const t = el("div", { class: "ed-thumb" }); t.style.backgroundImage = `url(${d.url || `/assets/props/${sprite}.png`})`; t.style.backgroundSize = "contain"; const name = (d.name || sprite).replace(/_/g, " "); pal.append(item(d.interact && d.interact !== "none" ? `${name} · ${INTER_LABEL[d.interact]}` : name, t, isTool("props", sprite), () => { tool = { type: "props", sprite }; sel = null; paintPalette(); paintProps(); })); }
      }
      if (groups.size === 1) pal.append(el("div", { class: "sp-hint", text: "importe packs de sprites (zip) no painel, aba Packs: as peças aparecem aqui" }));
    } else if (tab === "trees") {
      for (const sprite of cat.trees) { const t = el("div", { class: "ed-thumb tall" }); t.style.backgroundImage = `url(/assets/trees2/${sprite}.png)`; t.style.backgroundSize = "auto 100%"; pal.append(item(sprite.replace(/_/g, " "), t, isTool("trees", sprite), () => { tool = { type: "trees", sprite }; sel = null; paintPalette(); paintProps(); })); }
      const f = el("div", { class: "ed-thumb" }); f.style.backgroundImage = "url(/assets/fx/campfire.png)"; f.style.backgroundSize = "auto 100%"; pal.append(item("fogueira (luz + som)", f, tool?.type === "fires", () => { tool = { type: "fires" }; sel = null; paintPalette(); paintProps(); }));
    } else if (tab === "objects") {
      const tileFor = { board: "whiteboard", info: "noticeboard", video: "screen_l", link: "screen_l", speaker: "radio" };
      for (const [kind, label] of Object.entries(cat.objectKinds)) pal.append(item(label, thumbTile(tileFor[kind]), isTool("objects", kind), () => { tool = { type: "objects", kind }; sel = null; paintPalette(); paintProps(); }));
      pal.append(item("ponto de entrada", el("div", { class: "ed-thumb", text: "⌂" }), tool?.type === "spawn", () => { tool = { type: "spawn" }; sel = null; paintPalette(); paintProps(); }));
    } else if (tab === "zones") {
      pal.append(el("div", { class: "sp-hint", text: "nome, tipo e piso de cada sala. open = voz por proximidade · meeting = todo mundo na mesma call · stage = só o palco fala · silent = sem voz" }));
      for (const z of L.zones) {
        const name = el("input", { value: z.name, oninput: () => { z.name = name.value.slice(0, 40); dirty = true; paintStatus(); } });
        const kind = el("select", { onchange: () => { snap(); z.kind = kind.value; } }, ...cat.zoneKinds.map((k) => { const o = el("option", { value: k, text: k }); if (k === z.kind) o.selected = true; return o; }));
        const floor = el("select", { onchange: () => { snap(); z.floor = floor.value; } }, ...cat.floors.map((k) => { const o = el("option", { value: k, text: k.replace("floor_", "") }); if (k === z.floor) o.selected = true; return o; }));
        pal.append(el("div", { class: "ed-zone" }, name, el("div", { class: "row" }, kind, floor), el("button", { class: "sp-btn", onclick: () => { cam.centerOn((z.x + z.w / 2) * TILE, (z.y + z.h / 2) * TILE); } }, "ver")));
      }
      pal.append(el("div", { class: "sp-hint", text: "mudar paredes, tamanho e posição das salas entra na próxima versão do editor" }));
    } else if (tab === "npcs") {
      pal.append(el("div", { class: "sp-hint", text: "gente parada (clique no mapa pra colocar)" }));
      for (const k of ["seller", "customer"]) pal.append(item(k === "seller" ? "atendente" : "cliente", el("div", { class: "ed-thumb", text: "☺" }), isTool("staticNpcs", k), () => { tool = { type: "staticNpcs", kind: k }; sel = null; paintPalette(); paintProps(); }));
      pal.append(el("div", { class: "sp-hint", text: "bichos que andam pela sala" }));
      const list = el("div", { class: "ed-npcs" });
      const paintNpcs = () => { list.innerHTML = ""; L.npcs.forEach((n, i) => list.append(el("div", { class: "row" }, el("span", { text: `${n.kind} · ${L.zones.find((z) => z.id === n.zone)?.name || n.zone}` }), el("button", { class: "sp-btn", onclick: () => { snap(); L.npcs.splice(i, 1); paintNpcs(); } }, "tirar")))); };
      const kind = el("select", {}, ...["fox", "hare", "deer", "boar", "grouse"].map((k) => el("option", { value: k, text: k })));
      const zone = el("select", {}, ...L.zones.map((z) => el("option", { value: z.id, text: z.name })));
      pal.append(list, el("div", { class: "row" }, kind, zone, el("button", { class: "sp-btn primary", onclick: () => { if (L.npcs.length >= 30) return toast("máximo de 30 bichos"); snap(); L.npcs.push({ kind: kind.value, zone: zone.value }); paintNpcs(); } }, "+ bicho")));
      paintNpcs();
    }
  }
  function paintProps() {
    props.innerHTML = "";
    if (!sel) { if (tool) props.append(el("div", { class: "sp-hint", text: "clique no mapa pra colocar. botão direito cancela." })); return; }
    const it = L[sel.list][sel.index]; if (!it) { sel = null; return; }
    const field = (label, input) => el("label", { class: "ed-field" }, el("span", { class: "mono dim", text: label }), input);
    const num = (key, min, max) => { const i = el("input", { type: "number", min, max, value: it[key] }); i.onchange = () => { snap(); it[key] = Math.max(min, Math.min(max, parseInt(i.value, 10) || min)); render(); }; return i; };
    const text = (key, max, placeholder = "") => { const i = el("input", { value: it[key] || "", placeholder, maxlength: max }); i.oninput = () => { it[key] = i.value.slice(0, max); dirty = true; paintStatus(); render(); }; return i; };
    const title = { furniture: cat.furniture[it.kind]?.label, props: pi(it.sprite)?.name || it.sprite, trees: "árvore " + it.sprite, fires: "fogueira", objects: cat.objectKinds[it.kind], staticNpcs: it.kind }[sel.list];
    props.append(el("div", { class: "ed-sel-title", text: title || sel.list }));
    if (sel.list === "furniture") { const d = cat.furniture[it.kind]; if (d.w[1] > 1) props.append(field("largura", num("w", d.w[0], d.w[1]))); if (d.h[1] > 1) props.append(field("altura", num("h", d.h[0], d.h[1]))); }
    if (sel.list === "props") {
      const d = pi(it.sprite) || {}, base = d.interact || "none";
      const opts = { none: "nenhuma", sit: "sentar", work: "sentar e trabalhar (foco)", lie: "deitar", use: "ligar/desligar", portal: "portal", sign: "placa (texto)" };
      const inter = el("select", { onchange: () => { snap(); it.interact = inter.value === base ? undefined : inter.value; if (inter.value === "none") it.interact = base === "none" ? undefined : "none"; render(); paintProps(); } }, ...Object.entries(opts).map(([k, v]) => { const o = el("option", { value: k, text: v + (k === base && base !== "none" ? " (do pack)" : "") }); if ((it.interact || base) === k) o.selected = true; return o; }));
      props.append(field("interação", inter));
      const cur = it.interact || base;
      if (cur === "sit" || cur === "work" || cur === "lie") { const dir = el("select", { onchange: () => { snap(); it.dir = dir.value; } }, ...[["down", "de frente"], ["up", "de costas"], ["left", "esquerda"], ["right", "direita"]].map(([k, v]) => { const o = el("option", { value: k, text: v }); if ((it.dir || d.dir || "down") === k) o.selected = true; return o; })); props.append(field(cur === "lie" ? "cabeça pra" : "olhando pra", dir)); }
      if (cur === "sign" || cur === "use") props.append(field("nome", text("label", 40, d.name || "")));
      if (cur === "sign") { const ta = el("textarea", { rows: 4 }); ta.value = it.text || ""; ta.oninput = () => { it.text = ta.value.slice(0, 500); dirty = true; paintStatus(); }; props.append(field("texto", ta)); }
      if (cur === "portal") {
        props.append(el("div", { class: "sp-hint", text: it.to ? `destino: ${it.to.x}, ${it.to.y}` : "sem destino: ninguém vai pra lugar nenhum" }));
        props.append(el("button", { class: "sp-btn primary", onclick: () => { tool = { type: "portalTo", index: sel.index }; props.append(el("div", { class: "sp-hint", text: "clique no mapa onde a pessoa vai aparecer" })); } }, "marcar destino no mapa"));
      }
      if (d.bw === 0) props.append(el("div", { class: "sp-hint", text: "peça de chão: não bloqueia" }));
    }
    if (sel.list === "objects") {
      props.append(field("nome", text("label", 40)));
      if (it.kind !== "speaker") { props.append(field("largura", num("w", 1, 12))); if (it.kind === "board") props.append(field("altura", num("h", 1, 4))); }
      if (it.kind === "video" || it.kind === "link") props.append(field("link", text("url", 500, "https://…")));
      if (it.kind === "info") { const ta = el("textarea", { rows: 4 }); ta.value = it.text || ""; ta.oninput = () => { it.text = ta.value.slice(0, 2000); dirty = true; paintStatus(); }; props.append(field("texto", ta)); }
      props.append(el("div", { class: "sp-hint", text: "id: " + it.id }));
    }
    if (sel.list === "staticNpcs") { const z = el("select", { onchange: () => { snap(); it.zone = z.value; } }, ...L.zones.map((zz) => { const o = el("option", { value: zz.id, text: zz.name }); if (zz.id === it.zone) o.selected = true; return o; })); props.append(field("sala", z)); }
    props.append(el("div", { class: "row" }, el("button", { class: "sp-btn", onclick: () => { snap(); const copy = JSON.parse(JSON.stringify(it)); if (copy.id) copy.id += "-c"; if (copy.x !== undefined) copy.x += 1; L[sel.list].push(copy); sel = { list: sel.list, index: L[sel.list].length - 1 }; render(); paintProps(); } }, "duplicar"), el("button", { class: "sp-btn danger", onclick: () => { snap(); L[sel.list].splice(sel.index, 1); sel = null; render(); paintProps(); } }, "apagar")));
  }
  function paintStatus() { status.textContent = (dirty ? "alterações não salvas" : saved ? "espaço personalizado salvo" : "espaço padrão") + ` · ${L.furniture.length} móveis · ${L.props.length + L.trees.length + L.fires.length} decorações · ${L.objects.length} objetos`; }

  async function save() {
    try {
      const chk = await apiJson("POST", "/api/admin/layout/check", { layout: L });
      let force = false;
      if (!chk.reach.ok) {
        const msg = chk.reach.reason || [chk.reach.unreachableZones.length ? "salas sem acesso: " + chk.reach.unreachableZones.join(", ") : "", chk.reach.lostObjects.length ? "objetos sem acesso: " + chk.reach.lostObjects.join(", ") : ""].filter(Boolean).join(" · ");
        if (!confirm("Tem lugar que ninguém alcança a pé:\n" + msg + "\n\nSalvar mesmo assim?")) return;
        force = true;
      }
      const r = await apiJson("PUT", "/api/admin/layout", { layout: L, force });
      dirty = false; toast("Espaço salvo. Recarregando pra todo mundo…");
    } catch (e) { toast("não salvou: " + e.message); }
  }
  function close() {
    if (dirty && !confirm("Sair sem salvar? As mudanças serão perdidas.")) return;
    scene.input.off("pointerdown", onDown); scene.input.off("pointermove", onMove); scene.input.off("pointerup", onUp);
    document.removeEventListener("keydown", onKey);
    for (const o of drawn) o.destroy(); gfx.destroy();
    scene.setEditMode(false);
    root.classList.add("hidden"); root.innerHTML = ""; $("#chat").classList.remove("hidden");
    onClose?.();
  }
  paintTabs(); paintPalette(); paintProps(); render();
  window.__sedeEditor = { get layout() { return L; } };
  cam.centerOn(scene.player.x, scene.player.y);
  return { close };
}

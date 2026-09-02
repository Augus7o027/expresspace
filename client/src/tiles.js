// Janelas de câmera e tela sobre o mapa: arrastar, redimensionar, maximizar (2 cliques), minimizar pra barra,
// ficam translúcidas enquanto você anda, e V esconde/mostra todas. Posição e tamanho ficam salvos por tipo.
const safe = (fn, d) => { try { return fn(); } catch { return d; } };

export class Tiles {
  constructor(stage, { nameOf }) {
    this.stage = stage;
    this.nameOf = nameOf;
    this.tiles = new Map(); // key -> { el, video, who, kind, min, max }
    this.hidden = false;
    this.layer = document.createElement("div"); this.layer.id = "tiles"; stage.appendChild(this.layer);
    this.dock = document.createElement("div"); this.dock.id = "tiles-dock"; stage.appendChild(this.dock);
    this.saved = safe(() => JSON.parse(localStorage.getItem("sede:tiles") || "{}"), {}) || {};
    this.z = 5;
    this.walkT = null;
  }

  // chamado quando a lista de vídeos muda: cria/remove sem recriar os que já existem
  sync(videos) {
    const want = new Set(videos.keys());
    for (const [key, t] of this.tiles) if (!want.has(key)) { t.el.remove(); t.pill?.remove(); this.tiles.delete(key); }
    for (const [key, v] of videos) {
      let t = this.tiles.get(key);
      if (!t) { t = this.create(key, v); this.tiles.set(key, t); }
      if (t.video.srcObject !== v.stream) t.video.srcObject = v.stream;
    }
    this.relabel();
    this.layer.classList.toggle("hidden", !this.tiles.size || this.hidden);
    this.dock.classList.toggle("hidden", ![...this.tiles.values()].some((t) => t.min) && !this.hidden);
    this.paintDock();
  }
  relabel() { for (const t of this.tiles.values()) { const n = this.nameOf(t.who, t.kind); t.tag.textContent = n; if (t.pill) t.pill.textContent = n; } }

  create(key, v) {
    const el = document.createElement("div"); el.className = `tile ${v.kind}`; el.dataset.key = key;
    const video = document.createElement("video"); video.autoplay = true; video.playsInline = true; video.muted = true;
    if (v.who === "me" && v.kind === "camera") video.style.transform = "scaleX(-1)";
    const bar = document.createElement("div"); bar.className = "tile-bar";
    const tag = document.createElement("span"); tag.className = "who";
    const btnMax = this.btn("⤢", "maximizar (2 cliques no vídeo)", () => this.toggleMax(key));
    const btnMin = this.btn("—", "minimizar pra barra", () => this.minimize(key, true));
    bar.append(tag, btnMax, btnMin);
    const grip = document.createElement("div"); grip.className = "tile-grip";
    el.append(video, bar, grip);
    this.layer.appendChild(el);
    const t = { el, video, tag, who: v.who, kind: v.kind, min: false, max: false, pill: null };
    this.place(t);
    this.drag(t); this.resize(t, grip);
    el.ondblclick = (e) => { if (e.target.tagName !== "BUTTON") this.toggleMax(key); };
    el.onpointerdown = () => { el.style.zIndex = ++this.z; };
    return t;
  }
  btn(label, title, fn) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }

  // posição inicial: telas grandes à esquerda em cima; câmeras em coluna à direita
  place(t) {
    const saved = this.saved[t.kind + ":" + (t.who === "me" ? "me" : "other")];
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    const n = [...this.tiles.values()].filter((x) => x.kind === t.kind).length;
    let w, h, x, y;
    if (t.kind === "camera") { w = 176; h = 132; x = W - w - 14; y = 14 + n * (h + 10); }
    else { w = Math.min(560, Math.round(W * 0.5)); h = Math.round(w * 9 / 16); x = 14 + n * 24; y = 14 + n * 24; }
    if (saved) { w = saved.w; h = saved.h; }
    Object.assign(t.el.style, { width: w + "px", height: h + "px", left: Math.max(0, Math.min(W - w, x)) + "px", top: Math.max(0, Math.min(H - h, y)) + "px" });
  }
  save(t) { const r = t.el.getBoundingClientRect(); this.saved[t.kind + ":" + (t.who === "me" ? "me" : "other")] = { w: Math.round(r.width), h: Math.round(r.height) }; safe(() => localStorage.setItem("sede:tiles", JSON.stringify(this.saved))); }

  drag(t) {
    const el = t.el; let sx, sy, ox, oy, moving = false;
    el.addEventListener("pointerdown", (e) => {
      if (t.max || e.target.tagName === "BUTTON" || e.target.classList.contains("tile-grip")) return;
      moving = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; el.setPointerCapture(e.pointerId); el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (e) => {
      if (!moving) return;
      const W = this.stage.clientWidth, H = this.stage.clientHeight;
      el.style.left = Math.max(-el.offsetWidth * 0.6, Math.min(W - el.offsetWidth * 0.4, ox + e.clientX - sx)) + "px";
      el.style.top = Math.max(0, Math.min(H - 40, oy + e.clientY - sy)) + "px";
    });
    const up = () => { moving = false; el.classList.remove("dragging"); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  resize(t, grip) {
    const el = t.el; let sx, sy, ow, oh, on = false;
    grip.addEventListener("pointerdown", (e) => { if (t.max) return; on = true; sx = e.clientX; sy = e.clientY; ow = el.offsetWidth; oh = el.offsetHeight; grip.setPointerCapture(e.pointerId); e.stopPropagation(); });
    grip.addEventListener("pointermove", (e) => {
      if (!on) return;
      const ratio = t.kind === "camera" ? 4 / 3 : 16 / 9;
      const w = Math.max(120, Math.min(this.stage.clientWidth - el.offsetLeft, ow + e.clientX - sx));
      el.style.width = w + "px"; el.style.height = Math.round(w / ratio) + "px";
    });
    const up = () => { if (on) { on = false; this.save(t); } };
    grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  }

  toggleMax(key) {
    const t = this.tiles.get(key); if (!t) return;
    t.max = !t.max; t.el.classList.toggle("max", t.max); t.el.style.zIndex = ++this.z;
  }
  minimize(key, on) {
    const t = this.tiles.get(key); if (!t) return;
    t.min = on; t.el.classList.toggle("hidden", on);
    this.dock.classList.toggle("hidden", ![...this.tiles.values()].some((x) => x.min) && !this.hidden);
    this.paintDock();
  }
  paintDock() {
    this.dock.innerHTML = "";
    if (this.hidden && this.tiles.size) { const b = this.btn(`▣ mostrar vídeos (${this.tiles.size}) · V`, "mostrar", () => this.toggleAll()); b.className = "pill"; this.dock.appendChild(b); return; }
    for (const [key, t] of this.tiles) if (t.min) { const b = this.btn(`▣ ${this.nameOf(t.who, t.kind)}`, "restaurar", () => this.minimize(key, false)); b.className = "pill"; t.pill = b; this.dock.appendChild(b); }
  }
  toggleAll() {
    this.hidden = !this.hidden;
    this.layer.classList.toggle("hidden", !this.tiles.size || this.hidden);
    this.dock.classList.toggle("hidden", ![...this.tiles.values()].some((t) => t.min) && !this.hidden);
    this.paintDock();
  }
  // andando: vídeos ficam translúcidos pra ver o mapa; parou, voltam
  walking(on) {
    clearTimeout(this.walkT);
    if (on) this.layer.classList.add("walking");
    else this.walkT = setTimeout(() => this.layer.classList.remove("walking"), 500);
  }
}

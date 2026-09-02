// Área de membros: catálogo de aulas, skills, prompts, automações e templates, com progresso por conta.
import { renderMarkdown, wireCopyButtons } from "./md.js";

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e[k] = v; else if (v !== undefined) e.setAttribute(k, v); }
  for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
function toast(text, ok = true) { const t = $("#toast"); t.textContent = text; t.style.color = ok ? "" : "#f0a0a0"; t.classList.remove("hidden"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add("hidden"), 2500); }
const fmtSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : n > 1e3 ? Math.round(n / 1e3) + " KB" : n + " B";
const TYPE_ICON = { aula: "▶", skill: "✦", prompt: "❝", automacao: "⚙", template: "▤", link: "↗" };
const PLURAL = { aula: "Aulas", skill: "Skills", prompt: "Prompts", automacao: "Automações", template: "Templates", link: "Links" };

let data = null, filter = { type: "", cat: "", q: "" }, current = null;

// ---------- login ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await api("POST", "/api/auth/login", { email: $("#email").value, password: $("#password").value }); await boot(); }
  catch (err) { $("#login-error").textContent = err.message; $("#login-error").classList.remove("hidden"); }
});
$("#logout").onclick = async () => { await api("POST", "/api/auth/logout"); location.reload(); };
api("GET", "/api/auth/me").then(({ user }) => { if (user) boot(); });

async function boot() {
  data = await api("GET", "/api/library");
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#who").textContent = `${data.user.name} · ${data.user.role === "member" ? "membro" : data.user.role}`;
  if (data.user.role !== "member") $("#manage").classList.remove("hidden");
  $("#search").oninput = () => { filter.q = $("#search").value.trim().toLowerCase(); renderList(); };
  renderNav(); renderList();
  const id = new URLSearchParams(location.search).get("i"); if (id) openItem(id);
}

function renderNav() {
  const counts = {}; for (const it of data.items) counts[it.type] = (counts[it.type] || 0) + 1;
  const types = $("#types"); types.innerHTML = "";
  const btn = (label, value, n) => el("button", { class: "navbtn" + (filter.type === value ? " active" : ""), onclick: () => { filter.type = value; filter.cat = ""; current = null; renderNav(); renderList(); } }, el("span", {}, label), el("span", { class: "n" }, n));
  types.append(btn("Tudo", "", data.items.length));
  for (const t of data.types) if (counts[t]) types.append(btn(`${TYPE_ICON[t]} ${PLURAL[t] || data.typeLabel[t]}`, t, counts[t]));
  const cats = $("#cats"); cats.innerHTML = "";
  const byCat = {}; for (const it of data.items) if (!filter.type || it.type === filter.type) byCat[it.category] = (byCat[it.category] || 0) + 1;
  for (const [c, n] of Object.entries(byCat)) {
    const done = data.items.filter((it) => it.category === c && (!filter.type || it.type === filter.type) && data.progress[it.id]).length;
    cats.append(el("button", { class: "navbtn" + (filter.cat === c ? " active" : ""), onclick: () => { filter.cat = filter.cat === c ? "" : c; current = null; renderNav(); renderList(); } }, el("span", {}, c), el("span", { class: "n" }, `${done}/${n}`)));
  }
}

const visible = () => data.items.filter((it) => (!filter.type || it.type === filter.type) && (!filter.cat || it.category === filter.cat) &&
  (!filter.q || [it.title, it.summary, it.category, ...(it.tags || [])].join(" ").toLowerCase().includes(filter.q)));

function renderProgress(items) {
  const done = items.filter((it) => data.progress[it.id]).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const p = $("#progress"); p.innerHTML = "";
  p.append(el("div", { class: "prog-head" }, el("h1", { class: "display" }, el("span", { class: "kicker" }, filter.cat || (filter.type ? data.typeLabel[filter.type] : "biblioteca")), el("span", { class: "script" }, filter.cat ? "Módulo" : "Conteúdos")),
    el("div", { class: "prog-num" }, el("b", {}, `${pct}%`), el("span", { class: "mono dim" }, `${done} de ${items.length} concluídos`))),
    el("div", { class: "bar" }, el("div", { class: "fill", style: `width:${pct}%` })));
}

function renderList() {
  $("#item").classList.add("hidden"); $("#list").classList.remove("hidden");
  const items = visible(); renderProgress(items);
  const list = $("#list"); list.innerHTML = "";
  if (!items.length) { list.append(el("p", { class: "empty" }, data.items.length ? "nada com esse filtro." : "ainda não há conteúdo publicado. Os professores estão preparando.")); return; }
  let lastCat = null;
  for (const it of items) {
    if (!filter.cat && it.category !== lastCat) { list.append(el("div", { class: "cat-label mono" }, it.category)); lastCat = it.category; }
    const isDone = !!data.progress[it.id];
    list.append(el("button", { class: "card-item glass" + (isDone ? " done" : ""), onclick: () => openItem(it.id) },
      el("div", { class: "ci-top" }, el("span", { class: "type mono" }, TYPE_ICON[it.type], " ", data.typeLabel[it.type]), isDone ? el("span", { class: "check" }, "✓") : null),
      el("h3", {}, it.title),
      it.summary ? el("p", {}, it.summary) : null,
      el("div", { class: "ci-meta mono dim" }, it.embed ? "vídeo · " : "", it.files?.length ? `${it.files.length} arquivo(s) · ` : "", (it.tags || []).slice(0, 3).join(" · ")),
    ));
  }
}

function openItem(id) {
  const it = data.items.find((x) => x.id === id); if (!it) return;
  current = it; history.replaceState(null, "", `?i=${it.id}`);
  $("#list").classList.add("hidden"); const a = $("#item"); a.classList.remove("hidden"); a.innerHTML = "";
  const list = visible(); const idx = list.findIndex((x) => x.id === it.id); renderProgress(list);
  const isDone = !!data.progress[it.id];
  const doneBtn = el("button", { class: "btn" + (isDone ? " on" : ""), onclick: async () => {
    try { const r = await api("POST", `/api/library/${it.id}/done`, { done: !data.progress[it.id] }); data.progress = r.done; toast(data.progress[it.id] ? "marcado como concluído" : "desmarcado"); openItem(it.id); renderNav(); } catch (e) { toast(e.message, false); }
  } }, isDone ? "✓ concluído" : "marcar como concluído");
  a.append(el("div", { class: "it-head" },
    el("button", { class: "btn small", onclick: () => { current = null; history.replaceState(null, "", location.pathname); renderList(); } }, "← voltar"),
    el("span", { class: "type mono" }, TYPE_ICON[it.type], " ", data.typeLabel[it.type], " · ", it.category),
    el("span", { class: "grow" }), doneBtn));
  a.append(el("h1", { class: "it-title" }, it.title));
  if (it.summary) a.append(el("p", { class: "it-summary" }, it.summary));
  if (it.tags?.length) a.append(el("div", { class: "tags" }, ...it.tags.map((t) => el("span", { class: "tag mono" }, t))));
  if (it.embed) {
    a.append(it.embed.kind === "video"
      ? el("video", { class: "player", src: it.embed.url, controls: "", playsinline: "", preload: "metadata" })
      : el("div", { class: "player-wrap" }, el("iframe", { class: "player", src: it.embed.url, allow: "autoplay; fullscreen; picture-in-picture; clipboard-write", allowfullscreen: "", referrerpolicy: "no-referrer" })));
  }
  if (it.type === "prompt" && it.body) {
    a.append(el("div", { class: "prompt-box" }, el("pre", {}, it.body), el("button", { class: "btn primary", onclick: async () => { try { await navigator.clipboard.writeText(it.body); toast("prompt copiado"); } catch { toast("não deu pra copiar", false); } } }, "copiar prompt")));
  } else if (it.body) {
    const body = el("div", { class: "md", html: renderMarkdown(it.body) }); a.append(body); wireCopyButtons(body, () => toast("copiado"));
  }
  if (it.link) a.append(el("p", {}, el("a", { class: "btn", href: it.link, target: "_blank", rel: "noopener" }, "abrir link ↗ ", el("span", { class: "dim" }, it.link.replace(/^https?:\/\//, "").slice(0, 60)))));
  if (it.files?.length) a.append(el("div", { class: "files" }, el("div", { class: "mono dim" }, "arquivos"), ...it.files.map((f) => el("a", { class: "file", href: f.url, download: f.name }, el("span", {}, "⤓ ", f.name), el("span", { class: "mono dim" }, fmtSize(f.size))))));
  a.append(el("div", { class: "it-nav" },
    idx > 0 ? el("button", { class: "btn", onclick: () => openItem(list[idx - 1].id) }, "← ", list[idx - 1].title) : el("span"),
    idx < list.length - 1 ? el("button", { class: "btn", onclick: () => openItem(list[idx + 1].id) }, list[idx + 1].title, " →") : el("span")));
  if (it.author?.name) a.append(el("p", { class: "mono dim", style: "margin-top:18px" }, `por ${it.author.name} · atualizado em ${new Date(it.updatedAt).toLocaleDateString("pt-BR")}`));
  window.scrollTo({ top: 0 });
}

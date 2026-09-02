// Painel admin: provedores de LLM, agentes (NPCs), mundo, usuários, configurações.
import { mountAvatarEditor } from "./avatar-editor.js";
import { loadBase } from "./sprites.js";
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
function toast(text, ok = true) { const t = $("#toast"); t.textContent = text; t.style.color = ok ? "" : "#f0a0a0"; t.classList.remove("hidden"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add("hidden"), 3500); }
const field = (label, input) => el("div", { class: "field" }, el("span", { class: "mono" }, label), input);
const input = (attrs) => el("input", { type: "text", ...attrs });

let me = null, overview = null;
const STAFF = ["admin", "professor"];
const PROFESSOR_TABS = ["content"];

// ---------- login ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { user } = await api("POST", "/api/auth/login", { email: $("#email").value, password: $("#password").value });
    if (!STAFF.includes(user.role)) throw new Error("essa conta não é admin nem professor");
    me = user; boot();
  } catch (err) { $("#login-error").textContent = err.message; $("#login-error").classList.remove("hidden"); }
});
api("GET", "/api/auth/me").then(({ user }) => { if (STAFF.includes(user?.role)) { me = user; boot(); } });
$("#logout").onclick = async () => { await api("POST", "/api/auth/logout"); location.reload(); };

async function boot() {
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#who").textContent = `${me.name} · ${me.email}`;
  await loadBase().catch(() => {});
  document.querySelectorAll("#tabs button").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); if (me.role !== "admin") b.classList.toggle("hidden", !PROFESSOR_TABS.includes(b.dataset.tab)); });
  showTab(me.role === "admin" ? "overview" : "content");
}
const RENDER = { overview: renderOverview, content: renderContent, agents: renderAgents, providers: renderProviders, world: renderWorld, users: renderUsers, settings: renderSettings };
async function showTab(name) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("hidden", t.id !== "tab-" + name));
  const root = $("#tab-" + name); root.innerHTML = ""; root.append(el("div", { class: "card glass" }, el("p", { class: "lead" }, "carregando…")));
  try { if (me.role === "admin") overview = await api("GET", "/api/admin/overview"); root.innerHTML = ""; await RENDER[name](root); }
  catch (e) { root.innerHTML = ""; root.append(el("div", { class: "card glass" }, el("p", { class: "err" }, e.message))); }
}

// ---------- visão geral ----------
async function renderOverview(root) {
  const o = overview;
  root.append(el("div", { class: "card glass" },
    el("h2", {}, "Agora no espaço"),
    el("div", { class: "stats" },
      el("div", { class: "stat" }, el("b", {}, o.online.length), el("span", { class: "mono dim" }, "online")),
      el("div", { class: "stat" }, el("b", {}, o.users), el("span", { class: "mono dim" }, "contas")),
      el("div", { class: "stat" }, el("b", {}, o.agents), el("span", { class: "mono dim" }, "agentes")),
      el("div", { class: "stat" }, el("b", {}, o.content), el("span", { class: "mono dim" }, "conteúdos")),
      el("div", { class: "stat" }, el("b", {}, o.locked.length), el("span", { class: "mono dim" }, "salas trancadas")),
    ),
    el("h3", {}, "Quem está online"),
    el("div", { class: "list" }, ...(o.online.length ? o.online.map((p) => el("div", { class: "item" }, el("span", { class: "online-dot" }), el("span", { class: "grow" }, p.name, " ", el("span", { class: "badge" }, p.role)), el("span", { class: "sub" }, o.zones.find((z) => z.id === p.zone)?.name || "corredor"))) : [el("p", { class: "lead" }, "ninguém agora.")])),
  ));
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Mapa"), el("p", { class: "lead" }, `Arquivo em uso: ${o.mapFile}${o.uploadedMap ? " (enviado pelo painel)" : " (do build)"}. ${o.zones.length} zonas, ${o.objects.length} objetos, ${o.decor.length} árvores, ${(o.npcs || []).length} bichos.`)));
}

// ---------- provedores ----------
const PRESETS = [
  { name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", models: "meta/llama-3.3-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct, meta/llama-3.1-8b-instruct, mistralai/mixtral-8x22b-instruct-v0.1" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: "meta-llama/llama-3.3-70b-instruct:free, google/gemma-3-27b-it:free, deepseek/deepseek-chat-v3-0324:free" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: "llama-3.3-70b-versatile, llama-3.1-8b-instant" },
  { name: "Ollama (local)", baseUrl: "http://localhost:11434/v1", models: "llama3.1, qwen2.5" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", models: "gpt-4o-mini" },
];
async function renderProviders(root) {
  const list = await api("GET", "/api/admin/providers");
  const form = (p = {}) => {
    const name = input({ value: p.name || "" }), base = input({ value: p.baseUrl || "", placeholder: "https://integrate.api.nvidia.com/v1" });
    const key = input({ type: "password", value: p.apiKey || "", placeholder: "chave da API (fica só no servidor)" });
    const models = input({ value: (p.models || []).join(", "), placeholder: "modelos separados por vírgula" });
    const preset = el("select", {}, el("option", { value: "" }, "preencher com um preset…"), ...PRESETS.map((x, i) => el("option", { value: i }, x.name)));
    preset.onchange = () => { const x = PRESETS[preset.value]; if (x) { name.value = x.name; base.value = x.baseUrl; models.value = x.models; } };
    const status = el("div", {});
    const card = el("div", { class: "card glass" },
      el("h3", {}, p.id ? p.name : "Novo provedor"),
      field("preset", preset), field("nome", name), field("URL base (OpenAI-compatível)", base), field("API key", key), field("modelos", models),
      el("div", { class: "row" },
        el("button", { class: "btn primary", onclick: async () => { try { await api("POST", "/api/admin/providers", { id: p.id, name: name.value, baseUrl: base.value, apiKey: key.value, models: models.value }); toast("provedor salvo"); showTab("providers"); } catch (e) { toast(e.message, false); } } }, "Salvar"),
        p.id ? el("button", { class: "btn", onclick: async () => { status.textContent = "testando…"; try { const r = await api("POST", `/api/admin/providers/${p.id}/test`, { model: models.value.split(",")[0].trim() }); status.innerHTML = `<span class="ok">ok em ${r.ms}ms · "${(r.reply || "").slice(0, 60)}"</span>`; } catch (e) { status.innerHTML = `<span class="err">${e.message}</span>`; } } }, "Testar") : null,
        p.id ? el("button", { class: "btn danger", onclick: async () => { if (!confirm("apagar provedor?")) return; await api("DELETE", `/api/admin/providers/${p.id}`); showTab("providers"); } }, "Apagar") : null,
      ), status);
    return card;
  };
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Provedores de LLM"), el("p", { class: "lead" }, "Qualquer API compatível com OpenAI (chat/completions). NVIDIA NIM tem modelos gratuitos com chave em build.nvidia.com. A chave nunca vai pro navegador dos membros.")));
  root.append(el("div", { class: "grid" }, ...list.map(form), form()));
}

// ---------- agentes ----------
async function renderAgents(root) {
  const [list, providers] = await Promise.all([api("GET", "/api/admin/agents"), api("GET", "/api/admin/providers")]);
  const zones = overview.zones, channels = overview.channels.filter((c) => c.kind === "text");
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Agentes"), el("p", { class: "lead" }, "Cada agente vira um personagem no mapa. Quem chega perto e aperta E conversa com ele. Com agenda, ele posta sozinho num canal (ex.: resumo diário de notícias tech).")));
  const listEl = el("div", { class: "list" }, ...list.map((a) => el("div", { class: "item" },
    el("span", { class: "grow" }, el("b", {}, a.name), " ", el("span", { class: "sub" }, a.role || ""), el("div", { class: "sub" }, `${a.model || "sem modelo"} · ${zones.find((z) => z.id === a.zone)?.name || "sem zona"}${a.schedule?.enabled ? ` · posta a cada ${a.schedule.everyHours}h em #${a.schedule.channel}` : ""}`)),
    el("span", { class: "badge " + (a.enabled ? "on" : "off") }, a.enabled ? "ativo" : "pausado"),
    el("button", { class: "btn small", onclick: () => openAgent(a) }, "Editar"),
  )));
  root.append(el("div", { class: "card glass" }, el("div", { class: "row", style: "justify-content:space-between" }, el("h3", {}, `${list.length} agente(s)`), el("button", { class: "btn primary", onclick: () => openAgent({}) }, "Novo agente")), listEl));
  const editor = el("div", {}); root.append(editor);

  function openAgent(a) {
    editor.innerHTML = "";
    const name = input({ value: a.name || "", placeholder: "ex.: Téo, o mentor tech" });
    const role = input({ value: a.role || "", placeholder: "ex.: Professor de tech e automação" });
    const greeting = input({ value: a.greeting || "", placeholder: "primeira frase quando alguém chega" });
    const sys = el("textarea", {}, a.systemPrompt || "Você é um mentor da comunidade ExpresSpace. Responda com profundidade prática, exemplos e próximos passos. Quando precisar de fatos recentes, use as ferramentas de busca.");
    const provider = el("select", {}, el("option", { value: "" }, "escolha o provedor"), ...providers.map((p) => el("option", { value: p.id, selected: p.id === a.providerId ? "" : undefined }, p.name)));
    const model = el("select", {});
    const fillModels = () => { model.innerHTML = ""; const p = providers.find((x) => x.id === provider.value); for (const m of p?.models || []) model.append(el("option", { value: m, selected: m === a.model ? "" : undefined }, m)); };
    provider.onchange = fillModels; fillModels();
    const temp = input({ type: "number", step: "0.1", min: "0", max: "1.5", value: a.temperature ?? 0.7 });
    const tools = el("div", { class: "checks" }, ...overview.tools.map((t) => el("label", {}, el("input", { type: "checkbox", value: t, checked: (a.tools || []).includes(t) ? "" : undefined }), { web_search: "buscar na web", fetch_url: "ler páginas", rss: "ler RSS" }[t] || t)));
    const rss = el("textarea", { class: "mono", placeholder: "uma URL de RSS por linha (ex.: https://news.ycombinator.com/rss)" }, (a.rss || []).join("\n"));
    const zone = el("select", {}, el("option", { value: "" }, "sem zona (fica no spawn)"), ...zones.map((z) => el("option", { value: z.id, selected: z.id === a.zone ? "" : undefined }, z.name)));
    const x = input({ type: "number", value: a.x || "", placeholder: "x" }), y = input({ type: "number", value: a.y || "", placeholder: "y" });
    const wander = el("input", { type: "checkbox", checked: a.wander ? "" : undefined });
    const enabled = el("input", { type: "checkbox", checked: a.enabled !== false ? "" : undefined });
    const schOn = el("input", { type: "checkbox", checked: a.schedule?.enabled ? "" : undefined });
    const schHours = input({ type: "number", min: "1", value: a.schedule?.everyHours || 24 });
    const schChannel = el("select", {}, ...channels.map((c) => el("option", { value: c.id, selected: c.id === a.schedule?.channel ? "" : undefined }, "#" + c.name)));
    const schPrompt = el("textarea", { placeholder: "ex.: Pesquise as 5 notícias mais relevantes de tecnologia e IA das últimas 24h e escreva um resumo comentado pra comunidade, com links." }, a.schedule?.prompt || "");
    const avatarWrap = el("div", {}); let avatarCfg = a.avatar || { skin: 1, hair: 0, hairColor: 0, shirt: 3, accessory: 1 };
    mountAvatarEditor(avatarWrap, avatarCfg, (c) => { avatarCfg = c; });
    const testIn = input({ placeholder: "mensagem de teste" }), testOut = el("div", { class: "pre hidden" });
    const collect = () => ({
      id: a.id, name: name.value, role: role.value, greeting: greeting.value, systemPrompt: sys.value, providerId: provider.value || null, model: model.value,
      temperature: Number(temp.value), tools: [...tools.querySelectorAll("input:checked")].map((i) => i.value), rss: rss.value.split("\n").map((s) => s.trim()).filter(Boolean),
      avatar: avatarCfg, zone: zone.value || null, x: Number(x.value) || 0, y: Number(y.value) || 0, wander: wander.checked, enabled: enabled.checked,
      schedule: { enabled: schOn.checked, everyHours: Number(schHours.value) || 24, channel: schChannel.value, prompt: schPrompt.value }, lastRun: a.lastRun,
    });
    editor.append(el("div", { class: "card glass" },
      el("h2", {}, a.id ? `Editar: ${a.name}` : "Novo agente"),
      el("div", { class: "grid" },
        el("div", {}, field("nome", name), field("papel (aparece embaixo do nome)", role), field("saudação", greeting), field("system prompt", sys),
          el("div", { class: "row" }, field("provedor", provider), field("modelo", model), field("temperatura", temp)),
          field("ferramentas", tools), field("fontes RSS", rss)),
        el("div", {}, field("aparência", avatarWrap),
          el("div", { class: "row" }, field("zona no mapa", zone), field("tile x", x), field("tile y", y)),
          el("div", { class: "checks" }, el("label", {}, wander, "passeia pela zona"), el("label", {}, enabled, "ativo no mapa")),
          el("h3", {}, "Agenda (posta sozinho)"),
          el("div", { class: "checks" }, el("label", {}, schOn, "ligada")),
          el("div", { class: "row" }, field("a cada (horas)", schHours), field("canal", schChannel)),
          field("tarefa", schPrompt)),
      ),
      el("div", { class: "row" },
        el("button", { class: "btn primary", onclick: async () => { try { await api("POST", "/api/admin/agents", collect()); toast("agente salvo"); showTab("agents"); } catch (e) { toast(e.message, false); } } }, "Salvar"),
        a.id ? el("button", { class: "btn", onclick: async () => { testOut.classList.remove("hidden"); testOut.textContent = "pensando…"; try { await api("POST", "/api/admin/agents", collect()); const r = await api("POST", `/api/admin/agents/${a.id}/test`, { message: testIn.value || undefined }); testOut.textContent = (r.trace?.length ? "ferramentas: " + r.trace.map((t) => `${t.tool}(${JSON.stringify(t.args)})`).join(", ") + "\n\n" : "") + r.content; } catch (e) { testOut.textContent = "erro: " + e.message; } } }, "Salvar e testar") : null,
        a.id ? testIn : null,
        a.id && a.schedule?.prompt ? el("button", { class: "btn", onclick: async () => { testOut.classList.remove("hidden"); testOut.textContent = "rodando agenda…"; try { const r = await api("POST", `/api/admin/agents/${a.id}/run-schedule`); testOut.textContent = "postado em #" + a.schedule.channel + ":\n\n" + r.content; } catch (e) { testOut.textContent = "erro: " + e.message; } } }, "Rodar agenda agora") : null,
        a.id ? el("button", { class: "btn danger", onclick: async () => { if (!confirm("apagar agente?")) return; await api("DELETE", `/api/admin/agents/${a.id}`); showTab("agents"); } }, "Apagar") : null,
      ), testOut));
    editor.scrollIntoView({ behavior: "smooth" });
  }
}

// ---------- mundo ----------
async function renderWorld(root) {
  const o = overview;
  const locked = new Set(o.locked);
  const zonesCard = el("div", { class: "card glass" }, el("h2", {}, "Salas"), el("p", { class: "lead" }, "Trancada: só admin e professores entram. Vale na hora pra quem já está no espaço."),
    ...o.zones.map((z) => el("div", { class: "zone-row" }, el("span", {}, el("b", {}, z.name), " ", el("span", { class: "sub" }, `${z.kind} · ${z.w}x${z.h}`)),
      el("span", { class: "badge " + (locked.has(z.id) ? "off" : "on") }, locked.has(z.id) ? "trancada" : "aberta"),
      el("button", { class: "btn small", onclick: async () => { locked.has(z.id) ? locked.delete(z.id) : locked.add(z.id); await api("PUT", "/api/admin/world", { locked: [...locked] }); showTab("world"); } }, locked.has(z.id) ? "Destrancar" : "Trancar"))));
  root.append(zonesCard);

  // objetos e árvores: mover por tile
  const objRows = o.objects.map((ob) => { const x = input({ type: "number", value: ob.x }), y = input({ type: "number", value: ob.y }); return { id: ob.id, x, y, row: el("tr", {}, el("td", {}, ob.label, " ", el("span", { class: "sub" }, ob.kind)), el("td", {}, x), el("td", {}, y)) }; });
  const decRows = o.decor.map((d, i) => { const x = input({ type: "number", value: d.x }), y = input({ type: "number", value: d.y }); return { i, x, y, row: el("tr", {}, el("td", {}, d.sprite), el("td", {}, x), el("td", {}, y)) }; });
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Objetos e árvores"), el("p", { class: "lead" }, "Coordenadas em tiles (x da esquerda pra direita, y de cima pra baixo). Salvar recarrega o espaço pra todo mundo."),
    el("div", { class: "grid" },
      el("div", {}, el("h3", {}, "Objetos interativos"), el("table", {}, el("tr", {}, el("th", {}, "objeto"), el("th", {}, "x"), el("th", {}, "y")), ...objRows.map((r) => r.row))),
      el("div", {}, el("h3", {}, "Árvores"), el("table", {}, el("tr", {}, el("th", {}, "sprite"), el("th", {}, "x"), el("th", {}, "y")), ...decRows.map((r) => r.row)))),
    el("div", { class: "row", style: "margin-top:10px" }, el("button", { class: "btn primary", onclick: async () => {
      const objects = Object.fromEntries(objRows.map((r) => [r.id, { x: Number(r.x.value), y: Number(r.y.value) }]));
      const decor = Object.fromEntries(decRows.map((r) => [r.i, { x: Number(r.x.value), y: Number(r.y.value) }]));
      try { await api("PUT", "/api/admin/world", { objects, decor }); toast("posições salvas, espaço recarregado"); } catch (e) { toast(e.message, false); }
    } }, "Salvar posições"))));

  // bichos
  const KINDS = ["fox", "hare", "deer", "boar", "grouse"], LABEL = { fox: "raposa", hare: "lebre", deer: "cervo", boar: "javali", grouse: "tetraz" };
  let npcs = (o.npcs || []).map((n) => ({ ...n }));
  const npcBox = el("div", {});
  const paintNpcs = () => {
    npcBox.innerHTML = "";
    npcBox.append(el("table", {}, el("tr", {}, el("th", {}, "bicho"), el("th", {}, "zona"), el("th", {}, "")), ...npcs.map((n, i) => el("tr", {},
      el("td", {}, el("select", { onchange: (e) => { n.kind = e.target.value; } }, ...KINDS.map((k) => el("option", { value: k, selected: k === n.kind ? "" : undefined }, LABEL[k])))),
      el("td", {}, el("select", { onchange: (e) => { n.zone = e.target.value; } }, ...o.zones.map((z) => el("option", { value: z.id, selected: z.id === n.zone ? "" : undefined }, z.name)))),
      el("td", {}, el("button", { class: "btn small danger", onclick: () => { npcs.splice(i, 1); paintNpcs(); } }, "×"))))));
  };
  paintNpcs();
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Bichos"), npcBox,
    el("div", { class: "row", style: "margin-top:10px" },
      el("button", { class: "btn", onclick: () => { npcs.push({ kind: "hare", zone: "jardim" }); paintNpcs(); } }, "+ bicho"),
      el("button", { class: "btn primary", onclick: async () => { try { await api("PUT", "/api/admin/world", { npcs }); toast("bichos atualizados"); } catch (e) { toast(e.message, false); } } }, "Salvar bichos"))));

  // upload do mapa
  const file = el("input", { type: "file", accept: ".json,application/json" });
  const status = el("div", {});
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Mapa (Tiled)"),
    el("p", { class: "lead" }, "Edite client/public/maps/sede.json no Tiled (mapeditor.org) e envie o JSON aqui. Entra no ar na hora, sem deploy. Precisa manter as camadas ground/walls/furniture e as camadas de objetos zones/objects/decor/npcs/graffiti/meta."),
    el("div", { class: "row" }, file, el("button", { class: "btn primary", onclick: async () => {
      const f = file.files?.[0]; if (!f) return toast("escolha o arquivo", false);
      status.textContent = "enviando…";
      try { const t = JSON.parse(await f.text()); const r = await api("POST", "/api/admin/map", t); status.innerHTML = `<span class="ok">mapa no ar · zonas: ${r.zones.join(", ")}</span>`; } catch (e) { status.innerHTML = `<span class="err">${e.message}</span>`; }
    } }, "Enviar mapa")), status));
}

// ---------- usuários ----------
async function renderUsers(root) {
  const users = await api("GET", "/api/admin/users");
  const rows = users.map((u) => {
    const role = el("select", { onchange: async (e) => { try { await api("PUT", `/api/admin/users/${u.id}`, { role: e.target.value }); toast("cargo atualizado"); } catch (err) { toast(err.message, false); } } }, ...["admin", "professor", "member"].map((r) => el("option", { value: r, selected: r === u.role ? "" : undefined }, r)));
    const pw = input({ type: "password", placeholder: "nova senha" });
    const prem = el("input", { type: "checkbox", checked: u.premium ? "" : undefined, title: "libera skins premium (ex.: Orc)", onchange: async (e) => { try { await api("PUT", `/api/admin/users/${u.id}`, { premium: e.target.checked }); toast("premium atualizado"); } catch (err) { toast(err.message, false); } } });
    return el("tr", {}, el("td", {}, el("b", {}, u.name), el("div", { class: "sub" }, u.email)), el("td", {}, role), el("td", {}, el("label", { class: "checks" }, prem, "premium")), el("td", {}, u.last_login ? new Date(u.last_login).toLocaleString("pt-BR") : "nunca"),
      el("td", {}, el("div", { class: "row" }, pw, el("button", { class: "btn small", onclick: async () => { try { await api("PUT", `/api/admin/users/${u.id}`, { password: pw.value }); pw.value = ""; toast("senha trocada"); } catch (e) { toast(e.message, false); } } }, "trocar"))),
      el("td", {}, u.id !== me.id ? el("button", { class: "btn small danger", onclick: async () => { if (!confirm(`apagar ${u.email}?`)) return; await api("DELETE", `/api/admin/users/${u.id}`); showTab("users"); } }, "apagar") : ""));
  });
  const email = input({ type: "email", placeholder: "e-mail" }), name = input({ placeholder: "nome" }), pass = input({ type: "password", placeholder: "senha (6+)" });
  const role = el("select", {}, ...["member", "professor", "admin"].map((r) => el("option", { value: r }, r)));
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Contas"), el("p", { class: "lead" }, "admin: tudo. professor: entra em salas trancadas e posta em #anúncios. member: acesso comum."),
    el("table", {}, el("tr", {}, el("th", {}, "conta"), el("th", {}, "cargo"), el("th", {}, "premium"), el("th", {}, "último login"), el("th", {}, "senha"), el("th", {}, "")), ...rows)));
  root.append(el("div", { class: "card glass" }, el("h3", {}, "Criar conta"), el("div", { class: "row" }, email, name, pass, role,
    el("button", { class: "btn primary", onclick: async () => { try { await api("POST", "/api/admin/users", { email: email.value, name: name.value, password: pass.value, role: role.value }); toast("conta criada"); showTab("users"); } catch (e) { toast(e.message, false); } } }, "Criar"))));
}

// ---------- configurações ----------
async function renderSettings(root) {
  const s = overview.settings;
  const name = input({ value: s.communityName }), guests = el("input", { type: "checkbox", checked: s.allowGuests ? "" : undefined }), reg = el("input", { type: "checkbox", checked: s.allowRegister ? "" : undefined });
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Configurações"),
    field("nome da comunidade", name),
    el("div", { class: "checks" }, el("label", {}, guests, "permitir visitantes (entrar só com nome, sem conta)"), el("label", {}, reg, "permitir cadastro livre (membros criam a própria conta)")),
    el("p", { class: "lead" }, "Pra comunidade paga: visitantes desligado, cadastro desligado, e você cria as contas dos membros aqui (ou depois via integração de pagamento)."),
    el("div", { class: "row", style: "margin-top:10px" }, el("button", { class: "btn primary", onclick: async () => { try { await api("PUT", "/api/admin/settings", { communityName: name.value, allowGuests: guests.checked, allowRegister: reg.checked }); toast("salvo"); } catch (e) { toast(e.message, false); } } }, "Salvar"))));
}

// ---------- conteúdos (biblioteca) ----------
const TYPE_HINT = {
  aula: "Vídeo (YouTube, Vimeo, Loom ou arquivo .mp4 enviado) + texto de apoio em Markdown.",
  skill: "Uma habilidade pronta pra usar: explique o quê, quando e como. Anexe o arquivo da skill (zip, md) se houver.",
  prompt: "O corpo vira o prompt em si, com botão 'copiar' pro membro. Use {variáveis} pra ele preencher.",
  automacao: "Fluxo pronto (n8n, Make, Zapier, script). Explique a instalação e anexe o JSON/arquivo.",
  template: "Arquivo pronto (planilha, doc, Notion, Canva). Anexe ou coloque o link.",
  link: "Só um link externo com explicação curta.",
};
const uploadFile = (file, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/api/admin/uploads?name=${encodeURIComponent(file.name)}`);
  xhr.setRequestHeader("content-type", "application/octet-stream");
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
  xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); xhr.status < 300 ? resolve(j) : reject(new Error(j.error || xhr.statusText)); } catch { reject(new Error("resposta inválida")); } };
  xhr.onerror = () => reject(new Error("falha no envio"));
  xhr.send(file);
});
const fmtSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : n > 1e3 ? Math.round(n / 1e3) + " KB" : n + " B";

async function renderContent(root) {
  const { items, types, typeLabel } = await api("GET", "/api/admin/content");
  const cats = [...new Set(items.map((i) => i.category))];
  root.append(el("div", { class: "card glass" }, el("h2", {}, "Conteúdos da biblioteca"),
    el("p", { class: "lead" }, "Aulas, skills, prompts, automações e templates que os membros veem em /membros. Arquivos ficam hospedados no seu servidor. Só o que estiver publicado aparece pra eles.")));
  let filterType = "";
  const listEl = el("div", { class: "list" });
  const paint = () => {
    listEl.innerHTML = "";
    const vis = items.filter((i) => !filterType || i.type === filterType);
    if (!vis.length) listEl.append(el("p", { class: "lead" }, "nenhum conteúdo ainda."));
    let last = null;
    for (const it of vis) {
      if (it.category !== last) { listEl.append(el("div", { class: "mono dim", style: "padding:8px 4px 2px" }, it.category)); last = it.category; }
      listEl.append(el("div", { class: "item" },
        el("span", { class: "badge" }, typeLabel[it.type]),
        el("span", { class: "grow" }, el("b", {}, it.title), el("div", { class: "sub" }, [it.video ? "vídeo" : null, it.files?.length ? `${it.files.length} arquivo(s)` : null, it.visibility === "professor" ? "só professores" : null, it.author?.name ? `por ${it.author.name}` : null].filter(Boolean).join(" · "))),
        el("span", { class: "badge " + (it.published ? "on" : "off") }, it.published ? "publicado" : "rascunho"),
        el("button", { class: "btn small", onclick: () => openItem(it) }, "Editar")));
    }
  };
  const typeSel = el("select", { onchange: (e) => { filterType = e.target.value; paint(); } }, el("option", { value: "" }, "todos os tipos"), ...types.map((t) => el("option", { value: t }, typeLabel[t])));
  paint();
  root.append(el("div", { class: "card glass" }, el("div", { class: "row", style: "justify-content:space-between" }, el("h3", {}, `${items.length} conteúdo(s)`), el("div", { class: "row" }, typeSel, el("button", { class: "btn primary", onclick: () => openItem({}) }, "Novo conteúdo"))), listEl));
  const editor = el("div", {}); root.append(editor);

  function openItem(it) {
    editor.innerHTML = "";
    const type = el("select", {}, ...types.map((t) => el("option", { value: t, selected: t === (it.type || "aula") ? "" : undefined }, typeLabel[t])));
    const hint = el("p", { class: "lead" }, TYPE_HINT[it.type || "aula"]);
    const title = input({ value: it.title || "", placeholder: "título" });
    const summary = input({ value: it.summary || "", placeholder: "uma frase que aparece no card" });
    const category = input({ value: it.category || "", placeholder: "módulo (ex.: Fundamentos de tráfego)", list: "cats" });
    const dl = el("datalist", { id: "cats" }, ...cats.map((c) => el("option", { value: c })));
    const tags = input({ value: (it.tags || []).join(", "), placeholder: "tags separadas por vírgula" });
    const order = input({ type: "number", value: it.order ?? 0 });
    const body = el("textarea", { class: "mono", style: "min-height:260px", placeholder: "Markdown: # título, **negrito**, - lista, ```código```, [link](url)" }, it.body || "");
    const preview = el("div", { class: "md hidden", style: "background:rgba(0,0,0,0.35);border:1px solid var(--line);border-radius:8px;padding:12px 16px;max-height:420px;overflow:auto;margin-top:8px" });
    const togglePrev = el("button", { class: "btn small", onclick: () => { preview.classList.toggle("hidden"); preview.innerHTML = renderMarkdown(body.value); wireCopyButtons(preview); togglePrev.textContent = preview.classList.contains("hidden") ? "prévia" : "fechar prévia"; } }, "prévia");
    const video = input({ value: it.video || "", placeholder: "link do YouTube/Vimeo/Loom ou envie um .mp4 abaixo" });
    const link = input({ value: it.link || "", placeholder: "https://…" });
    const visibility = el("select", {}, el("option", { value: "member", selected: it.visibility !== "professor" ? "" : undefined }, "membros e professores"), el("option", { value: "professor", selected: it.visibility === "professor" ? "" : undefined }, "só professores e admin"));
    const published = el("input", { type: "checkbox", checked: it.published ? "" : undefined });
    let files = [...(it.files || [])];
    const filesBox = el("div", { class: "list" });
    const paintFiles = () => { filesBox.innerHTML = ""; for (const [i, f] of files.entries()) filesBox.append(el("div", { class: "item" }, el("span", { class: "grow" }, f.name, " ", el("span", { class: "sub" }, fmtSize(f.size))), el("button", { class: "btn small danger", onclick: async () => { if (f.url.startsWith("/files/") && confirm("apagar o arquivo do servidor?")) await api("DELETE", `/api/admin/uploads/${f.url.split("/").pop()}`).catch(() => {}); files.splice(i, 1); paintFiles(); } }, "×"))); };
    paintFiles();
    const fileIn = el("input", { type: "file", multiple: "" }), prog = el("span", { class: "sub" });
    fileIn.onchange = async () => {
      for (const f of fileIn.files) {
        prog.textContent = `enviando ${f.name}… 0%`;
        try { const r = await uploadFile(f, (p) => (prog.textContent = `enviando ${f.name}… ${p}%`)); if (/\.(mp4|webm|m4v|mov)$/i.test(f.name) && !video.value) video.value = r.url; else files.push(r); paintFiles(); prog.textContent = ""; }
        catch (e) { prog.textContent = "erro: " + e.message; }
      }
      fileIn.value = "";
    };
    type.onchange = () => { hint.textContent = TYPE_HINT[type.value]; };
    const collect = () => ({ id: it.id, type: type.value, title: title.value, summary: summary.value, category: category.value, tags: tags.value, order: Number(order.value) || 0, body: body.value, video: video.value, link: link.value, files, visibility: visibility.value, published: published.checked });
    const save = async (pub) => { try { if (pub !== undefined) published.checked = pub; const r = await api("POST", "/api/admin/content", collect()); toast(r.published ? "publicado" : "salvo como rascunho"); showTab("content"); } catch (e) { toast(e.message, false); } };
    editor.append(dl, el("div", { class: "card glass" },
      el("h2", {}, it.id ? `Editar: ${it.title}` : "Novo conteúdo"),
      el("div", { class: "grid" },
        el("div", {}, el("div", { class: "row" }, field("tipo", type), field("módulo", category), field("ordem", order)), hint, field("título", title), field("resumo", summary), field("tags", tags),
          el("div", { class: "row", style: "justify-content:space-between" }, el("span", { class: "mono" }, "corpo (markdown)"), togglePrev), body, preview),
        el("div", {}, field("vídeo", video), field("link externo", link),
          field("arquivos", el("div", {}, filesBox, el("div", { class: "row", style: "margin-top:6px" }, fileIn, prog))),
          el("div", { class: "row" }, field("visibilidade", visibility)),
          el("div", { class: "checks" }, el("label", {}, published, "publicado (visível pros membros)")),
          it.id ? el("p", { class: "lead" }, el("a", { href: `/membros?i=${it.id}`, target: "_blank", style: "color:inherit" }, "ver como membro ↗")) : null),
      ),
      el("div", { class: "row" },
        el("button", { class: "btn primary", onclick: () => save(true) }, "Salvar e publicar"),
        el("button", { class: "btn", onclick: () => save(false) }, "Salvar rascunho"),
        it.id ? el("button", { class: "btn danger", onclick: async () => { if (!confirm("apagar conteúdo e seus arquivos?")) return; await api("DELETE", `/api/admin/content/${it.id}`); showTab("content"); } }, "Apagar") : null,
      )));
    editor.scrollIntoView({ behavior: "smooth" });
  }
}

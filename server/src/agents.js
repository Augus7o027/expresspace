// Agentes (NPCs com LLM). Provedores OpenAI-compatíveis (NVIDIA NIM, OpenRouter, Groq, Ollama, OpenAI...).
// Ferramentas: web_search (DuckDuckGo), fetch_url (lê uma página), rss (fontes do agente).
// Agenda: cada agente pode postar num canal a cada N horas com um prompt de tarefa.
import crypto from "node:crypto";

const TOOL_DEFS = {
  web_search: {
    type: "function",
    function: { name: "web_search", description: "Busca na web (DuckDuckGo). Use para notícias, tendências e fatos recentes.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  },
  fetch_url: {
    type: "function",
    function: { name: "fetch_url", description: "Lê o texto de uma página web (até 6000 caracteres).", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  },
  rss: {
    type: "function",
    function: { name: "rss", description: "Lê as últimas notícias das fontes RSS configuradas para este agente.", parameters: { type: "object", properties: { limit: { type: "integer" } } } },
  },
};
export const TOOL_NAMES = Object.keys(TOOL_DEFS);

const strip = (html) => String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

import { assertPublicUrl } from "./security.js";
async function fetchText(url, ms = 12000) {
  url = assertPublicUrl(url); // agentes só buscam endereços públicos (nada de localhost, rede interna, metadata da VPS)
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; ExpresSpaceBot/1.0)", accept: "text/html,application/xml,application/rss+xml,*/*" }, redirect: "follow" });
    return await r.text();
  } finally { clearTimeout(t); }
}

export async function webSearch(query) {
  const html = await fetchText("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query));
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    let href = m[1];
    const u = href.match(/uddg=([^&]+)/); if (u) href = decodeURIComponent(u[1]);
    out.push({ title: strip(m[2]), url: href, snippet: strip(m[3] || "") });
  }
  return out;
}

export async function fetchUrl(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("url inválida");
  const html = await fetchText(url);
  return strip(html).slice(0, 6000);
}

export async function readRss(urls, limit = 10) {
  const items = [];
  for (const u of urls.slice(0, 6)) {
    try {
      const xml = await fetchText(u, 8000);
      const src = (xml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || u;
      for (const it of xml.split(/<item[\s>]|<entry[\s>]/).slice(1)) {
        const title = strip((it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "");
        const link = ((it.match(/<link[^>]*href="([^"]+)"/) || it.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
        const date = (it.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\//) || [])[1] || "";
        const desc = strip((it.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\//) || [])[1] || "").slice(0, 240);
        if (title) items.push({ source: strip(src).slice(0, 60), title, link, date: date.trim(), desc });
        if (items.length >= limit * 3) break;
      }
    } catch (e) { items.push({ source: u, title: "(falha ao ler: " + e.message + ")" }); }
  }
  return items.slice(0, limit);
}

// ---------- chamada ao provedor ----------
export async function chatCompletion(provider, model, messages, { tools, temperature = 0.7, max_tokens = 1200 } = {}) {
  const base = String(provider.baseUrl || "").replace(/\/+$/, "");
  const body = { model, messages, temperature, max_tokens };
  if (tools?.length) { body.tools = tools; body.tool_choice = "auto"; }
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`provedor ${r.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  return j.choices?.[0]?.message || { role: "assistant", content: "" };
}

// Roda o agente: system prompt + histórico + tools (até 4 rodadas de ferramentas)
export async function runAgent({ agent, provider, history, userMessage, onTool }) {
  const tools = (agent.tools || []).filter((t) => TOOL_DEFS[t]).map((t) => TOOL_DEFS[t]);
  const sys = { role: "system", content: `${agent.systemPrompt || ""}\n\nData de hoje: ${new Date().toLocaleDateString("pt-BR")}. Responda em português do Brasil, direto, sem enrolação.` };
  const msgs = [sys, ...history.slice(-16), { role: "user", content: userMessage }];
  const trace = [];
  let useTools = tools.length > 0;
  for (let round = 0; round < 5; round++) {
    let msg;
    try { msg = await chatCompletion(provider, agent.model, msgs, { tools: useTools ? tools : undefined, temperature: agent.temperature ?? 0.7 }); }
    catch (e) {
      // modelo sem suporte a tools: tenta de novo sem elas
      if (useTools && /tool|function/i.test(e.message)) { useTools = false; round--; continue; }
      throw e;
    }
    const calls = msg.tool_calls || [];
    if (!calls.length) return { content: msg.content || "", trace };
    msgs.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const c of calls) {
      let args = {}; try { args = JSON.parse(c.function?.arguments || "{}"); } catch {}
      const name = c.function?.name;
      onTool?.(name, args);
      let result;
      try {
        if (name === "web_search") result = await webSearch(String(args.query || ""));
        else if (name === "fetch_url") result = await fetchUrl(String(args.url || ""));
        else if (name === "rss") result = await readRss(agent.rss || [], Number(args.limit) || 10);
        else result = { error: "ferramenta desconhecida" };
      } catch (e) { result = { error: e.message }; }
      trace.push({ tool: name, args });
      msgs.push({ role: "tool", tool_call_id: c.id, name, content: JSON.stringify(result).slice(0, 8000) });
    }
  }
  return { content: "Não consegui concluir a pesquisa agora. Tenta de novo?", trace };
}

// ---------- registro de agentes + agenda ----------
export function agentsRepo(store) {
  const C = "agents", P = "providers";
  return {
    listProviders: () => store.listDocs(P),
    getProvider: (id) => store.getDoc(P, id),
    putProvider: async (data) => store.putDoc(P, data.id || crypto.randomUUID(), { name: String(data.name || "provedor"), baseUrl: String(data.baseUrl || ""), apiKey: String(data.apiKey || ""), models: Array.isArray(data.models) ? data.models.map(String) : String(data.models || "").split(",").map((s) => s.trim()).filter(Boolean) }),
    delProvider: (id) => store.delDoc(P, id),
    list: () => store.listDocs(C),
    get: (id) => store.getDoc(C, id),
    put: async (data) => {
      const id = data.id || crypto.randomUUID();
      const a = {
        name: String(data.name || "Agente").slice(0, 32), role: String(data.role || "").slice(0, 60),
        systemPrompt: String(data.systemPrompt || ""), greeting: String(data.greeting || "").slice(0, 300),
        providerId: data.providerId || null, model: String(data.model || ""), temperature: Number(data.temperature ?? 0.7),
        tools: (data.tools || []).filter((t) => TOOL_NAMES.includes(t)), rss: (data.rss || []).map(String).filter(Boolean),
        avatar: data.avatar || { skin: 1, hair: 0, hairColor: 0, shirt: 3, accessory: 1 },
        zone: data.zone || null, x: Number(data.x) || 0, y: Number(data.y) || 0, wander: !!data.wander, enabled: data.enabled !== false,
        schedule: data.schedule ? { everyHours: Math.max(1, Number(data.schedule.everyHours) || 24), channel: String(data.schedule.channel || "geral"), prompt: String(data.schedule.prompt || ""), enabled: !!data.schedule.enabled } : null,
        lastRun: data.lastRun || null,
      };
      return store.putDoc(C, id, a);
    },
    del: (id) => store.delDoc(C, id),
    // histórico de conversa por usuário x agente
    history: async (agentId, userId) => (await store.getDoc("agent_chats", `${agentId}:${userId}`))?.messages || [],
    saveHistory: (agentId, userId, messages) => store.putDoc("agent_chats", `${agentId}:${userId}`, { messages: messages.slice(-30) }),
  };
}

// Agenda: checa a cada minuto se algum agente precisa postar
export function startScheduler(repo, postToChannel) {
  setInterval(async () => {
    for (const a of await repo.list()) {
      const s = a.schedule; if (!a.enabled || !s?.enabled || !s.prompt) continue;
      const due = !a.lastRun || Date.now() - new Date(a.lastRun).getTime() > s.everyHours * 3600e3;
      if (!due) continue;
      const provider = a.providerId && await repo.getProvider(a.providerId);
      if (!provider) continue;
      await repo.put({ ...a, lastRun: new Date().toISOString() });
      try {
        const { content } = await runAgent({ agent: a, provider, history: [], userMessage: s.prompt });
        if (content) await postToChannel(s.channel, a, content);
      } catch (e) { console.warn(`[agenda] ${a.name}:`, e.message); }
    }
  }, 60e3);
}

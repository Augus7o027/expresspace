// Caixa de som das salas: resolve links do YouTube, pesquisa (com ajuda da IA quando há provedor
// configurado) e guarda o que está tocando em cada caixa. O cliente toca via IFrame API do YouTube,
// sincronizado pelo startedAt do servidor.
import { chatCompletion } from "./agents.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// aceita: id de 11 chars, watch?v=, youtu.be/, /embed/, /shorts/, /live/, music.youtube.com
export function parseYouTube(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return { videoId: s };
  let u; try { u = new URL(s.startsWith("http") ? s : "https://" + s); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname)) return null;
  let id = u.searchParams.get("v");
  if (!id) { const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/); if (m) id = m[1]; }
  if (!id && u.hostname === "youtu.be") id = u.pathname.slice(1, 12);
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const t = u.searchParams.get("t") || u.searchParams.get("start");
  return { videoId: id, start: t ? parseInt(t, 10) || 0 : 0, list: u.searchParams.get("list") || undefined };
}

async function fetchText(url, ms = 8000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8", accept: "text/html,*/*" }, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}

// título/autor sem chave de API (oEmbed)
export async function videoInfo(videoId) {
  try {
    const j = JSON.parse(await fetchText(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, 6000));
    return { title: String(j.title || "").slice(0, 120), author: String(j.author_name || "").slice(0, 60) };
  } catch { return { title: "", author: "" }; }
}

// pesquisa raspando a página de resultados (ytInitialData) — sem chave de API
export async function searchYouTube(q, limit = 8) {
  const html = await fetchText("https://www.youtube.com/results?search_query=" + encodeURIComponent(q) + "&hl=pt&gl=BR", 9000);
  const out = []; const seen = new Set();
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"/g; let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const id = m[1]; if (seen.has(id)) continue; seen.add(id);
    const chunk = html.slice(m.index, m.index + 6000);
    const title = (chunk.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
    const len = (chunk.match(/"lengthText":\{[^}]*"simpleText":"([^"]+)"/) || [])[1] || "";
    const owner = (chunk.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
    const un = (s) => { try { return JSON.parse('"' + s + '"'); } catch { return s; } };
    out.push({ videoId: id, title: un(title).slice(0, 120), length: len, author: un(owner).slice(0, 60) });
  }
  return out;
}

// IA: transforma um pedido em linguagem natural ("algo pra focar, lo-fi sem letra") numa boa busca
export async function refineQuery(provider, text) {
  const model = provider?.models?.[0]; if (!provider || !model) return null;
  try {
    const msg = await chatCompletion(provider, model, [
      { role: "system", content: "Você transforma pedidos de música/som ambiente em UMA busca curta e eficaz para o YouTube (até 8 palavras, sem aspas, sem explicações). Prefira mixes/playlists longos quando o pedido for de ambiente. Responda só com a busca." },
      { role: "user", content: String(text).slice(0, 300) },
    ], { temperature: 0.3, max_tokens: 40 });
    const q = String(msg.content || "").split("\n")[0].replace(/^["'`\s]+|["'`\s]+$/g, "").slice(0, 80);
    return q || null;
  } catch { return null; }
}

// estado das caixas: id -> { videoId, title, author, startedAt, by, byName, volume }
export function speakersRepo(store) {
  const C = "world", D = "speakers";
  let cache = null;
  const load = async () => (cache ??= (await store.getDoc(C, D)) || {});
  return {
    all: async () => { const s = await load(); const { id, ...rest } = s; return rest; },
    get: async (sid) => (await load())[sid] || null,
    set: async (sid, state) => { const s = await load(); if (state) s[sid] = state; else delete s[sid]; await store.putDoc(C, D, s); return state; },
  };
}

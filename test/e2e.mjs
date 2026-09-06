// Teste ponta a ponta: sobe o servidor, abre dois usuários, anda, checa proximidade, chat e teleport.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

import http from "node:http";
import { rmSync } from "node:fs";

const PORT = 3100, LLM_PORT = 3199;
// LLM falso (OpenAI-compatível): pede a ferramenta fetch_url e depois responde com o que leu
const fake = http.createServer((req, res) => {
  if (req.url === "/page") { res.setHeader("content-type", "text/html"); return res.end("<html><body><h1>Notícia teste</h1><p>O ExpresSpace lançou agentes.</p></body></html>"); }
  let body = ""; req.on("data", (c) => body += c); req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const last = j.messages[j.messages.length - 1];
    let message;
    if (last.role === "tool") message = { role: "assistant", content: "Li a página: " + JSON.parse(last.content).slice(0, 60) };
    else if (j.tools?.length) message = { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "fetch_url", arguments: JSON.stringify({ url: `http://localhost:${LLM_PORT}/page` }) } }] };
    else message = { role: "assistant", content: "ok (sem ferramentas)" };
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message }] }));
  });
}).listen(LLM_PORT);

rmSync("/tmp/sede-e2e", { recursive: true, force: true });
const server = spawn("node", ["server/src/index.js"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: "/tmp/sede-e2e", ADMIN_EMAIL: "admin@teste.com", ADMIN_PASSWORD: "segredo1", SESSION_SECRET: "x", AGENT_ALLOW_LOCAL: "1" }, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
const base = `http://localhost:${PORT}`;

// ---- admin via API: provedor falso, agente perto do spawn, tranca o Foco
const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@teste.com", password: "segredo1" }) });
const cookie = login.headers.get("set-cookie").split(";")[0];
const adminApi = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const prov = await adminApi("POST", "/api/admin/providers", { name: "fake", baseUrl: `http://localhost:${LLM_PORT}/v1`, apiKey: "x", models: "fake-1" });
const ag = await adminApi("POST", "/api/admin/agents", { name: "Téo", role: "mentor tech", providerId: prov.id, model: "fake-1", tools: ["fetch_url"], zone: "recepcao", x: 6, y: 8, systemPrompt: "teste" });
await adminApi("PUT", "/api/admin/world", { locked: ["foco"] });
console.log("admin ok: provedor", !!prov.id, "agente", ag.name, "| teste do agente:", (await adminApi("POST", `/api/admin/agents/${ag.id}/test`, { message: "oi" })).content);
const users = await adminApi("POST", "/api/admin/users", { email: "membro@teste.com", name: "Membro", password: "senha-forte-1", role: "member" });
console.log("conta criada:", users.email);

setTimeout(() => { console.log("TIMEOUT global"); process.exit(2); }, 420000);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone", "camera"] });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone", "camera"] });
const A = await ctxA.newPage(), B = await ctxB.newPage();
const errors = [];
const csp = [];
for (const p of [A, B]) { p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 160)); if (/rtc|offer|mic/i.test(m.text())) console.log("console:", m.text().slice(0, 200)); }); }

await A.goto(base + "/?name=Ana&auto=1&canvas=1&notour=1", { waitUntil: "domcontentloaded" });
await B.goto(base + "/?name=Bruno&auto=1&canvas=1&notour=1", { waitUntil: "domcontentloaded" });
await A.waitForSelector("#app:not(.hidden)");
await B.waitForSelector("#app:not(.hidden)");
await A.waitForTimeout(1200);
await A.screenshot({ path: "test/shots/01-login.png" }).catch(() => {});
// tela de login separada
const L = await ctxA.newPage(); await L.goto(base, { waitUntil: "domcontentloaded" }); await L.waitForTimeout(1200);
await L.screenshot({ path: "test/shots/00-login.png" }); await L.close();

const online = await A.textContent("#online-count");
console.log("online:", online);
const near1 = await A.textContent("#hud-voice");
console.log("A voz (spawn juntos):", near1);
// proximidade: mic ligado por padrão, conexão fecha sozinha sem canal de voz
await A.waitForTimeout(3000);
console.log("proximidade (sem canal) A:", await A.evaluate(() => [...window.__sede.voice.peers.values()].map((p) => p.pc.connectionState).join(",")), "| mic ligado:", await A.evaluate(() => !window.__sede.voice.muted), "| porta de ruído:", await A.evaluate(() => !!window.__sede.voice.gate), "| espacial:", await A.evaluate(() => window.__sede.spatial?.peers.size ?? "n/a"), "| emissores:", await A.evaluate(() => window.__sede.scene.emitters.length));

// Bruno anda pra longe: sobe e cruza a porta da direita (entra no Foco)
await B.keyboard.down("ArrowUp"); await B.waitForTimeout(350); await B.keyboard.up("ArrowUp");
await B.keyboard.down("ArrowRight"); await B.waitForTimeout(2600); await B.keyboard.up("ArrowRight");
await B.waitForTimeout(500);
console.log("A voz (B longe):", await A.textContent("#hud-voice"));
console.log("B zona (Foco trancado, deve ficar na Recepção):", await B.textContent("#hud-zone"), "pos:", await B.evaluate(() => JSON.stringify(window.__sede.scene.pos)));
await adminApi("PUT", "/api/admin/world", { locked: [] }); await B.waitForTimeout(400);
await B.keyboard.down("ArrowRight"); await B.waitForTimeout(1200); await B.keyboard.up("ArrowRight"); await B.waitForTimeout(400);
console.log("B zona (destrancado):", await B.textContent("#hud-zone"));

// Agente: A vai até o Téo, aperta E, conversa
await A.evaluate(() => { const s = window.__sede.scene; s.pos = { x: 6.5, y: 7.2 }; s.player.setPosition(s.pos.x * 32, s.pos.y * 32); s.checkObjects(); });
await A.waitForTimeout(500);
console.log("prompt agente:", await A.textContent("#hud-prompt"));
await A.keyboard.press("e"); await A.waitForTimeout(400);
console.log("modal agente aberto:", !(await A.getAttribute("#agent-modal", "class")).includes("hidden"), "|", await A.textContent("#agent-title"));
await A.fill("#agent-input", "o que tem de novo?"); await A.press("#agent-input", "Enter"); await A.waitForTimeout(2500);
console.log("resposta do agente:", (await A.textContent("#agent-log")).slice(-80));
await A.screenshot({ path: "test/shots/11-agente.png" });
await A.keyboard.press("Escape");

// Chat no canal
await A.fill("#chat-input", "olá, alguém aí?"); await A.press("#chat-input", "Enter");
await B.waitForTimeout(400);
console.log("B viu msg:", (await B.textContent("#messages")).includes("olá, alguém aí?"));

// Teleport dos dois pra Sala A pelo sidebar -> mesma call
for (const p of [A, B]) { await p.click("#zones li:nth-child(6)"); }
await A.waitForTimeout(600);
console.log("A zona:", await A.textContent("#hud-zone"), "| voz:", await A.textContent("#hud-voice"));

// Mic liga e conecta WebRTC
await A.click("#btn-mic"); await B.click("#btn-mic");
await A.waitForTimeout(2500);
const st = (pg) => pg.evaluate(() => [...window.__sede.voice.peers.values()].map((p) => `${p.pc.connectionState}/${p.pc.signalingState}/${p.pc.iceConnectionState}/polite=${p.polite}`));
console.log("estados A:", await st(A), "B:", await st(B));
console.log("A voz pós-mic:", await A.textContent("#hud-voice"));

// Câmera: B liga, A recebe tile de vídeo
await B.click("#btn-camera"); await A.waitForTimeout(3500);
console.log("tiles de câmera em A:", await A.evaluate(() => document.querySelectorAll("#tiles .tile.camera").length), "| em B:", await B.evaluate(() => document.querySelectorAll("#tiles .tile.camera").length));
await A.screenshot({ path: "test/shots/06-camera.png" });
await B.click("#btn-camera"); await A.waitForTimeout(800);
console.log("tiles após desligar:", await A.evaluate(() => document.querySelectorAll("#tiles .tile:not(.hidden)").length));

// Emoji próprio no chat
await A.click(".tab[data-mode='channel']"); await B.click(".tab[data-mode='channel']");
await A.fill("#chat-input", "bora :fire: :rocket:"); await A.press("#chat-input", "Enter"); await B.waitForTimeout(400);
console.log("emoji svg em B:", await B.evaluate(() => document.querySelectorAll("#messages .emo svg").length));

// Avatar: B troca cabelo/roupa e A vê textura nova
await B.click("#btn-avatar"); await B.waitForTimeout(200);
await B.click("#modal .avatar-row:nth-child(2) .avatar-opt:nth-child(2)"); await B.click("#modal .avatar-row:nth-child(4) .avatar-opt:nth-child(4)");
await B.keyboard.press("Escape"); await A.waitForTimeout(600);
console.log("avatar de B visto por A:", await A.evaluate(() => [...window.__sede.scene.remote.values()][0]?.container.texKey));
await B.click(".tab[data-mode='zone']"); await A.click(".tab[data-mode='zone']");

// Chat local da sala + balão
await B.click('.tab[data-mode="zone"]');
await B.fill("#chat-input", "bora começar?"); await B.press("#chat-input", "Enter");
await A.click('.tab[data-mode="zone"]'); await A.waitForTimeout(500);
console.log("A viu chat da sala:", (await A.textContent("#messages")).includes("bora começar?"));
await A.screenshot({ path: "test/shots/02-sala-a.png" });

// Sala silenciosa
await A.click("#zones li:nth-child(5)"); await A.waitForTimeout(500);
console.log("A no foco:", await A.textContent("#hud-zone"), "|", await A.textContent("#hud-voice"));
await A.screenshot({ path: "test/shots/03-foco.png" });

// Objeto interativo: perto do mural, aperta E, abre modal
await A.evaluate(() => { const s = window.__sede.scene; s.pos = { x: 9.5, y: 3.6 }; s.player.setPosition(s.pos.x * 32, s.pos.y * 32); s.checkObjects(); });
await A.waitForTimeout(200);
console.log("prompt E:", await A.textContent("#hud-prompt"));
await A.keyboard.press("e"); await A.waitForTimeout(300);
console.log("modal:", await A.textContent("#modal-title"), "| aberto:", !(await A.getAttribute("#modal", "class")).includes("hidden"));
await A.screenshot({ path: "test/shots/05-mural.png" });
await A.keyboard.press("Escape");

// Quadro compartilhado: B escreve, A lê
await B.evaluate(() => window.__sede.net.emit("board:set", { id: "quadro-open", content: "pauta: lançamento" }));
await B.waitForTimeout(300);
const board = await A.evaluate(() => new Promise((r) => window.__sede.net.emit("board:get", { id: "quadro-open" }, r)));
console.log("quadro:", board);

// v0.14: tour de primeira vez (página própria) + configurações + service worker
{
  const ctxT = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
  const T = await ctxT.newPage(); await T.goto(base + "/?name=Tati&auto=1&canvas=1", { waitUntil: "domcontentloaded" });
  await T.waitForSelector("#app:not(.hidden)"); await T.waitForSelector("#tour:not(.hidden)", { timeout: 15000 });
  console.log("tour passo 1:", await T.textContent("#tour-step"), "|", await T.textContent("#tour-title"), "| loading escondido:", await T.evaluate(() => document.querySelector("#loading").classList.contains("hidden")));
  await T.screenshot({ path: "test/shots/18-tour.png" });
  await T.keyboard.down("d"); await T.waitForTimeout(2600); await T.keyboard.up("d"); await T.waitForTimeout(500);
  console.log("tour passo 2:", await T.textContent("#tour-step"), "| marcador:", await T.evaluate(() => !!window.__sede.scene.marker));
  await T.evaluate(() => { const s = window.__sede.scene; s.pos.x = 10.5; s.pos.y = 3.6; }); await T.waitForTimeout(700);
  console.log("tour passo 3:", await T.textContent("#tour-step"), "| perto do mural:", await T.evaluate(() => window.__sede.state.nearObject?.id));
  await T.keyboard.press("e"); await T.waitForTimeout(500); await T.keyboard.press("Escape"); await T.waitForTimeout(600);
  console.log("tour passo 4:", await T.textContent("#tour-step")); await T.click("#tour-next"); await T.waitForTimeout(300);
  console.log("tour concluído:", await T.evaluate(() => document.querySelector("#tour").classList.contains("hidden") && localStorage.getItem("sede:tour")));
  await T.click("#btn-settings"); await T.waitForTimeout(800);
  console.log("configurações: mics", await T.$$eval("#set-mic option", (o) => o.length), "| saídas", await T.$$eval("#set-out option", (o) => o.length), "| câmeras", await T.$$eval("#set-cam option", (o) => o.length), "| eco:", await T.textContent("#set-echo"));
  await T.screenshot({ path: "test/shots/19-configuracoes.png" });
  await T.keyboard.press("Escape");
  console.log("service worker registrado:", await T.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration())), "| manifest:", (await fetch(base + "/manifest.webmanifest")).status, "| chave push:", (await (await fetch(base + "/api/push/key")).json()).key?.length);
  await T.close(); await ctxT.close();
}

// v0.13: caixa de som do Lounge — B escolhe, A (na mesma sala) recebe e vê o widget
await A.click("#zones li:nth-child(4)"); await B.click("#zones li:nth-child(4)"); await A.waitForTimeout(900);
const spk = await B.evaluate(() => new Promise((r) => window.__sede.net.emit("speaker:set", { id: "som-lounge", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk&t=10" }, r)));
console.log("caixa de som set:", spk?.state?.videoId, "|", spk?.state?.title?.slice(0, 40), "| erro:", spk?.error);
await A.waitForTimeout(2500);
console.log("A recebeu música da sala:", await A.evaluate(() => window.__sede.state.speakers["som-lounge"]?.videoId), "| widget visível:", await A.evaluate(() => !document.querySelector("#speaker-widget").classList.contains("hidden")), "| título:", await A.textContent("#sw-title"));
await A.click("#sw-open"); await A.waitForTimeout(400);
await A.screenshot({ path: "test/shots/16-caixa-de-som.png" });
const srch = await A.evaluate(() => new Promise((r) => window.__sede.net.emit("speaker:search", { q: "lofi hip hop radio" }, r)));
console.log("pesquisa youtube:", srch?.results?.length, "resultados | ia:", srch?.aiQuery, "| erro:", srch?.error);
await A.waitForTimeout(300);
console.log("stop por quem não colocou:", (await A.evaluate(() => new Promise((r) => window.__sede.net.emit("speaker:stop", { id: "som-lounge" }, r))))?.error);
await A.keyboard.press("Escape");
console.log("guest editando telão (deve falhar):", (await A.evaluate(() => new Promise((r) => window.__sede.net.emit("object:set", { id: "telao", url: "https://x.com" }, r))))?.error);
await A.click("#zones li:nth-child(1)"); await A.waitForTimeout(600);
console.log("A saiu da sala, widget escondido:", await A.evaluate(() => document.querySelector("#speaker-widget").classList.contains("hidden")));

// Menção + status
await A.click(".tab[data-mode='channel']"); await B.click(".tab[data-mode='channel']"); await B.fill("#chat-input", "@Ana bora?"); await B.press("#chat-input", "Enter"); await A.waitForTimeout(400);
console.log("A viu menção:", !!(await A.$(".msg.mentions-me")));
await B.selectOption("#presence", "focus"); await B.waitForTimeout(400);
console.log("B foco na lista:", (await A.textContent("#members")).includes("foco"));
await B.selectOption("#presence", "available");
await A.click(".tab[data-mode='channel']");

// Terraço: bichos e árvores
await A.click("#zones li:nth-child(11)"); await A.waitForTimeout(2500);
console.log("npcs vistos por A:", await A.evaluate(() => window.__sede.scene.npcs.size), "| árvores:", await A.evaluate(() => Object.keys(window.__sede.scene.textures.list).filter((k) => k.startsWith("tree2:") || k.startsWith("prop:")).length));
await A.screenshot({ path: "test/shots/07-terraco.png" });
await A.evaluate(() => { const s = window.__sede.scene; s.cameras.main.setZoom(2.6); }); await A.waitForTimeout(400);
await A.screenshot({ path: "test/shots/08-terraco-zoom.png" });
await A.evaluate(() => window.__sede.scene.cameras.main.setZoom(1.4));
await A.click("#zones li:nth-child(12)"); await A.waitForTimeout(1500);
console.log("A no jardim:", await A.textContent("#hud-zone"));
await A.screenshot({ path: "test/shots/09-jardim.png" });
await A.click("#zones li:nth-child(1)"); await A.waitForTimeout(800);
await A.screenshot({ path: "test/shots/10-recepcao.png" });

// Canal de voz Discord
await B.click("#voice-channels li:nth-child(1)"); await A.click("#voice-channels li:nth-child(1)");
await A.waitForTimeout(5000);
console.log("A canal voz:", await A.textContent("#hud-voice"));
await A.screenshot({ path: "test/shots/04-canal-voz.png" });

console.log("erros de página:", errors);
// Login com conta no navegador
const L2 = await ctxA.newPage(); await L2.goto(base, { waitUntil: "domcontentloaded" }); await L2.waitForTimeout(800);
await L2.click(".login-tabs .tab[data-login='account']"); await L2.fill("#email", "membro@teste.com"); await L2.fill("#password", "senha-forte-1");
await L2.click("#account-form .btn-primary"); await L2.waitForSelector("#app:not(.hidden)"); await L2.waitForTimeout(800);
console.log("login por conta:", await L2.textContent("#me-name"));
await L2.close();
// Painel admin no navegador
const AD = await ctxA.newPage(); await AD.goto(base + "/admin", { waitUntil: "domcontentloaded" }); await AD.waitForTimeout(600);
await AD.fill("#email", "admin@teste.com"); await AD.fill("#password", "segredo1"); await AD.click("#login-form .btn-primary"); await AD.waitForTimeout(1200);
console.log("painel:", (await AD.textContent("#tab-overview")).replace(/\s+/g, " ").slice(0, 90));
await AD.click("#tabs button[data-tab='agents']"); await AD.waitForTimeout(800);
await AD.screenshot({ path: "test/shots/12-admin-agentes.png" });
await AD.click("#tabs button[data-tab='world']"); await AD.waitForTimeout(800);
await AD.screenshot({ path: "test/shots/13-admin-mundo.png" });
// v0.13: admin no mundo edita o link do telão; A recebe object:update
const W = await ctxA.newPage(); await W.goto(base + "/?canvas=1&notour=1", { waitUntil: "domcontentloaded" }); await W.waitForTimeout(800);
await W.click(".login-tabs .tab[data-login='account']"); await W.click("#account-form .btn-primary"); await W.waitForSelector("#app:not(.hidden)"); await W.waitForTimeout(800);
await W.screenshot({ path: "test/shots/17-avatar-editor.png" }).catch(() => {});
const oset = await W.evaluate(() => new Promise((r) => window.__sede.net.emit("object:set", { id: "telao", url: "https://youtu.be/jfKfPfyJRdk", label: "Telão · aula" }, r)));
console.log("admin editou telão:", oset?.url, oset?.label, "| erro:", oset?.error);
await A.waitForTimeout(500);
console.log("A viu novo link do telão:", await A.evaluate(() => { const o = window.__sede.state.map.objects.find((x) => x.id === "telao"); return o.url + " / " + o.label; }));
console.log("link persistido no mapa do servidor:", (await (await fetch(base + "/api/map")).json()).objects.find((o) => o.id === "telao").label);
// v0.14: agenda — evento começando em 20s: lembrete + link no telão + aviso
const ev = await adminApi("POST", "/api/admin/events", { title: "Aula ao vivo: funis", startsAt: new Date(Date.now() + 20000).toISOString(), durationMin: 30, url: "https://youtu.be/jfKfPfyJRdk", description: "teste" });
await A.waitForTimeout(800);
console.log("agenda na barra lateral:", await A.evaluate(() => document.querySelector("#events-box").classList.contains("hidden") ? "escondida" : document.querySelector("#events").textContent));
await A.waitForTimeout(33000);
console.log("evento começou → telão:", await A.evaluate(() => window.__sede.state.map.objects.find((x) => x.id === "telao").url), "| toast:", (await A.textContent("#toast")).slice(0, 60), "| ao vivo:", await A.evaluate(() => document.querySelector("#events li.live")?.textContent));
console.log("estado do evento:", (await adminApi("GET", "/api/admin/events")).find((e) => e.id === ev.id)?.startedAt ? "iniciado" : "não iniciado");
// v0.14: moderação — admin silencia e depois bane Bruno
const mute = await W.evaluate((id) => new Promise((r) => window.__sede.net.emit("mod:action", { targetId: id, action: "mute", minutes: 5 }, r)), (await B.evaluate(() => window.__sede.state.me.id)));
await B.waitForTimeout(500);
console.log("silenciado:", mute?.ok, "| B mudo:", await B.evaluate(() => window.__sede.voice.muted), "| toast B:", (await B.textContent("#toast")).slice(0, 50));
await B.keyboard.press("m"); await B.waitForTimeout(300);
console.log("B tentou ligar o mic:", await B.evaluate(() => window.__sede.voice.muted) ? "continua mudo ✓" : "ligou ✗");
const ban = await W.evaluate((id) => new Promise((r) => window.__sede.net.emit("mod:action", { targetId: id, action: "ban", reason: "teste" }, r)), (await B.evaluate(() => window.__sede.state.me.id)));
await B.waitForTimeout(900);
console.log("banido:", ban?.ok, "| toast B:", (await B.textContent("#toast")).slice(0, 60));
await B.waitForTimeout(10000);
console.log("B depois do reload (deve estar no login com aviso):", await B.evaluate(() => document.querySelector("#login").classList.contains("hidden") ? "no app ✗" : "login ✓ · " + document.querySelector("#login-notice").textContent.slice(0, 50)));
const modv = await adminApi("GET", "/api/admin/moderation");
console.log("moderação: banidos", modv.bans.length, "| log", modv.log.map((l) => l.action).join(","));
await AD.click("#tabs button[data-tab='moderation']"); await AD.waitForTimeout(600); await AD.screenshot({ path: "test/shots/20-admin-moderacao.png" });
await AD.click("#tabs button[data-tab='events']"); await AD.waitForTimeout(600); await AD.screenshot({ path: "test/shots/21-admin-agenda.png" });
await W.close();

// ---- biblioteca: conteúdo via API (com upload), depois como membro no navegador
const up = await fetch(base + "/api/admin/uploads?name=" + encodeURIComponent("planilha de preço.csv"), { method: "POST", headers: { "content-type": "application/octet-stream", cookie }, body: "a,b\n1,2\n" }).then((r) => r.json());
if (!up.url) throw new Error("upload falhou: " + JSON.stringify(up));
const c1 = await adminApi("POST", "/api/admin/content", { type: "aula", title: "Aula 1 · Como funciona o funil", summary: "A base de tudo.", category: "Fundamentos", tags: "funil, básico", video: "https://www.youtube.com/watch?v=jfKfPfyJRdk", body: "# Objetivo\n\nEntender as **3 etapas**.\n\n- topo\n- meio\n- fundo\n\n```js\nconsole.log('oi')\n```", files: [up], published: true });
const c2 = await adminApi("POST", "/api/admin/content", { type: "prompt", title: "Prompt de headline", category: "Copy", body: "Escreva 10 headlines para {produto} focadas em {dor}.", published: true });
const c3 = await adminApi("POST", "/api/admin/content", { type: "template", title: "Rascunho oculto", category: "Copy", published: false });
const c4 = await adminApi("POST", "/api/admin/content", { type: "skill", title: "Só pra professores", category: "Interno", visibility: "professor", published: true });
await AD.click("#tabs button[data-tab='content']"); await AD.waitForTimeout(800);
await AD.screenshot({ path: "test/shots/14-admin-conteudos.png" });
await AD.close();
const memberLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "membro@teste.com", password: "senha-forte-1" }) });
const memberCookie = memberLogin.headers.get("set-cookie").split(";")[0];
// arquivo sem login não abre
console.log("arquivo sem login:", (await fetch(base + up.url)).status, "| com login:", (await fetch(base + up.url, { headers: { cookie } })).status);
const ctxM = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const M = await ctxM.newPage(); await M.goto(base + "/membros", { waitUntil: "domcontentloaded" }); await M.waitForTimeout(600);
await M.fill("#email", "membro@teste.com"); await M.fill("#password", "senha-forte-1"); await M.click("#login-form .btn-primary"); await M.waitForSelector("#app:not(.hidden)"); await M.waitForTimeout(600);
const titles = await M.$$eval(".card-item h3", (els) => els.map((e) => e.textContent));
console.log("biblioteca (membro) vê:", titles.join(" | "), "| oculto ok:", !titles.includes("Rascunho oculto") && !titles.includes("Só pra professores"));
await M.screenshot({ path: "test/shots/15-biblioteca.png" });
await M.click(".card-item:has-text('Aula 1')"); await M.waitForTimeout(500);
console.log("aula aberta:", await M.textContent(".it-title"), "| vídeo:", !!(await M.$("iframe.player")), "| arquivo:", await M.textContent(".file span"), "| markdown h2:", !!(await M.$(".md h2")));
await M.click("#item .it-head .btn:not(.small)"); await M.waitForTimeout(500);
console.log("concluído:", await M.textContent("#item .it-head .btn.on").catch(() => "não"));
await M.screenshot({ path: "test/shots/16-aula.png" });
await M.click("#item .it-head .btn.small"); await M.waitForTimeout(300);
console.log("progresso:", (await M.textContent(".prog-num")).replace(/\s+/g, " "));
await M.close();
// professor entra no painel só com conteúdos
await adminApi("POST", "/api/admin/users", { email: "prof@teste.com", name: "Prof", password: "senha-forte-1", role: "professor" });
const ctxP = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const PR = await ctxP.newPage(); await PR.goto(base + "/admin", { waitUntil: "domcontentloaded" }); await PR.waitForTimeout(500);
await PR.fill("#email", "prof@teste.com"); await PR.fill("#password", "senha-forte-1"); await PR.click("#login-form .btn-primary"); await PR.waitForTimeout(1000);
console.log("professor no painel, abas visíveis:", await PR.$$eval("#tabs button:not(.hidden)", (b) => b.map((x) => x.textContent).join(",")), "| conteúdos listados:", await PR.$$eval("#tab-content .item", (i) => i.length));
await PR.close();

// v0.15: blindagem
{
  const h = await fetch(base + "/"); const hd = (k) => h.headers.get(k);
  console.log("cabeçalhos: CSP", !!hd("content-security-policy"), "| nosniff", hd("x-content-type-options"), "| frame", hd("x-frame-options"), "| permissions", !!hd("permissions-policy"), "| x-powered-by", hd("x-powered-by"));
  console.log("violações de CSP no navegador:", csp.length, csp.slice(0, 3));
  const forged = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://malicioso.example" }, body: "{}" });
  console.log("POST de outra origem:", forged.status);
  const weak = await adminApi("POST", "/api/admin/users", { email: "fraco@teste.com", name: "F", password: "12345678", role: "member" }).catch((e) => e.message);
  console.log("senha fraca recusada:", weak);
  const bad = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  console.log("JSON quebrado:", bad.status, (await bad.json()).error);
  let last = 0; for (let i = 0; i < 14; i++) { const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "x@x.com", password: "errada123" }) }); last = r.status; }
  console.log("força bruta no login (14ª tentativa):", last);
  const html = await fetch(base + "/api/admin/uploads?name=pagina.html", { method: "POST", headers: { "content-type": "application/octet-stream", cookie }, body: "<script>alert(1)</script>" }).then((r) => r.json());
  const served = await fetch(base + html.url, { headers: { cookie } });
  console.log("html enviado serve como:", served.headers.get("content-disposition")?.split(";")[0], "| csv:", (await fetch(base + up.url, { headers: { cookie } })).headers.get("content-disposition")?.split(";")[0]);
  const trav = await fetch(base + "/files/..%2F..%2Fpackage.json", { headers: { cookie } });
  console.log("path traversal em /files:", trav.status);
  const guestPush = await fetch(base + "/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "abcdefgh-1234", subscription: { endpoint: "https://x", keys: { p256dh: "a", auth: "b" } } }) });
  console.log("push sem conta:", guestPush.status);
  const pw = await adminApi("PUT", `/api/admin/users/${users.id}`, { password: "outra-senha-9" });
  const oldSess = await fetch(base + "/api/library", { headers: { cookie: memberCookie } });
  console.log("sessão antiga após troca de senha:", oldSess.status);
}

await browser.close();
fake.close();
server.kill();
process.exit(errors.length ? 1 : 0);

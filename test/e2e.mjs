// Teste ponta a ponta: sobe o servidor, abre dois usuários, anda, checa proximidade, chat e teleport.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 3100;
const server = spawn("node", ["server/src/index.js"], { env: { ...process.env, PORT: String(PORT) }, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
const base = `http://localhost:${PORT}`;

setTimeout(() => { console.log("TIMEOUT global"); process.exit(2); }, 240000);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone", "camera"] });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone", "camera"] });
const A = await ctxA.newPage(), B = await ctxB.newPage();
const errors = [];
for (const p of [A, B]) { p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => { if (/rtc|offer|mic/i.test(m.text())) console.log("console:", m.text().slice(0, 200)); }); }

await A.goto(base + "/?name=Ana&auto=1&canvas=1", { waitUntil: "domcontentloaded" });
await B.goto(base + "/?name=Bruno&auto=1&canvas=1", { waitUntil: "domcontentloaded" });
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

// Bruno anda pra longe: sobe e cruza a porta da direita (entra no Foco)
await B.keyboard.down("ArrowUp"); await B.waitForTimeout(350); await B.keyboard.up("ArrowUp");
await B.keyboard.down("ArrowRight"); await B.waitForTimeout(2600); await B.keyboard.up("ArrowRight");
await B.waitForTimeout(500);
console.log("A voz (B longe):", await A.textContent("#hud-voice"));
console.log("B zona:", await B.textContent("#hud-zone"), "pos:", await B.evaluate(() => JSON.stringify(window.__sede.scene.pos)), "A pos:", await A.evaluate(() => JSON.stringify(window.__sede.scene.pos)));

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
console.log("tiles de câmera em A:", await A.evaluate(() => document.querySelectorAll("#screens .screen-tile.camera").length), "| em B:", await B.evaluate(() => document.querySelectorAll("#screens .screen-tile.camera").length));
await A.screenshot({ path: "test/shots/06-camera.png" });
await B.click("#btn-camera"); await A.waitForTimeout(800);
console.log("tiles após desligar:", await A.evaluate(() => document.querySelectorAll("#screens .screen-tile").length));

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

// Menção + status
await A.click(".tab[data-mode='channel']"); await B.click(".tab[data-mode='channel']"); await B.fill("#chat-input", "@Ana bora?"); await B.press("#chat-input", "Enter"); await A.waitForTimeout(400);
console.log("A viu menção:", !!(await A.$(".msg.mentions-me")));
await B.selectOption("#presence", "focus"); await B.waitForTimeout(400);
console.log("B foco na lista:", (await A.textContent("#members")).includes("foco"));
await B.selectOption("#presence", "available");
await A.click(".tab[data-mode='channel']");

// Terraço: bichos e árvores
await A.click("#zones li:nth-child(11)"); await A.waitForTimeout(2500);
console.log("npcs vistos por A:", await A.evaluate(() => window.__sede.scene.npcs.size), "| árvores:", await A.evaluate(() => Object.keys(window.__sede.scene.textures.list).filter((k) => k.startsWith("tree:")).length));
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
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);

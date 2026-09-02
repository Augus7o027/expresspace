// Teste ponta a ponta: sobe o servidor, abre dois usuários, anda, checa proximidade, chat e teleport.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 3100;
const server = spawn("node", ["server/src/index.js"], { env: { ...process.env, PORT: String(PORT) }, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
const base = `http://localhost:${PORT}`;

setTimeout(() => { console.log("TIMEOUT global"); process.exit(2); }, 240000);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
const A = await ctxA.newPage(), B = await ctxB.newPage();
const errors = [];
for (const p of [A, B]) p.on("pageerror", (e) => errors.push(e.message));

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

// Bruno anda pra longe (direita, 8 tiles) e cruza a porta
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
for (const p of [A, B]) { await p.click("#zones li:nth-child(3)"); }
await A.waitForTimeout(600);
console.log("A zona:", await A.textContent("#hud-zone"), "| voz:", await A.textContent("#hud-voice"));

// Mic liga e conecta WebRTC
await A.click("#btn-mic"); await B.click("#btn-mic");
await A.waitForTimeout(2500);
console.log("A voz pós-mic:", await A.textContent("#hud-voice"));

// Chat local da sala + balão
await B.click('.tab[data-mode="zone"]');
await B.fill("#chat-input", "bora começar?"); await B.press("#chat-input", "Enter");
await A.click('.tab[data-mode="zone"]'); await A.waitForTimeout(500);
console.log("A viu chat da sala:", (await A.textContent("#messages")).includes("bora começar?"));
await A.screenshot({ path: "test/shots/02-sala-a.png" });

// Sala silenciosa
await A.click("#zones li:nth-child(7)"); await A.waitForTimeout(500);
console.log("A no foco:", await A.textContent("#hud-zone"), "|", await A.textContent("#hud-voice"));
await A.screenshot({ path: "test/shots/03-foco.png" });

// Canal de voz Discord
await B.click("#voice-channels li:nth-child(1)"); await A.click("#voice-channels li:nth-child(1)");
await A.waitForTimeout(2000);
console.log("A canal voz:", await A.textContent("#hud-voice"));
await A.screenshot({ path: "test/shots/04-canal-voz.png" });

console.log("erros de página:", errors);
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);

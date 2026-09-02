import { io } from "socket.io-client";
import { createGame } from "./game.js";
import { Voice } from "./voice.js";

const $ = (s) => document.querySelector(s);
// crypto.randomUUID só existe em página segura (https ou localhost). Fallback pra http puro.
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const COLORS = ["#ffffff", "#c9c9c9", "#9a9a9a", "#e8e0d0", "#d6d6d6", "#b5b5b5"];

// ---------- login ----------
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const saved = safe(() => JSON.parse(localStorage.getItem("sede:me") || "{}"), {});
let pickedColor = saved.color || COLORS[0];
const sw = $("#swatches");
for (const c of COLORS) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "swatch" + (c === pickedColor ? " active" : ""); b.style.background = c;
  b.onclick = () => { pickedColor = c; sw.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("active", x === b)); };
  sw.appendChild(b);
}
if (saved.name) $("#name").value = saved.name;
const params = new URLSearchParams(location.search);
if (params.get("name")) $("#name").value = params.get("name");

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#name").value.trim();
  if (!name) return;
  // id por aba, pra poder testar com várias abas no mesmo navegador
  let userId = safe(() => sessionStorage.getItem("sede:uid"), null);
  if (!userId) { userId = uuid(); safe(() => sessionStorage.setItem("sede:uid", userId)); }
  safe(() => localStorage.setItem("sede:me", JSON.stringify({ name, color: pickedColor })));
  start({ name, color: pickedColor, userId });
});
if (params.get("name") && params.get("auto")) $("#login-form").requestSubmit();

// ---------- app ----------
function start(creds) {
  const net = io({ transports: ["websocket"] });
  net.emit("join", creds, (res) => {
    if (!res) return;
    boot(net, res);
  });
  net.on("kicked", (msg) => { toast(msg); setTimeout(() => location.reload(), 1500); });
}

function boot(net, { user, map, channels, players }) {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#me-name").textContent = user.name;
  $("#me-dot").style.background = user.color;
  document.title = `Sede · ${user.name}`;

  const state = {
    me: user, map, channels, players, zone: null,
    chatMode: "channel", channelId: "geral", voiceChannel: null, group: null,
  };

  // --- jogo ---
  const { scene } = createGame("game", {
    map, me: user, net,
    onZoneChange: (z) => { state.zone = z; renderZone(); if (state.chatMode === "zone") loadHistory(); },
  });
  let membersKey = "";
  net.on("state", (ps) => {
    state.players = ps;
    if (scene.player) scene.applyState(ps);
    // só re-renderiza a sidebar quando algo relevante muda (não a cada frame de posição)
    const key = ps.map((p) => [p.id, p.name, p.color, p.zone, p.voiceChannel, p.muted].join("|")).join(";");
    if (key !== membersKey) { membersKey = key; renderMembers(); }
  });
  net.on("bubble", ({ userId, text }) => scene.player && scene.showBubble(userId, text));

  // --- voz ---
  const voice = new Voice(net, user.id, { onChange: renderVoice });
  net.on("voice:group", (g) => {
    state.group = g;
    voice.setCanSpeak(g.canSpeak);
    voice.sync(g.peers || []);
    renderVoice();
  });
  const micBtn = $("#btn-mic");
  micBtn.classList.add("muted");
  async function toggleMic() {
    if (!voice.stream) {
      const ok = await voice.enableMic();
      if (!ok) { toast("Sem acesso ao microfone."); return; }
      voice.setMuted(false);
    } else voice.setMuted(!voice.muted);
    micBtn.classList.toggle("muted", voice.muted);
    scene.setMuted(voice.muted);
    net.emit("profile", { muted: voice.muted });
  }
  micBtn.onclick = toggleMic;

  // --- chat ---
  const msgs = $("#messages");
  const input = $("#chat-input");
  function currentChannel() { return state.chatMode === "zone" ? (state.zone ? "zone:" + state.zone.id : null) : state.channelId; }
  function loadHistory() {
    const ch = currentChannel();
    msgs.innerHTML = "";
    if (!ch) { addSystem("Entre numa sala para ver o chat dela."); return; }
    net.emit("chat:history", { channelId: ch }, (rows) => { rows.forEach(addMsg); scrollDown(); });
    renderChatHeader();
  }
  function addMsg(m) {
    if (m.channel_id !== currentChannel()) return;
    const el = document.createElement("div");
    el.className = "msg";
    const t = new Date(m.created_at);
    el.innerHTML = `<span class="dot"></span><div><div class="who"><b></b><time>${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}</time></div><div class="body"></div></div>`;
    el.querySelector(".dot").style.background = m.user_color;
    el.querySelector("b").textContent = m.user_name;
    el.querySelector(".body").textContent = m.body;
    msgs.appendChild(el);
  }
  function addSystem(text) {
    const el = document.createElement("div"); el.className = "msg system"; el.textContent = text; msgs.appendChild(el); scrollDown();
  }
  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }
  net.on("chat:message", (m) => { addMsg(m); scrollDown(); });
  net.on("system", ({ text }) => addSystem(text));

  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    const ch = currentChannel();
    if (!ch) return;
    net.emit("chat:send", { channelId: ch, body });
    if (state.chatMode === "zone") net.emit("bubble", { text: body });
    input.value = "";
  });
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    state.chatMode = b.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    loadHistory();
  });

  // Enter fora do input: foca o chat. Esc: volta pro mapa.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape") input.blur();
    if (e.key.toLowerCase() === "m" && document.activeElement !== input) toggleMic();
  });

  // --- sidebar ---
  function renderChannels() {
    const tl = $("#text-channels"), vl = $("#voice-channels"), zl = $("#zones");
    tl.innerHTML = ""; vl.innerHTML = ""; zl.innerHTML = "";
    for (const c of channels.filter((c) => c.kind === "text")) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="hash">#</span><span></span>`;
      li.querySelector("span:last-child").textContent = c.name;
      li.classList.toggle("active", state.chatMode === "channel" && state.channelId === c.id);
      li.onclick = () => { state.channelId = c.id; state.chatMode = "channel"; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.mode === "channel")); renderChannels(); loadHistory(); };
      tl.appendChild(li);
    }
    for (const c of channels.filter((c) => c.kind === "voice")) {
      const li = document.createElement("li");
      const members = state.players.filter((p) => p.voiceChannel === c.id);
      li.className = "voice" + (state.voiceChannel === c.id ? " joined" : "");
      li.innerHTML = `<span class="hash">●</span><span></span><span class="count"></span>`;
      li.querySelector("span:nth-child(2)").textContent = c.name;
      li.querySelector(".count").textContent = members.length ? members.length : "";
      li.onclick = async () => {
        const next = state.voiceChannel === c.id ? null : c.id;
        state.voiceChannel = next;
        if (next && !voice.stream) await toggleMic();
        net.emit("voice:channel", { channelId: next });
        renderChannels(); renderVoice();
      };
      vl.appendChild(li);
      if (members.length) {
        const vm = document.createElement("div"); vm.className = "voice-members";
        vm.textContent = members.map((m) => m.name).join(" · ");
        vl.appendChild(vm);
      }
    }
    for (const z of map.zones) {
      const li = document.createElement("li");
      const n = state.players.filter((p) => p.zone === z.id).length;
      li.innerHTML = `<span class="hash">▢</span><span></span><span class="count"></span>`;
      li.querySelector("span:nth-child(2)").textContent = z.name;
      li.querySelector(".count").textContent = n || "";
      li.classList.toggle("active", state.zone?.id === z.id);
      li.onclick = () => scene.teleportTo(z);
      zl.appendChild(li);
    }
  }
  function renderMembers() {
    const ul = $("#members");
    ul.innerHTML = "";
    $("#online-count").textContent = `${state.players.length} online`;
    for (const p of state.players) {
      const li = document.createElement("li");
      const where = p.voiceChannel ? "voz" : (map.zones.find((z) => z.id === p.zone)?.name || "…");
      li.innerHTML = `<span class="avatar-dot"></span><span></span><span class="where"></span>`;
      li.querySelector(".avatar-dot").style.background = p.color;
      li.querySelector("span:nth-child(2)").textContent = p.name + (p.id === user.id ? " (você)" : "");
      li.querySelector(".where").textContent = where;
      ul.appendChild(li);
    }
    renderChannels();
  }
  function renderZone() {
    const name = state.zone ? state.zone.name : "Corredor";
    $("#hud-zone").textContent = name;
    $("#me-where").textContent = name;
    renderChannels();
  }
  function renderChatHeader() {
    if (state.chatMode === "zone") { $("#chat-kind").textContent = "chat da sala"; $("#chat-title").textContent = state.zone ? state.zone.name : "—"; }
    else { $("#chat-kind").textContent = "canal"; $("#chat-title").textContent = "#" + (channels.find((c) => c.id === state.channelId)?.name || state.channelId); }
  }
  function renderVoice() {
    const g = state.group;
    const el = $("#hud-voice");
    if (!g || !g.id) el.textContent = g && g.canSpeak === false ? `${g.label}: sem voz` : "ninguém por perto";
    else {
      const n = (g.peers || []).length;
      const who = g.label === "canal" ? "no canal" : g.label === "por perto" ? "por perto" : `em ${g.label}`;
      el.textContent = `${n} ${n === 1 ? "pessoa" : "pessoas"} ${who}` + (g.canSpeak ? "" : " · só ouvindo") + (voice.stream ? ` · ${voice.connectedCount()}/${n} conectados` : " · mic off");
    }
    micBtn.classList.toggle("live", !!(g && g.id && voice.stream && !voice.muted));
    micBtn.title = voice.muted ? "Ligar microfone (M)" : "Silenciar (M)";
  }

  renderMembers(); renderZone(); loadHistory(); renderVoice();
  window.__sede = { scene, state, net };
}

function toast(text) {
  const t = $("#toast"); t.textContent = text; t.classList.remove("hidden");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add("hidden"), 3000);
}

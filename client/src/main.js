import { io } from "socket.io-client";
import { createGame } from "./game.js";
import { Voice } from "./voice.js";
import { sounds } from "./sounds.js";

const $ = (s) => document.querySelector(s);
const COLORS = ["#ffffff", "#c9c9c9", "#9a9a9a", "#e8e0d0", "#d6d6d6", "#b5b5b5"];
const EMOJIS = ["😀", "😂", "😍", "🤔", "😎", "🙌", "👏", "🔥", "✅", "❌", "👀", "💡", "🚀", "☕", "🎯", "💪", "🙏", "👍", "👎", "❤️", "🎉", "😅", "🤝", "📌"];
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

// crypto.randomUUID só existe em página segura (https ou localhost). Fallback pra http puro.
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- login ----------
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
  let userId = safe(() => sessionStorage.getItem("sede:uid"), null);
  if (!userId) { userId = uuid(); safe(() => sessionStorage.setItem("sede:uid", userId)); }
  safe(() => localStorage.setItem("sede:me", JSON.stringify({ name, color: pickedColor })));
  sounds.unlock();
  start({ name, color: pickedColor, userId });
});
if (params.get("name") && params.get("auto")) $("#login-form").requestSubmit();

// ---------- app ----------
function start(creds) {
  const net = io({ transports: ["websocket"], reconnectionDelay: 800, reconnectionDelayMax: 5000 });
  let app = null;
  net.on("connect", () => {
    if (!app) {
      net.emit("join", creds, (res) => { if (res) app = boot(net, res, creds); });
    } else {
      // reconectou: entra de novo no mesmo lugar, sem recarregar
      net.emit("join", { ...creds, pos: app.pos() }, (res) => { if (res) app.rejoined(res); });
    }
  });
  net.on("disconnect", () => { if (app) app.disconnected(); });
  net.on("kicked", (msg) => { toast(msg); setTimeout(() => location.reload(), 1500); });
}

function boot(net, { user, map, channels, players }, creds) {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#me-name").textContent = user.name;
  $("#me-dot").style.background = user.color;
  document.title = `ExpresSpace · ${user.name}`;

  const state = {
    me: user, map, channels, players, zone: null,
    chatMode: "channel", channelId: "geral", voiceChannel: null, group: null,
    presence: "available", nearObject: null, screens: new Map(), unread: {},
  };

  // --- jogo ---
  const { scene } = createGame("game", {
    map, me: user, net,
    onZoneChange: (z) => { state.zone = z; renderZone(); if (state.chatMode === "zone") loadHistory(); },
    onObjectNear: (o) => { state.nearObject = o; renderPrompt(); },
  });
  let membersKey = "";
  net.on("state", (ps) => {
    state.players = ps;
    if (scene.player) scene.applyState(ps);
    const key = ps.map((p) => [p.id, p.name, p.color, p.zone, p.voiceChannel, p.muted, p.presence, p.speaking].join("|")).join(";");
    if (key !== membersKey) { membersKey = key; renderMembers(); }
  });
  net.on("bubble", ({ userId, text }) => scene.player && scene.showBubble(userId, text));

  // --- voz e tela ---
  const voice = new Voice(net, user.id, {
    onChange: renderVoice,
    onSpeaking: (who, on) => {
      if (who === "me") { scene.setMySpeaking(on); net.emit("speaking", on); }
    },
    onScreen: (who, stream) => { if (stream) state.screens.set(who, stream); else state.screens.delete(who); renderScreens(); },
  });
  let lastPeerCount = 0;
  net.on("voice:group", (g) => {
    state.group = g;
    voice.setCanSpeak(g.canSpeak);
    voice.sync(g.peers || []);
    const n = (g.peers || []).length;
    if (n > lastPeerCount) sounds.nearby(); else if (n < lastPeerCount) sounds.leave();
    lastPeerCount = n;
    if (!g.id && voice.screen) voice.stopScreen();
    renderVoice();
  });
  const micBtn = $("#btn-mic"), screenBtn = $("#btn-screen"), soundBtn = $("#btn-sound");
  micBtn.classList.add("muted");
  async function toggleMic() {
    if (!voice.stream) {
      const ok = await voice.enableMic();
      if (!ok) { toast("Sem acesso ao microfone. Confere a permissão do navegador."); return; }
      voice.setMuted(false);
    } else voice.setMuted(!voice.muted);
    micBtn.classList.toggle("muted", voice.muted);
    scene.setMuted(voice.muted);
    net.emit("profile", { muted: voice.muted });
  }
  micBtn.onclick = toggleMic;
  screenBtn.onclick = async () => {
    if (voice.screen) { voice.stopScreen(); return; }
    if (!state.group?.id) { toast("Entre numa sala de reunião ou canal de voz para compartilhar a tela."); return; }
    if (!(await voice.startScreen())) toast("Não foi possível compartilhar a tela.");
  };
  sounds.setEnabled(safe(() => localStorage.getItem("sede:sound") !== "off", true));
  soundBtn.classList.toggle("off", !sounds.enabled);
  soundBtn.onclick = () => {
    sounds.setEnabled(!sounds.enabled);
    soundBtn.classList.toggle("off", !sounds.enabled);
    safe(() => localStorage.setItem("sede:sound", sounds.enabled ? "on" : "off"));
  };

  // --- presença ---
  const presenceSel = $("#presence");
  presenceSel.onchange = () => {
    state.presence = presenceSel.value;
    scene.setMyPresence(state.presence);
    net.emit("profile", { presence: state.presence });
    renderVoice();
  };
  const statusInput = $("#status-text");
  statusInput.onchange = () => net.emit("profile", { status: statusInput.value.trim() });

  // --- chat ---
  const msgs = $("#messages");
  const input = $("#chat-input");
  function currentChannel() { return state.chatMode === "zone" ? (state.zone ? "zone:" + state.zone.id : null) : state.channelId; }
  function loadHistory() {
    const ch = currentChannel();
    msgs.innerHTML = "";
    renderChatHeader();
    if (!ch) { addSystem("Entre numa sala para ver o chat dela."); return; }
    state.unread[ch] = 0; renderChannels();
    net.emit("chat:history", { channelId: ch }, (rows) => { rows.forEach(addMsg); scrollDown(); });
  }
  const mentionRe = /@([\p{L}\p{N}_.\-]+)/gu;
  function renderBody(el, body) {
    el.textContent = "";
    let last = 0;
    for (const m of body.matchAll(mentionRe)) {
      el.append(body.slice(last, m.index));
      const s = document.createElement("span"); s.className = "mention"; s.textContent = m[0]; el.append(s);
      last = m.index + m[0].length;
    }
    el.append(body.slice(last));
  }
  function mentionsMe(body) {
    const mine = user.name.toLowerCase().replace(/\s+/g, "");
    return [...body.matchAll(mentionRe)].some((m) => { const n = m[1].toLowerCase(); return n === mine || n === "todos" || n === "all"; });
  }
  function addMsg(m) {
    if (m.channel_id !== currentChannel()) return;
    const el = document.createElement("div");
    el.className = "msg" + (m.user_id !== user.id && mentionsMe(m.body) ? " mentions-me" : "");
    const t = new Date(m.created_at);
    el.innerHTML = `<span class="dot"></span><div><div class="who"><b></b><time>${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}</time></div><div class="body"></div></div>`;
    el.querySelector(".dot").style.background = m.user_color;
    el.querySelector("b").textContent = m.user_name;
    renderBody(el.querySelector(".body"), m.body);
    msgs.appendChild(el);
  }
  function addSystem(text) {
    const el = document.createElement("div"); el.className = "msg system"; el.textContent = text; msgs.appendChild(el); scrollDown();
  }
  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }
  net.on("chat:message", (m) => {
    if (m.channel_id === currentChannel()) { addMsg(m); scrollDown(); }
    else { state.unread[m.channel_id] = (state.unread[m.channel_id] || 0) + 1; renderChannels(); }
    if (m.user_id !== user.id) { if (mentionsMe(m.body)) { sounds.mention(); toast(`${m.user_name} mencionou você`); } else sounds.message(); }
  });
  net.on("system", ({ text }) => { addSystem(text); if (text.endsWith("entrou.")) sounds.join(); });

  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    const ch = currentChannel();
    if (!ch) return;
    net.emit("chat:send", { channelId: ch, body });
    if (state.chatMode === "zone") net.emit("bubble", { text: body });
    input.value = ""; hideMentions();
  });
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    state.chatMode = b.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    loadHistory();
  });

  // menções: @ abre lista de quem está online
  const mentionList = $("#mention-list");
  let mentionIdx = 0;
  function mentionQuery() {
    const v = input.value.slice(0, input.selectionStart);
    const m = v.match(/(?:^|\s)@([\p{L}\p{N}_.\-]*)$/u);
    return m ? m[1] : null;
  }
  function showMentions() {
    const q = mentionQuery();
    if (q === null) return hideMentions();
    const names = ["todos", ...state.players.filter((p) => p.id !== user.id).map((p) => p.name)];
    const opts = names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
    if (!opts.length) return hideMentions();
    mentionIdx = Math.min(mentionIdx, opts.length - 1);
    mentionList.innerHTML = "";
    opts.forEach((n, i) => {
      const d = document.createElement("div"); d.textContent = "@" + n; d.className = i === mentionIdx ? "active" : "";
      d.onmousedown = (e) => { e.preventDefault(); pickMention(n); };
      mentionList.appendChild(d);
    });
    mentionList.classList.remove("hidden");
  }
  function hideMentions() { mentionList.classList.add("hidden"); }
  function pickMention(n) {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/@[\p{L}\p{N}_.\-]*$/u, "@" + n.replace(/\s+/g, "") + " ");
    input.value = before + input.value.slice(pos);
    input.setSelectionRange(before.length, before.length);
    hideMentions(); input.focus();
  }
  input.addEventListener("input", () => { mentionIdx = 0; showMentions(); });
  input.addEventListener("keydown", (e) => {
    if (mentionList.classList.contains("hidden")) return;
    const items = [...mentionList.children];
    if (e.key === "ArrowDown") { e.preventDefault(); mentionIdx = (mentionIdx + 1) % items.length; showMentions(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mentionIdx = (mentionIdx - 1 + items.length) % items.length; showMentions(); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(items[mentionIdx].textContent.slice(1)); }
    else if (e.key === "Escape") hideMentions();
  });
  input.addEventListener("blur", () => setTimeout(hideMentions, 150));

  // emojis
  const picker = $("#emoji-picker");
  EMOJIS.forEach((em) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = em;
    b.onclick = () => { const p = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, p) + em + input.value.slice(p); input.focus(); input.setSelectionRange(p + em.length, p + em.length); picker.classList.add("hidden"); };
    picker.appendChild(b);
  });
  $("#btn-emoji").onclick = () => picker.classList.toggle("hidden");

  // --- objetos interativos ---
  const modal = $("#modal"), modalBody = $("#modal-body");
  let openBoardId = null;
  function openObject(o) {
    modalBody.innerHTML = "";
    $("#modal-title").textContent = o.label;
    $("#modal-kind").textContent = { board: "quadro compartilhado", link: "link", video: "vídeo", info: "mural" }[o.kind];
    if (o.kind === "board") {
      const ta = document.createElement("textarea"); ta.placeholder = "Escreva aqui. Todo mundo vê.";
      const foot = document.createElement("div"); foot.className = "modal-foot"; foot.textContent = "salva sozinho · visível para todos";
      const wrap = document.createElement("div"); wrap.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0";
      wrap.append(ta, foot); modalBody.append(wrap);
      openBoardId = o.id;
      net.emit("board:get", { id: o.id }, (content) => { ta.value = content || ""; });
      let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(() => net.emit("board:set", { id: o.id, content: ta.value }), 300); };
      setTimeout(() => ta.focus(), 50);
    } else if (o.kind === "info") {
      const d = document.createElement("div"); d.className = "info"; d.textContent = o.text || ""; modalBody.append(d);
    } else {
      const f = document.createElement("iframe"); f.src = o.url; f.allow = "autoplay; fullscreen; clipboard-write"; f.referrerPolicy = "no-referrer";
      modalBody.append(f);
      const foot = document.createElement("div"); foot.className = "modal-foot";
      foot.innerHTML = `<a href="${o.url}" target="_blank" rel="noopener" style="color:inherit">abrir em nova aba ↗</a>`;
      modalBody.parentElement.append(foot);
    }
    modal.classList.remove("hidden");
    scene.frozen = true;
  }
  function closeModal() {
    modal.classList.add("hidden"); scene.frozen = false; openBoardId = null;
    modal.querySelectorAll(".modal-card > .modal-foot").forEach((x) => x.remove());
    modalBody.innerHTML = "";
  }
  $("#modal-close").onclick = closeModal;
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  net.on("board:update", ({ id, content }) => {
    if (id !== openBoardId) return;
    const ta = modalBody.querySelector("textarea");
    if (ta && document.activeElement !== ta) ta.value = content;
  });

  // --- teclado global ---
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (e.key === "Escape") { if (!modal.classList.contains("hidden")) closeModal(); else { input.blur(); picker.classList.add("hidden"); } return; }
    if (typing) return;
    if (e.key === "Enter") { e.preventDefault(); input.focus(); }
    else if (e.key.toLowerCase() === "m") toggleMic();
    else if (e.key.toLowerCase() === "e" && state.nearObject && modal.classList.contains("hidden")) openObject(state.nearObject);
  });

  // --- sidebar ---
  function renderChannels() {
    const tl = $("#text-channels"), vl = $("#voice-channels"), zl = $("#zones");
    tl.innerHTML = ""; vl.innerHTML = ""; zl.innerHTML = "";
    for (const c of channels.filter((c) => c.kind === "text")) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="hash">#</span><span></span><span class="count"></span>`;
      li.querySelector("span:nth-child(2)").textContent = c.name;
      const u = state.unread[c.id] || 0; li.querySelector(".count").textContent = u ? `${u} nova${u > 1 ? "s" : ""}` : "";
      li.classList.toggle("active", state.chatMode === "channel" && state.channelId === c.id);
      li.onclick = () => { state.channelId = c.id; state.chatMode = "channel"; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.mode === "channel")); loadHistory(); };
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
    const label = { available: "", busy: "ocupado", focus: "foco" };
    for (const p of state.players) {
      const li = document.createElement("li");
      li.className = p.speaking && !p.muted ? "speaking" : "";
      const where = p.voiceChannel ? "voz" : (map.zones.find((z) => z.id === p.zone)?.name || "…");
      li.innerHTML = `<span class="avatar-dot"></span><span class="pdot"></span><span></span><span class="where"></span>`;
      li.querySelector(".avatar-dot").style.background = p.color;
      li.querySelector(".pdot").classList.add(p.presence || "available");
      li.querySelector("span:nth-child(3)").textContent = p.name + (p.id === user.id ? " (você)" : "");
      li.querySelector(".where").textContent = label[p.presence] || where;
      li.title = p.status || "";
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
  function renderPrompt() {
    const el = $("#hud-prompt");
    if (!state.nearObject) { el.classList.add("hidden"); return; }
    const verb = { board: "Abrir quadro", link: "Abrir", video: "Assistir", info: "Ler" }[state.nearObject.kind];
    el.querySelector("span").textContent = `${verb} · ${state.nearObject.label}`;
    el.classList.remove("hidden");
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
    screenBtn.classList.toggle("live", !!voice.screen);
    screenBtn.classList.toggle("off", !g?.id && !voice.screen);
  }
  function renderScreens() {
    const wrap = $("#screens");
    wrap.innerHTML = "";
    if (!state.screens.size) { wrap.classList.add("hidden"); return; }
    for (const [who, stream] of state.screens) {
      const tile = document.createElement("div"); tile.className = "screen-tile";
      const v = document.createElement("video"); v.autoplay = true; v.playsInline = true; v.muted = true; v.srcObject = stream;
      const name = who === "me" ? "sua tela" : (state.players.find((p) => p.id === who)?.name || "tela");
      const tag = document.createElement("span"); tag.className = "who"; tag.textContent = name;
      tile.append(v, tag);
      tile.onclick = () => tile.classList.toggle("big");
      wrap.appendChild(tile);
    }
    wrap.classList.remove("hidden");
  }

  renderMembers(); renderZone(); loadHistory(); renderVoice();
  window.__sede = { scene, state, net, voice };

  return {
    pos: () => ({ x: scene.pos.x, y: scene.pos.y }),
    disconnected: () => { toast("Conexão caiu. Reconectando…"); voice.closeAll(); },
    rejoined: (res) => {
      toast("Reconectado.");
      state.players = res.players;
      net.emit("profile", { presence: state.presence, muted: voice.muted, status: statusInput.value.trim() });
      if (state.voiceChannel) net.emit("voice:channel", { channelId: state.voiceChannel });
      renderMembers();
    },
  };
}

function toast(text) {
  const t = $("#toast"); t.textContent = text; t.classList.remove("hidden");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add("hidden"), 3000);
}

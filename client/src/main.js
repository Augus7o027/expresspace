import { io } from "socket.io-client";
import { Voice } from "./voice.js";
import { VoiceLive } from "./voice-live.js";
import { Spatial } from "./spatial.js";
import { Speaker } from "./speaker.js";
import { Tiles } from "./tiles.js";
import { isMobile, isIOS, mountJoystick, drawers } from "./mobile.js";
import { sounds } from "./sounds.js";
import { EMOJI, EMOJI_ORDER, renderEmoji, ICON, icon } from "./icons.js";
import { mountAvatarEditor } from "./avatar-editor.js";
import { startTour } from "./tour.js";
import { openSettings, loadDevices } from "./settings.js";
import { pushClient } from "./push.js";
import { openEditor } from "./editor.js";
import { SHIRTS, DEFAULT_AVATAR, normalizeAvatar, loadBase } from "./sprites.js";

const $ = (s) => document.querySelector(s);
const COLORS = ["#ffffff", "#c9c9c9", "#9a9a9a", "#e8e0d0", "#d6d6d6", "#b5b5b5"];
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

// crypto.randomUUID só existe em página segura (https ou localhost). Fallback pra http puro.
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Phaser é o grosso do bundle: só carrega quando precisa (e começa a baixar em segundo plano na tela de login)
let gameMod = null;
const loadGame = () => (gameMod ??= import("./game.js"));
if ("requestIdleCallback" in window) requestIdleCallback(() => loadGame(), { timeout: 4000 }); else setTimeout(loadGame, 1500);
const loadingEl = $("#loading");
const showLoading = (text, pct) => { loadingEl.classList.remove("hidden"); if (text) $("#loading-text").textContent = text; if (pct !== undefined) $("#loading-bar").style.width = Math.round(pct * 100) + "%"; };
const hideLoading = () => loadingEl.classList.add("hidden");

// ---------- login ----------
const saved = safe(() => JSON.parse(localStorage.getItem("sede:me") || "{}"), {});
let avatar = normalizeAvatar(saved.avatar || DEFAULT_AVATAR);
await loadBase(); // sheets do personagem base
const params = new URLSearchParams(location.search);
const apiJson = async (method, url, body) => { const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
const config = await apiJson("GET", "/api/auth/config").catch(() => ({ allowGuests: true }));
let session = (await apiJson("GET", "/api/auth/me").catch(() => ({}))).user || null;

// aviso guardado antes de um reload (expulso/banido)
{ const n = safe(() => sessionStorage.getItem("sede:notice"), null); if (n) { safe(() => sessionStorage.removeItem("sede:notice")); const el = $("#login-notice"); el.textContent = n; el.classList.remove("hidden"); } }

// abas: conta x visitante
const showLogin = (which) => {
  document.querySelectorAll(".login-tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.login === which));
  $("#account-form").classList.toggle("hidden", which !== "account");
  $("#login-form").classList.toggle("hidden", which !== "guest");
};
document.querySelectorAll(".login-tabs .tab").forEach((b) => b.onclick = () => showLogin(b.dataset.login));
if (!config.allowGuests) $("#tab-guest").classList.add("hidden");

// ---- checagem de áudio no login: permissão + medidor de nível ----
(async () => {
  const st = $("#ac-status"), btn = $("#ac-btn"), lvl = $("#ac-level"), help = $("#ac-help");
  const setStatus = (text, cls) => { st.textContent = text; st.className = "mono " + (cls || ""); };
  const explain = () => {
    const ua = navigator.userAgent, ios = /iPhone|iPad/.test(ua), safari = /Safari/.test(ua) && !/Chrome/.test(ua);
    help.textContent = ios ? "No iPhone: Ajustes › Safari › Microfone › Permitir, ou toque no ícone \"AA\" na barra de endereço › Ajustes do site." :
      safari ? "No Safari: menu Safari › Ajustes para este site › Microfone › Permitir." :
      "Clique no cadeado ao lado do endereço › Permissões do site › Microfone › Permitir, e recarregue.";
    help.classList.remove("hidden");
  };
  try {
    const perm = await navigator.permissions?.query({ name: "microphone" });
    if (perm?.state === "granted") setStatus("permitido · toque em testar pra ver o nível", "ok");
    else if (perm?.state === "denied") { setStatus("bloqueado no navegador", "bad"); explain(); }
    perm?.addEventListener?.("change", () => { if (perm.state === "denied") { setStatus("bloqueado no navegador", "bad"); explain(); } });
  } catch {}
  if (!navigator.mediaDevices?.getUserMedia) { setStatus("sem suporte (precisa de https)", "bad"); btn.disabled = true; return; }
  btn.onclick = async () => {
    btn.disabled = true; setStatus("pedindo permissão…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount); let peak = 0; const t0 = performance.now();
      setStatus("fale alguma coisa…", "ok"); help.classList.add("hidden");
      const tick = () => {
        an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
        const rms = Math.sqrt(sum / buf.length); peak = Math.max(peak, rms); lvl.style.width = Math.min(100, rms * 600) + "%";
        if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
        else { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); lvl.style.width = "0";
          setStatus(peak > 0.01 ? "microfone ok · você entra falando" : "permitido, mas não captou som — confira o microfone escolhido", peak > 0.01 ? "ok" : "");
          safe(() => localStorage.setItem("sede:mic", "on")); btn.disabled = false; btn.textContent = "Testar de novo"; }
      };
      tick();
    } catch (e) {
      btn.disabled = false;
      if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) { setStatus("permissão negada", "bad"); explain(); }
      else if (e && e.name === "NotFoundError") setStatus("nenhum microfone encontrado", "bad");
      else setStatus("erro: " + (e?.message || e), "bad");
    }
  };
})();

// conta
const isPremium = (u) => !!u && (u.premium || u.role === "admin" || u.role === "professor");
const accountEditor = mountAvatarEditor($("#avatar-editor-login"), session?.avatar || avatar, (a) => { avatar = a; }, { premium: isPremium(session) });
const paintSession = () => {
  $("#session-box").classList.toggle("hidden", !session);
  $("#account-fields").classList.toggle("hidden", !!session);
  if (session) $("#session-name").textContent = `${session.name} (${session.role})`;
};
paintSession();
$("#session-logout").onclick = async () => { await apiJson("POST", "/api/auth/logout"); session = null; paintSession(); };
$("#account-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#account-error"); err.classList.add("hidden");
  try {
    if (!session) {
      const email = $("#email").value.trim(), password = $("#password").value;
      if (!email || !password) throw new Error("preencha e-mail e senha");
      session = (await apiJson("POST", "/api/auth/login", { email, password })).user;
      if (isPremium(session)) mountAvatarEditor($("#avatar-editor-login"), avatar, (a) => { avatar = a; }, { premium: true });
    }
    avatar = accountEditor.get();
    safe(() => localStorage.setItem("sede:me", JSON.stringify({ name: session.name, avatar })));
    sounds.unlock();
    start({ avatar, color: SHIRTS[avatar.shirt] });
  } catch (ex) { err.textContent = ex.message; err.classList.remove("hidden"); }
});

// visitante
const guestEditor = mountAvatarEditor($("#avatar-editor-guest"), avatar, (a) => { avatar = a; });
if (saved.name) $("#name").value = saved.name;
if (params.get("name")) { $("#name").value = params.get("name"); showLogin("guest"); }
else if (!session && config.allowGuests && !saved.email) showLogin("guest");
$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#name").value.trim();
  if (!name) return;
  let userId = safe(() => sessionStorage.getItem("sede:uid"), null);
  if (!userId) { userId = uuid(); safe(() => sessionStorage.setItem("sede:uid", userId)); }
  avatar = guestEditor.get();
  safe(() => localStorage.setItem("sede:me", JSON.stringify({ name, avatar })));
  sounds.unlock();
  start({ name, color: SHIRTS[avatar.shirt], avatar, userId });
});
if (params.get("name") && params.get("auto")) $("#login-form").requestSubmit();

// ---------- app ----------
function start(creds) {
  showLoading("conectando…", 0.05);
  const net = io({ transports: ["websocket"], reconnectionDelay: 800, reconnectionDelayMax: 5000 });
  let app = null, booting = false;
  const gameReady = loadGame(); // Phaser precisa estar em mãos antes do join: o servidor manda o grupo de voz logo depois do ack
  net.on("connect", async () => {
    if (!app) {
      if (booting) return;
      await gameReady;
      net.emit("join", creds, (res) => {
        if (res?.error) { hideLoading(); toast(res.error); net.disconnect(); return; }
        if (res) { booting = true; showLoading("carregando o espaço…", 0.15); boot(net, res, creds).then((a) => { app = a; }).catch((e) => { console.error(e); showLoading("falha ao carregar: " + e.message); }); }
      });
    } else {
      // reconectou: entra de novo no mesmo lugar, sem recarregar
      net.emit("join", { ...creds, pos: app.pos() }, (res) => { if (res) app.rejoined(res); });
    }
  });
  net.on("disconnect", () => { if (app) app.disconnected(); });
  net.on("kicked", (msg) => { if (app) app.kicked = true; toast(msg); safe(() => sessionStorage.setItem("sede:notice", msg)); setTimeout(() => location.reload(), 1800); });
}

async function boot(net, { user, map, channels, players, locked = [], npcs = [], communityName, iceServers, speakers = {}, events = [], pushKey, mutedUntil = 0, live = null, recordings = [], serverTime }, creds) {
  const { createGame } = await loadGame();
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#me-name").textContent = user.name;
  $("#me-dot").style.background = user.color;
  for (const [id, name] of [["#btn-mic", "micOff"], ["#btn-camera", "cameraOff"], ["#btn-screen", "screen"], ["#btn-sound", "bell"], ["#btn-avatar", "edit"], ["#btn-emoji", "smile"], ["#btn-send", "send"], ["#modal-close", "close"]]) $(id).innerHTML = ICON[name];
  document.title = `${communityName || "ExpresSpace"} · ${user.name}`;
  if (communityName) document.querySelector(".brand-title .script").textContent = communityName;
  for (const id of ["#agent-close", "#agent-send"]) $(id).innerHTML = ICON[id === "#agent-send" ? "send" : "close"];

  const state = {
    me: user, map, channels, players, zone: null,
    chatMode: "channel", channelId: "geral", voiceChannel: null, group: null,
    presence: "available", nearObject: null, videos: new Map(), unread: {},
    speakers, // id da caixa de som -> { videoId, title, startedAt, ... } (o que está tocando em cada sala)
  };
  const isStaff = user.role === "admin" || user.role === "professor";

  // --- jogo ---
  const { scene } = createGame("game", {
    map, me: user, net, startZoom: isMobile() && innerWidth < 700 ? 1 : undefined,
    onProgress: (v) => showLoading("carregando o mapa…", 0.15 + v * 0.8),
    onReady: () => { showLoading("pronto", 1); setTimeout(hideLoading, 250); onSceneReady(); },
    onZoneChange: (z) => { state.zone = z; renderZone(); refreshSpeaker(); if (state.chatMode === "zone") loadHistory(); },
    onObjectNear: (o) => { state.nearObject = o; renderPrompt(); },
    // sentou numa estação de trabalho: entra em foco; levantou: volta ao que era
    onWork: (on) => { if (on) { if (state.presence === "focus") return; state.prevPresence = state.presence; setPresence("focus"); toast("Em foco: sentou pra trabalhar."); } else if (state.prevPresence) { setPresence(state.prevPresence); state.prevPresence = null; } },
    onPortal: () => toast("Passou pelo portal."),
    locked,
  });
  function setPresence(v) { state.presence = v; $("#presence").value = v; scene.setMyPresence(v); net.emit("profile", { presence: v }); }
  net.on("prop:state", ({ index, on, by }) => { scene.setPropState(index, on); if (state.nearObject?.index === index) renderPrompt(); if (by && by !== user.name) toast(`${by} ${on ? "ligou" : "desligou"} ${state.map.decor?.[index]?.label || state.map.decor?.[index]?.name || "um objeto"}.`); });
  net.on("world:changed", ({ locked: l, reload } = {}) => {
    if (reload) { toast("O espaço foi atualizado. Recarregando…"); setTimeout(() => location.reload(), 1200); return; }
    if (l) { scene.setLocked(l); toast("Salas atualizadas."); }
  });
  net.on("toast", (t) => toast(t));
  let membersKey = "";
  net.on("state", (ps) => {
    state.players = ps;
    if (scene.player) scene.applyState(ps);
    const key = ps.map((p) => [p.id, p.name, p.color, p.zone, p.voiceChannel, p.muted, p.presence, p.speaking].join("|")).join(";");
    if (key !== membersKey) { membersKey = key; renderMembers(); }
  });
  net.on("bubble", ({ userId, text }) => scene.player && scene.showBubble(userId, text));
  net.on("npcs", (list) => scene.player && scene.applyNpcs(list));

  // --- voz e tela ---
  let spatial = null;
  const getSpatial = () => { if (!spatial) { try { spatial = new Spatial(voice.audioCtx(), { routeVoice: !isIOS() }); spatial.setEnabled(sounds.enabled); for (const e of scene.emitters || []) spatial.addEmitter(e.kind, e.x, e.y); } catch (e) { console.warn("sem áudio espacial", e); } } return spatial; };
  // com LiveKit configurado no servidor, a voz vai pelo SFU (aulas grandes); senão, malha WebRTC
  const voice = new (live ? VoiceLive : Voice)(net, user.id, {
    liveUrl: live?.url,
    onChange: renderVoice,
    onSpeaking: (who, on) => {
      if (who === "me") { scene.setMySpeaking(on); net.emit("speaking", on); }
    },
    onVideo: (who, kind, stream) => { const k = who + ":" + kind; if (stream) state.videos.set(k, { who, kind, stream }); else state.videos.delete(k); renderScreens(); },
    iceServers,
    onAudio: (peerId, stream, el) => getSpatial()?.attachPeer(peerId, stream, el),
    onAudioClose: (peerId) => spatial?.detachPeer(peerId),
  });
  // áudio espacial: volume e lado da voz de quem está perto e dos sons do ambiente, pela distância
  setInterval(() => {
    const sp = spatial; if (!sp || !scene.pos) return;
    const positions = new Map(); for (const p of state.players) positions.set(p.id, { x: p.x, y: p.y });
    const spatialPeers = !!state.group?.id?.startsWith("prox:"); // em sala de reunião/canal, todo mundo no mesmo volume
    sp.update(scene.pos.x, scene.pos.y, { proximityRadius: map.proximityRadius || 3.2, positions, spatialPeers });
  }, 150);
  const tiles = new Tiles($("#stage"), { nameOf: (who, kind) => who === "me" ? (kind === "camera" ? "você" : "sua tela") : (state.players.find((p) => p.id === who)?.name || "…") + (kind === "screen" ? " · tela" : "") });
  let lastPeerCount = 0, mobileUnread = 0;
  // dispositivos escolhidos nas configurações + push + "aba visível?" (menção só vira push quando você não está olhando)
  voice.devices = loadDevices(); if (voice.devices.out) voice.setOutputDevice(voice.devices.out);
  const push = pushClient({ userId: user.id, apiJson });
  document.addEventListener("visibilitychange", () => net.emit("visibility", !document.hidden));
  let eventsMeta = { mail: false, remindMin: 15 };
  voice.onLinkTrouble = (peerId) => { const n = state.players.find((p) => p.id === peerId)?.name || "alguém"; toast(`Não consegui fechar a voz com ${n}. Pode ser rede fechada (empresa/4G); estou tentando pelo relay.`); };
  setInterval(() => { if (voice.peers.size) renderMembers(); }, 2000);
  net.on("voice:group", (g) => {
    state.group = g;
    voice.setCanSpeak(g.canSpeak);
    voice.sync(g.peers || [], g.live);
    const n = (g.peers || []).length;
    if (n > lastPeerCount) sounds.nearby(); else if (n < lastPeerCount) sounds.leave();
    lastPeerCount = n;
    if (!g.id) { if (voice.screen) voice.stopScreen(); if (voice.camera) voice.stopCamera(); }
    renderVoice();
  });
  const micBtn = $("#btn-mic"), screenBtn = $("#btn-screen"), soundBtn = $("#btn-sound"), camBtn = $("#btn-camera");
  micBtn.classList.add("muted");
  const paintMic = () => { micBtn.classList.toggle("muted", voice.muted); micBtn.innerHTML = ICON[voice.muted ? "micOff" : "mic"]; scene.setMuted(voice.muted); net.emit("profile", { muted: voice.muted }); };
  // Padrão: microfone ligado ao entrar (quem chega perto já fala). Quem desligou, continua desligado na próxima visita.
  (async () => {
    if (safe(() => localStorage.getItem("sede:mic"), "on") === "off") return;
    if (await voice.enableMic()) { voice.setMuted(false); paintMic(); getSpatial(); }
  })();
  const noiseBtn = $("#btn-noise"), NOISE = ["normal", "alta", "off"], NOISE_LABEL = { normal: "supressão de ruído: normal", alta: "supressão de ruído: alta (só voz forte passa)", off: "supressão de ruído: desligada" };
  voice.setNoise(safe(() => localStorage.getItem("sede:noise"), "normal") || "normal");
  const paintNoise = () => { noiseBtn.className = "icon-btn " + (voice.noise === "normal" ? "" : voice.noise); noiseBtn.title = NOISE_LABEL[voice.noise]; noiseBtn.innerHTML = ICON.noise; };
  paintNoise();
  noiseBtn.onclick = () => { const n = NOISE[(NOISE.indexOf(voice.noise) + 1) % NOISE.length]; voice.setNoise(n); safe(() => localStorage.setItem("sede:noise", n)); paintNoise(); toast(NOISE_LABEL[n]); };
  async function toggleMic() {
    if (forcedMuted() && (voice.muted || !voice.stream)) { toast(`Você está silenciado pela equipe por mais ${Math.ceil((mutedUntilTs - Date.now()) / 60000)} min.`); return; }
    if (!voice.stream) {
      const ok = await voice.enableMic();
      if (!ok) { toast("Sem acesso ao microfone. Confere a permissão do navegador."); return; }
      voice.setMuted(false);
    } else voice.setMuted(!voice.muted);
    safe(() => localStorage.setItem("sede:mic", voice.muted ? "off" : "on"));
    paintMic(); getSpatial();
  }
  micBtn.onclick = toggleMic;
  async function toggleCamera() {
    if (voice.camera) { voice.stopCamera(); return; }
    if (!state.group?.id) { toast("Entre numa sala de reunião ou canal de voz para ligar a câmera."); return; }
    if (!(await voice.startCamera())) toast("Sem acesso à câmera. Confere a permissão do navegador.");
  }
  camBtn.onclick = toggleCamera;
  screenBtn.onclick = async () => {
    if (voice.screen) { voice.stopScreen(); return; }
    if (!state.group?.id) { toast("Entre numa sala de reunião ou canal de voz para compartilhar a tela."); return; }
    if (!(await voice.startScreen())) toast("Não foi possível compartilhar a tela.");
  };
  sounds.setEnabled(safe(() => localStorage.getItem("sede:sound") !== "off", true));
  const paintSound = () => { soundBtn.classList.toggle("off", !sounds.enabled); soundBtn.innerHTML = ICON[sounds.enabled ? "bell" : "bellOff"]; };
  paintSound();
  soundBtn.onclick = () => { sounds.setEnabled(!sounds.enabled); spatial?.setEnabled(sounds.enabled); paintSound(); safe(() => localStorage.setItem("sede:sound", sounds.enabled ? "on" : "off")); };

  // editar avatar dentro do app
  $("#btn-avatar").onclick = () => {
    modalBody.innerHTML = "";
    $("#modal-title").textContent = "Seu avatar"; $("#modal-kind").textContent = "personalização";
    const wrap = document.createElement("div"); wrap.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto";
    const ed = mountAvatarEditor(wrap, user.avatar, (a) => {
      user.avatar = a; scene.setMyAvatar(a);
      $("#me-dot").style.background = SHIRTS[a.shirt];
      net.emit("profile", { avatar: a });
      safe(() => localStorage.setItem("sede:me", JSON.stringify({ name: user.name, avatar: a })));
    }, { premium: isPremium(user) });
    modalBody.append(wrap);
    modal.classList.remove("hidden"); scene.frozen = true;
  };

  // configurações (dispositivos, notificações, tour)
  $("#btn-settings").innerHTML = ICON.gear;
  $("#btn-settings").onclick = () => {
    $("#modal-title").textContent = "Configurações"; $("#modal-kind").textContent = "áudio · vídeo · notificações";
    openSettings(modalBody, {
      voice, push, toast,
      prefs: { reminders: user.reminders, account: !!user.accountId, mailEnabled: eventsMeta.mail, setReminders: (v) => { user.reminders = v; apiJson("PUT", "/api/auth/prefs", { reminders: v }).then(() => toast(v ? "lembretes por e-mail ligados" : "lembretes por e-mail desligados")).catch((e) => toast(e.message)); } },
      onTour: () => { closeModal(); runTour(true); },
    });
    modal.classList.remove("hidden"); scene.frozen = true;
  };

  // editor do espaço (admin, só no computador)
  if (user.role === "admin" && !isMobile()) {
    const eb = $("#btn-editor"); eb.classList.remove("hidden"); eb.innerHTML = ICON.grid + " Montar o espaço";
    let ed = null;
    eb.onclick = async () => {
      if (ed) return;
      if (!modal.classList.contains("hidden")) closeModal();
      try { ed = await openEditor({ scene, apiJson, toast, onClose: () => { ed = null; } }); scene.input.mouse?.disableContextMenu(); }
      catch (e) { toast("editor: " + e.message); }
    };
  }

  // --- silêncio forçado pela equipe ---
  let mutedUntilTs = mutedUntil || 0;
  const forcedMuted = () => mutedUntilTs > Date.now();
  net.on("mod:muted", ({ until, by, reason }) => {
    mutedUntilTs = until || 0;
    if (forcedMuted()) { voice.setMuted(true); paintMic(); toast(`${by} silenciou você por ${Math.round((until - Date.now()) / 60000)} min${reason ? ": " + reason : "."}`); }
    else toast(`${by} liberou seu microfone.`);
  });

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
      el.append(renderEmoji(body.slice(last, m.index)));
      const s = document.createElement("span"); s.className = "mention"; s.textContent = m[0]; el.append(s);
      last = m.index + m[0].length;
    }
    el.append(renderEmoji(body.slice(last)));
    // mensagem só de emojis: maior
    if (/^(\s*:[a-z0-9_]+:\s*){1,3}$/.test(body)) el.classList.add("big-emoji");
  }
  function mentionsMe(body) {
    const mine = user.name.toLowerCase().replace(/\s+/g, "");
    return [...body.matchAll(mentionRe)].some((m) => { const n = m[1].toLowerCase(); return n === mine || n === "todos" || n === "all"; });
  }
  function addMsg(m) {
    if (m.channel_id !== currentChannel()) return;
    const el = document.createElement("div");
    el.className = "msg" + (m.user_id !== user.id && mentionsMe(m.body) ? " mentions-me" : "") + (String(m.user_id).startsWith("agent:") ? " agent" : "");
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
    if (document.body.classList.contains("mobile") && !$("#chat").classList.contains("open") && m.user_id !== user.id) { mobileUnread++; window.__paintMobileBar?.(); }
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
  EMOJI_ORDER.forEach((key) => {
    const b = document.createElement("button"); b.type = "button"; b.innerHTML = EMOJI[key].svg; b.title = `${EMOJI[key].label} · :${key}:`;
    const em = `:${key}:`;
    b.onclick = () => { const p = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, p) + em + input.value.slice(p); input.focus(); input.setSelectionRange(p + em.length, p + em.length); picker.classList.add("hidden"); };
    picker.appendChild(b);
  });
  $("#btn-emoji").onclick = () => picker.classList.toggle("hidden");

  // --- objetos interativos ---
  const modal = $("#modal"), modalBody = $("#modal-body");
  let openBoardId = null;
  function openObject(o) {
    if (o.kind === "use") { net.emit("prop:use", { index: o.index }, (r) => { if (r?.error) toast(r.error); }); return; }
    modalBody.innerHTML = "";
    $("#modal-title").textContent = o.label;
    $("#modal-kind").textContent = { board: "quadro compartilhado", link: "link", video: "vídeo", info: "mural", sign: "placa", speaker: "caixa de som · " + (zoneOf(o)?.name || "sala") }[o.kind];
    if (o.kind === "speaker") { openSpeakerModal(o); }
    else if (o.kind === "board") {
      const ta = document.createElement("textarea"); ta.placeholder = "Escreva aqui. Todo mundo vê.";
      const foot = document.createElement("div"); foot.className = "modal-foot"; foot.textContent = "salva sozinho · visível para todos";
      const wrap = document.createElement("div"); wrap.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0";
      wrap.append(ta, foot); modalBody.append(wrap);
      openBoardId = o.id;
      net.emit("board:get", { id: o.id }, (content) => { ta.value = content || ""; });
      let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(() => net.emit("board:set", { id: o.id, content: ta.value }), 300); };
      setTimeout(() => ta.focus(), 50);
    } else if (o.kind === "info" || o.kind === "sign") {
      const d = document.createElement("div"); d.className = "info"; d.textContent = o.text || "(sem texto ainda: edite no editor do espaço)"; modalBody.append(d);
    } else {
      const f = document.createElement("iframe"); f.src = o.url; f.allow = "autoplay; fullscreen; clipboard-write"; f.referrerPolicy = "no-referrer";
      modalBody.append(f);
      const foot = document.createElement("div"); foot.className = "modal-foot";
      const a = document.createElement("a"); a.href = o.url; a.target = "_blank"; a.rel = "noopener"; a.style.color = "inherit"; a.textContent = "abrir em nova aba ↗"; foot.append(a);
      modalBody.parentElement.append(foot);
      if (isStaff) { // admin/professor trocam o link do telão/palco na hora; todo mundo vê
        const ed = document.createElement("div"); ed.className = "obj-edit modal-foot";
        const lab = document.createElement("input"); lab.value = o.label; lab.placeholder = "nome"; lab.style.maxWidth = "120px";
        const inp = document.createElement("input"); inp.value = o.url; inp.placeholder = "https://… (YouTube, Meet, slides, site)";
        const save = document.createElement("button"); save.className = "sp-btn primary"; save.textContent = "Salvar link";
        save.onclick = () => net.emit("object:set", { id: o.id, url: inp.value, label: lab.value }, (r) => { if (r?.error) return toast(r.error); toast("Link atualizado pra todo mundo."); f.src = r.url || inp.value; });
        inp.onkeydown = (e) => { if (e.key === "Enter") save.click(); };
        ed.append(lab, inp, save); modalBody.parentElement.append(ed);
      }
    }
    modal.classList.remove("hidden");
    scene.frozen = true;
  }
  function closeModal() {
    modal.classList.add("hidden"); scene.frozen = false; openBoardId = null; modalOpenId = null;
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

  // --- conversa com agente ---
  const agentModal = $("#agent-modal"), agentLog = $("#agent-log"), agentInput = $("#agent-input"), agentStatus = $("#agent-status");
  let agentOpen = null;
  function addAgentMsg(role, text) {
    const d = document.createElement("div"); d.className = "amsg " + (role === "user" ? "user" : "agent");
    if (role === "user") d.textContent = text;
    else { d.textContent = ""; renderRich(d, text); }
    agentLog.appendChild(d); agentLog.scrollTop = agentLog.scrollHeight;
  }
  function renderRich(el, text) { // links clicáveis, resto texto
    const re = /https?:\/\/[^\s)]+/g; let last = 0;
    for (const m of text.matchAll(re)) { el.append(text.slice(last, m.index)); const a = document.createElement("a"); a.href = m[0]; a.target = "_blank"; a.rel = "noopener"; a.textContent = m[0]; el.append(a); last = m.index + m[0].length; }
    el.append(text.slice(last));
  }
  function openAgent(o) {
    agentOpen = o; agentLog.innerHTML = ""; agentStatus.textContent = "";
    $("#agent-title").textContent = o.label; $("#agent-kind").textContent = "agente · ia" + (o.role ? " · " + o.role : "");
    agentModal.classList.remove("hidden"); scene.frozen = true;
    net.emit("agent:history", { agentId: o.agentId }, (hist) => { for (const m of hist || []) addAgentMsg(m.role, m.content); if (!hist?.length) addAgentMsg("agent", `Oi, eu sou ${o.label}. ${o.role ? o.role + ". " : ""}Pergunta o que quiser.`); });
    setTimeout(() => agentInput.focus(), 50);
  }
  function closeAgent() { agentModal.classList.add("hidden"); scene.frozen = false; agentOpen = null; }
  $("#agent-close").onclick = closeAgent;
  agentModal.addEventListener("click", (e) => { if (e.target === agentModal) closeAgent(); });
  net.on("agent:tool", ({ name, args }) => { agentStatus.textContent = { web_search: `buscando: ${args.query || ""}`, fetch_url: `lendo ${args.url || ""}`, rss: "lendo fontes RSS" }[name] || name; });
  $("#agent-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = agentInput.value.trim(); if (!text || !agentOpen) return;
    addAgentMsg("user", text); agentInput.value = ""; agentStatus.textContent = "pensando…";
    net.emit("agent:chat", { agentId: agentOpen.agentId, text }, (r) => {
      agentStatus.textContent = "";
      if (r?.error) { addAgentMsg("agent", "⚠ " + r.error); return; }
      addAgentMsg("agent", r?.reply || "…");
    });
  });

  // --- teclado global ---
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (e.key === "Escape") { if (!agentModal.classList.contains("hidden")) closeAgent(); else if (!modal.classList.contains("hidden")) closeModal(); else { input.blur(); picker.classList.add("hidden"); } return; }
    if (typing) return;
    if (e.key === "Enter") { e.preventDefault(); input.focus(); }
    else if (e.key.toLowerCase() === "m") toggleMic();
    else if (e.key.toLowerCase() === "c") toggleCamera();
    else if (e.key.toLowerCase() === "v") tiles.toggleAll();
    else if (e.key.toLowerCase() === "e" && state.nearObject && modal.classList.contains("hidden") && agentModal.classList.contains("hidden")) {
      if (state.nearObject.kind === "agent") openAgent(state.nearObject); else openObject(state.nearObject);
    }
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
      const pc = voice.peers.get(p.id)?.pc; if (pc) li.querySelector(".pdot").classList.add(pc.connectionState === "connected" ? "link-ok" : pc.connectionState === "failed" ? "link-bad" : "link-wait");
      li.querySelector("span:nth-child(3)").textContent = p.name + (p.id === user.id ? " (você)" : "");
      if (p.role === "admin" || p.role === "professor") { const b = document.createElement("span"); b.className = "badge-role"; b.textContent = p.role === "admin" ? "admin" : "prof"; li.querySelector("span:nth-child(3)").append(" ", b); }
      li.querySelector(".where").textContent = label[p.presence] || where;
      li.title = p.status || "";
      if (isStaff && p.id !== user.id && p.role !== "admin" && !(p.role === "professor" && user.role !== "admin")) {
        const b = document.createElement("button"); b.className = "mod-btn"; b.title = "moderar"; b.textContent = "⋯"; b.onclick = (e) => { e.stopPropagation(); openModMenu(p, b); };
        li.append(b);
      }
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
  $("#hud-prompt").onclick = () => { if (!state.nearObject) return; if (state.nearObject.kind === "agent") openAgent(state.nearObject); else openObject(state.nearObject); };
  function renderPrompt() {
    const el = $("#hud-prompt");
    if (!state.nearObject) { el.classList.add("hidden"); return; }
    const verb = { board: "Abrir quadro", link: "Abrir", video: "Assistir", info: "Ler", sign: "Ler", use: state.nearObject.on ? "Desligar" : "Ligar", agent: "Conversar com", speaker: "Escolher música" }[state.nearObject.kind];
    el.querySelector("span").textContent = `${verb} · ${state.nearObject.label}`;
    el.classList.remove("hidden");
  }
  // ---------- gravação da aula (LiveKit + S3) ----------
  const recRooms = new Set(recordings);
  const recBtn = $("#hud-rec");
  const myRoom = () => state.group?.live?.room || null;
  recBtn.onclick = () => {
    const on = !recRooms.has(myRoom());
    const title = on ? prompt("Título da gravação (vai pra biblioteca):", "") : null;
    if (on && title === null) return;
    net.emit("live:record", { on, title }, (r) => { if (r?.error) toast(r.error); });
  };
  net.on("live:recording", ({ room, on, by, title }) => {
    if (on) recRooms.add(room); else recRooms.delete(room);
    if (room && room === myRoom()) toast(on ? `● ${by} começou a gravar "${title}"` : "Gravação encerrada.");
    renderVoice();
  });
  function renderRec() {
    const room = myRoom(), can = isStaff && live?.recording && room && room.startsWith("zone-");
    const on = recRooms.has(room);
    recBtn.classList.toggle("hidden", !can && !on);
    recBtn.classList.toggle("on", on);
    recBtn.textContent = on ? (can ? "■ parar gravação" : "● gravando") : "● gravar aula";
    recBtn.disabled = !can;
  }
  function renderVoice() {
    renderRec();
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
    camBtn.classList.toggle("live", !!voice.camera);
    camBtn.classList.toggle("off", !g?.id && !voice.camera);
    camBtn.innerHTML = ICON[voice.camera ? "camera" : "cameraOff"];
  }
  function renderScreens() { tiles.sync(state.videos); }

  // ---------- caixa de som da sala (YouTube sincronizado) ----------
  const zoneOf = (o) => map.zones.find((z) => o.x >= z.x && o.x < z.x + z.w && o.y >= z.y && o.y < z.y + z.h);
  const sw = $("#speaker-widget"), swTitle = $("#sw-title"), swSub = $("#sw-sub"), swPlay = $("#sw-play"), swIcon = $("#sw-icon");
  swIcon.innerHTML = ICON.music; $("#sw-toggle").innerHTML = ICON.chevron; $("#sw-open").innerHTML = ICON.edit;
  const swMute = $("#sw-mute"), swVol = $("#sw-vol");
  const speaker = new Speaker($("#speaker-player"), { onEnded: (id, st) => net.emit("speaker:ended", { id, videoId: st.videoId, startedAt: st.startedAt }), onState: (st) => {
    swPlay.classList.toggle("hidden", st !== "bloqueado");
    swIcon.classList.toggle("on", st === "tocando");
    if (st === "bloqueado") swSub.textContent = "toque em ▶ pra ouvir";
    else if (st === "erro") swSub.textContent = "esse vídeo não pode tocar aqui";
    else if (st === "acabou") swSub.textContent = (state.speakers[activeSpeakerId]?.queue?.length ? "acabou · próxima da fila…" : "acabou · escolha outra (E na caixa)");
    else if (st) paintSpeakerSub();
  } });
  speaker.setServerTime(serverTime);
  let activeSpeakerId = null;
  const activeSpeakerObj = () => map.objects.find((o) => o.id === activeSpeakerId);
  function paintSpeakerSub() {
    const st = activeSpeakerId && state.speakers[activeSpeakerId]; if (!st) return;
    const q = st.queue?.length ? ` · fila: ${st.queue.length}` : "";
    swSub.textContent = (st.author ? st.author + " · " : "") + (st.byName ? "por " + st.byName : "") + q;
  }
  // qual caixa toca pra mim: a da sala em que estou (se tiver música)
  function refreshSpeaker() {
    const z = state.zone;
    const o = z && map.objects.find((x) => x.kind === "speaker" && state.speakers[x.id] && zoneOf(x)?.id === z.id);
    if (!o) {
      if (activeSpeakerId) { activeSpeakerId = null; speaker.stop(); sw.classList.add("hidden"); spatial?.muteKind("radio", false); }
      return;
    }
    const st = state.speakers[o.id];
    if (activeSpeakerId !== o.id || speaker.current?.state !== st) {
      activeSpeakerId = o.id;
      swTitle.textContent = st.title || "YouTube"; paintSpeakerSub();
      sw.classList.remove("hidden");
      speaker.play(o.id, st); // idempotente: mesma música só ressincroniza
      spatial?.muteKind("radio", true);
    }
  }
  swVol.value = safe(() => localStorage.getItem("sede:music") ?? "80", "80");
  speaker.setVolume(Number(swVol.value) / 100);
  swVol.oninput = () => { speaker.setVolume(Number(swVol.value) / 100); safe(() => localStorage.setItem("sede:music", swVol.value)); };
  const paintMute = () => { swMute.innerHTML = ICON[speaker.muted ? "volumeOff" : "volume"]; swMute.classList.toggle("off", speaker.muted); };
  paintMute();
  swMute.onclick = () => { speaker.setMuted(!speaker.muted); paintMute(); };
  swPlay.onclick = () => { speaker.resume(); swPlay.classList.add("hidden"); };
  $("#sw-toggle").onclick = () => { sw.classList.toggle("collapsed"); safe(() => localStorage.setItem("sede:music:collapsed", sw.classList.contains("collapsed") ? "1" : "0")); };
  if (safe(() => localStorage.getItem("sede:music:collapsed") === "1", false)) sw.classList.add("collapsed");
  $("#sw-open").onclick = () => { const o = activeSpeakerObj(); if (o) openObject(o); };
  net.on("speaker:update", ({ id, state: st, now }) => {
    speaker.setServerTime(now);
    const prev = state.speakers[id];
    if (st) state.speakers[id] = st; else delete state.speakers[id];
    const o = map.objects.find((x) => x.id === id);
    const changedTrack = !prev || !st || prev.videoId !== st.videoId || prev.startedAt !== st.startedAt;
    if (o && state.zone && zoneOf(o)?.id === state.zone.id) {
      if (!st) toast("A música da sala parou.");
      else if (changedTrack) toast(`♪ ${st.byName} colocou "${st.title}"`);
      else if ((st.queue?.length || 0) > (prev?.queue?.length || 0)) toast(`♪ ${st.queue[st.queue.length - 1].byName} adicionou "${st.queue[st.queue.length - 1].title}" à fila`);
    }
    refreshSpeaker();
    if (modalOpenId === id) openSpeakerModal(o);
  });
  net.on("object:update", ({ id, url, label, by }) => {
    const o = map.objects.find((x) => x.id === id); if (!o) return;
    if (url) o.url = url; if (label) o.label = label;
    scene.updateObjectLabel?.(id, o.label);
    if (state.nearObject?.id === id) renderPrompt();
    toast(`${by} atualizou o link de "${o.label}".`);
  });
  // volume pela distância até a caixa (dentro da sala nunca fica mudo de todo)
  setInterval(() => {
    const o = activeSpeakerObj(); if (!o || !scene.pos) return;
    const d = Math.hypot(o.x + o.w / 2 - scene.pos.x, o.y + o.h / 2 - scene.pos.y), R = 14;
    speaker.setDistance(0.35 + 0.65 * (1 - Math.min(d, R) / R));
  }, 300);
  let modalOpenId = null;
  function openSpeakerModal(o) {
    const keep = modalOpenId === o.id ? modalBody.querySelector(".sp-row input")?.value : ""; // redesenho por atualização da fila não apaga o que a pessoa digitava
    modalOpenId = o.id; modalBody.innerHTML = "";
    const st = state.speakers[o.id];
    const form = document.createElement("div"); form.className = "sp-form";
    if (st) {
      const now = document.createElement("div"); now.className = "sp-now";
      now.innerHTML = `<img src="https://i.ytimg.com/vi/${st.videoId}/mqdefault.jpg" alt=""><div class="t"><div></div><small></small></div>`;
      now.querySelector(".t div").textContent = "♪ " + (st.title || "YouTube");
      now.querySelector("small").textContent = (st.author ? st.author + " · " : "") + "colocada por " + (st.byName || "alguém");
      const canCtl = isStaff || st.by === user.id;
      if (canCtl) {
        const skip = document.createElement("button"); skip.className = "sp-btn"; skip.textContent = st.queue?.length ? "Pular ▸" : "Parar";
        skip.onclick = () => net.emit(st.queue?.length ? "speaker:skip" : "speaker:stop", { id: o.id }, (r) => { if (r?.error) toast(r.error); });
        now.append(skip);
      }
      form.append(now);
      // fila
      const q = st.queue || [];
      if (q.length) {
        const qh = document.createElement("div"); qh.className = "sp-hint"; qh.textContent = `a seguir (${q.length})`; form.append(qh);
        const ql = document.createElement("div"); ql.className = "sp-results";
        q.forEach((it, i) => {
          const b = document.createElement("div"); b.className = "sp-res";
          b.innerHTML = `<img loading="lazy" src="https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg" alt=""><div class="t"><div></div><small></small></div>`;
          b.querySelector(".t div").textContent = `${i + 1}. ${it.title || it.videoId}`; b.querySelector("small").textContent = [it.author, "por " + it.byName].filter(Boolean).join(" · ");
          if (isStaff || it.by === user.id) { const rm = document.createElement("button"); rm.className = "sp-btn"; rm.textContent = "tirar"; rm.onclick = () => net.emit("speaker:remove", { id: o.id, index: i }, (r) => { if (r?.error) toast(r.error); }); b.append(rm); }
          ql.append(b);
        });
        form.append(ql);
      }
    } else {
      const h = document.createElement("div"); h.className = "sp-hint"; h.textContent = "nada tocando nesta sala"; form.append(h);
    }
    const row = document.createElement("div"); row.className = "sp-row";
    const inp = document.createElement("input"); inp.placeholder = "Cole um link do YouTube ou descreva o que quer ouvir (ex.: lo-fi pra focar)"; inp.value = keep || "";
    const go = document.createElement("button"); go.className = "sp-btn primary"; go.textContent = "Pesquisar / tocar";
    row.append(inp, go); form.append(row);
    const hint = document.createElement("div"); hint.className = "sp-hint"; hint.textContent = "a música toca pra todo mundo que estiver nesta sala · volume cai com a distância da caixa"; form.append(hint);
    const ai = document.createElement("div"); ai.className = "sp-ai hidden"; form.append(ai);
    const res = document.createElement("div"); res.className = "sp-results"; form.append(res);
    const play = (videoId, title, mode) => net.emit("speaker:set", { id: o.id, url: videoId, title, mode }, (r) => { if (r?.error) return toast(r.error); toast(r.queued ? `Na fila (posição ${r.position}).` : "Tocando pra sala inteira."); inp.value = ""; res.innerHTML = ""; });
    const playing = !!state.speakers[o.id], canNow = isStaff || state.speakers[o.id]?.by === user.id;
    hint.textContent = (playing ? "tem música tocando: o que você escolher entra na fila" + (canNow ? " (ou toca agora)" : "") : "a música toca pra todo mundo que estiver nesta sala") + " · volume cai com a distância da caixa";
    go.onclick = () => {
      const q = inp.value.trim(); if (!q) return inp.focus();
      go.disabled = true; go.textContent = "…"; res.innerHTML = ""; ai.classList.add("hidden");
      net.emit("speaker:search", { q }, (r) => {
        go.disabled = false; go.textContent = "Pesquisar / tocar";
        if (!r) return; if (r.error) toast(r.error);
        if (r.aiQuery) { ai.textContent = `ia sugeriu buscar: "${r.aiQuery}"`; ai.classList.remove("hidden"); }
        if (r.results?.length === 1 && /^([\w-]{11}|https?:)/.test(q) && !r.aiQuery) return play(r.results[0].videoId, r.results[0].title, playing ? "queue" : undefined);
        for (const v of r.results || []) {
          const b = document.createElement("button"); b.type = "button"; b.className = "sp-res";
          b.innerHTML = `<img loading="lazy" src="https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg" alt=""><div class="t"><div></div><small></small></div>`;
          b.querySelector(".t div").textContent = v.title || v.videoId; b.querySelector("small").textContent = [v.author, v.length].filter(Boolean).join(" · ");
          if (playing) {
            const add = document.createElement("button"); add.className = "sp-btn"; add.textContent = "+ fila"; add.onclick = (e) => { e.stopPropagation(); play(v.videoId, v.title, "queue"); }; b.append(add);
            if (canNow) { const nowB = document.createElement("button"); nowB.className = "sp-btn primary"; nowB.textContent = "agora"; nowB.onclick = (e) => { e.stopPropagation(); play(v.videoId, v.title, "now"); }; b.append(nowB); }
            b.onclick = () => play(v.videoId, v.title, "queue");
          } else b.onclick = () => play(v.videoId, v.title);
          res.append(b);
        }
        if (!r.results?.length && !r.error) { const n = document.createElement("div"); n.className = "sp-hint"; n.textContent = "nada encontrado"; res.append(n); }
      });
    };
    inp.onkeydown = (e) => { if (e.key === "Enter") go.click(); };
    modalBody.append(form);
    setTimeout(() => inp.focus(), 50);
  }
  refreshSpeaker();
  scene.onWalking = (on) => tiles.walking(on);

  // ---------- tour de primeira vez ----------
  let tour = null;
  function runTour(force = false) {
    if (tour) tour.finish();
    const seen = user.tourDone || safe(() => localStorage.getItem("sede:tour") === "done", false);
    if (!force && (seen || new URLSearchParams(location.search).has("notour"))) return;
    tour = startTour({ scene, map, state, hasMic: () => !!voice.stream && !voice.muted, onDone: () => {
      tour = null; safe(() => localStorage.setItem("sede:tour", "done"));
      if (user.accountId) apiJson("PUT", "/api/auth/prefs", { tourDone: true }).catch(() => {});
    } });
  }
  function onSceneReady() { setTimeout(() => runTour(false), 600); }

  // ---------- agenda ----------
  const evBox = $("#events-box"), evList = $("#events");
  let evItems = events;
  const fmtWhen = (iso) => { const d = new Date(iso), diff = d.getTime() - Date.now(), m = Math.round(diff / 60000);
    if (diff <= 0) return "ao vivo"; if (m < 1) return "já já"; if (m < 60) return `em ${m} min`; if (m < 24 * 60) return `hoje ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  function renderEvents() {
    evList.innerHTML = "";
    const now = Date.now();
    const items = evItems.filter((e) => new Date(e.startsAt).getTime() + e.durationMin * 60000 > now).slice(0, 5);
    evBox.classList.toggle("hidden", !items.length);
    for (const e of items) {
      const live = new Date(e.startsAt).getTime() <= now;
      const li = document.createElement("li"); li.className = live ? "live" : "";
      li.innerHTML = `<span class="ev-when mono"></span><span class="ev-title"></span>`;
      li.querySelector(".ev-when").textContent = fmtWhen(e.startsAt); li.querySelector(".ev-title").textContent = e.title;
      li.title = (e.description || "") + (live ? " · ao vivo agora, clique pra ir" : " · clique pra ir pro palco");
      li.onclick = () => { const z = map.zones.find((x) => x.id === e.zone) || map.zones.find((x) => x.kind === "stage"); if (z) scene.teleportTo(z); };
      evList.append(li);
    }
  }
  const loadEvents = () => apiJson("GET", "/api/events").then((r) => { evItems = r.events || []; eventsMeta = { mail: !!r.mail, remindMin: r.remindMin || 15 }; renderEvents(); }).catch(() => {});
  renderEvents(); loadEvents(); setInterval(renderEvents, 30000);
  net.on("events:changed", loadEvents);
  net.on("event:soon", ({ event: e, minutes }) => toast(`"${e.title}" começa em ${minutes} min no palco.`, { action: "ir pro palco", onAction: () => { const z = map.zones.find((x) => x.id === e.zone); if (z) scene.teleportTo(z); } }));
  net.on("event:started", ({ event: e }) => { sounds.mention(); toast(`Começou: ${e.title}`, { action: "ir pro palco", onAction: () => { const z = map.zones.find((x) => x.id === e.zone); if (z) scene.teleportTo(z); } }); });

  // ---------- moderação (equipe) ----------
  const modMenu = $("#mod-menu");
  function openModMenu(p, anchor) {
    modMenu.innerHTML = "";
    const h = document.createElement("div"); h.className = "mono dim"; h.textContent = p.name; modMenu.append(h);
    const act = (label, action, minutes) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = () => {
      modMenu.classList.add("hidden");
      const reason = action === "kick" || action === "ban" ? (prompt(`Motivo (${action === "ban" ? "banir" : "expulsar"} ${p.name}):`, "") ?? null) : "";
      if (reason === null) return;
      net.emit("mod:action", { targetId: p.id, action, minutes, reason }, (r) => toast(r?.error || { mute: `${p.name} silenciado por ${minutes} min`, unmute: `${p.name} liberado`, kick: `${p.name} expulso`, ban: `${p.name} banido` }[action]));
    }; modMenu.append(b); };
    act("silenciar 5 min", "mute", 5); act("silenciar 30 min", "mute", 30); act("liberar microfone", "unmute"); act("expulsar", "kick"); act("banir", "ban");
    const r = anchor.getBoundingClientRect();
    modMenu.style.left = Math.min(innerWidth - 190, r.left) + "px"; modMenu.style.top = Math.min(innerHeight - 200, r.bottom + 4) + "px";
    modMenu.classList.remove("hidden");
  }
  document.addEventListener("click", (e) => { if (!modMenu.contains(e.target) && !e.target.closest(".mod-btn")) modMenu.classList.add("hidden"); });

  renderMembers(); renderZone(); loadHistory(); renderVoice();

  // ---- celular: gavetas, barra e joystick ----
  const mobile = isMobile();
  document.body.classList.toggle("mobile", mobile);
  if (mobile) {
    const dr = drawers({ sidebar: $("#sidebar"), chat: $("#chat"), backdrop: $("#drawer-backdrop"), onOpenChat: () => { mobileUnread = 0; paintMobileBar(); setTimeout(() => scrollDown(), 50); } });
    mountJoystick($("#joy"), (v) => { scene.touch = v; });
    const mb = { menu: $("#mb-menu"), chat: $("#mb-chat"), mic: $("#mb-mic"), cam: $("#mb-cam"), run: $("#mb-run"), zoom: $("#mb-zoom") };
    mb.menu.innerHTML = ICON.hash; mb.run.innerHTML = ICON.run; mb.zoom.innerHTML = ICON.expand;
    mb.chat.insertAdjacentHTML("afterbegin", ICON.smile);
    const paintMobileBar = () => {
      mb.mic.innerHTML = ICON[voice.muted ? "micOff" : "mic"]; mb.mic.classList.toggle("on", !voice.muted && !!voice.stream);
      mb.cam.innerHTML = ICON[voice.camera ? "camera" : "cameraOff"]; mb.cam.classList.toggle("on", !!voice.camera);
      mb.run.classList.toggle("on", !!scene.runToggle);
      const b = mb.chat.querySelector(".badge-n"); b.textContent = mobileUnread; b.classList.toggle("hidden", !mobileUnread);
    };
    window.__paintMobileBar = paintMobileBar;
    mb.menu.onclick = () => dr.open("sidebar"); mb.chat.onclick = () => dr.open("chat");
    $("#sb-close").innerHTML = ICON.close; $("#chat-close").innerHTML = ICON.close; $("#sb-close").onclick = dr.closeAll; $("#chat-close").onclick = dr.closeAll;
    mb.mic.onclick = async () => { await toggleMic(); paintMobileBar(); };
    mb.cam.onclick = async () => { await toggleCamera(); paintMobileBar(); };
    mb.run.onclick = () => { scene.runToggle = !scene.runToggle; paintMobileBar(); toast(scene.runToggle ? "correndo" : "andando"); };
    mb.zoom.onclick = () => { const z = scene.setZoom(scene.zoom === 1 ? 2 : 1); toast(`zoom ${z}x`); };
    voice.onChange = () => { renderVoice(); paintMobileBar(); };
    // tocar num canal/sala fecha a gaveta
    for (const id of ["#text-channels", "#voice-channels", "#zones"]) $(id).addEventListener("click", (e) => { if (e.target.closest("li")) setTimeout(dr.closeAll, 120); });
    // iOS: destrava o áudio no primeiro toque
    document.addEventListener("touchstart", () => { try { voice.audioCtx(); } catch {} for (const a of document.querySelectorAll("#audio-sink audio")) a.play().catch(() => {}); }, { once: true, passive: true });
    paintMobileBar();
  }
  window.__sede = { scene, state, net, voice, get spatial() { return spatial; }, tiles };

  return {
    pos: () => ({ x: scene.pos.x, y: scene.pos.y }),
    disconnected() { if (!this.kicked) toast("Conexão caiu. Reconectando…"); voice.closeAll(); },
    rejoined: (res) => {
      toast("Reconectado.");
      state.players = res.players;
      net.emit("profile", { presence: state.presence, muted: voice.muted, status: statusInput.value.trim() });
      if (state.voiceChannel) net.emit("voice:channel", { channelId: state.voiceChannel });
      renderMembers();
    },
  };
}

// toast simples; com { action, onAction } vira um aviso com botão (fica mais tempo)
function toast(text, opts = {}) {
  const t = $("#toast"); t.textContent = text; t.classList.remove("hidden");
  if (opts.action) { const b = document.createElement("button"); b.className = "toast-btn"; b.textContent = opts.action; b.onclick = () => { t.classList.add("hidden"); opts.onAction?.(); }; t.append(b); }
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add("hidden"), opts.action ? 9000 : 3000);
}

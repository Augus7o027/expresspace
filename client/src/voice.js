// Voz e tela em malha (mesh) WebRTC. O servidor decide quem fala com quem (voice:group);
// aqui só abrimos/fechamos conexões pra bater com a lista de peers.
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

export class Voice {
  constructor(net, myId, { onChange, onSpeaking, onVideo, onAudio, onAudioClose, iceServers } = {}) {
    this.ice = Array.isArray(iceServers) && iceServers.length ? iceServers : ICE;
    this.onAudio = onAudio || (() => {});           // (peerId, stream, audioEl) chegou áudio remoto
    this.onAudioClose = onAudioClose || (() => {});  // (peerId)
    this.noise = "normal";                           // supressão de ruído: off | normal | alta
    this.net = net;
    this.myId = myId;
    this.peers = new Map(); // peerId -> { pc, audio, video, polite, makingOffer, analyser }
    this.stream = null;      // microfone
    this.screen = null;      // tela compartilhada
    this.camera = null;      // câmera
    this.meta = new Map();   // peerId -> { streamId: "screen"|"camera" }
    this.muted = true;
    this.canSpeak = true;
    this.onChange = onChange || (() => {});
    this.onSpeaking = onSpeaking || (() => {});
    // onVideo(who, kind, stream|null)  who = peerId | "me", kind = "screen" | "camera"
    this.onVideo = onVideo || (() => {});
    this.sink = document.getElementById("audio-sink");
    this.speakingNow = new Map(); // peerId|me -> bool
    net.on("rtc:signal", (m) => this.onSignal(m));
    this.ctx = null;
    setInterval(() => this.pollSpeaking(), 120);
    setInterval(() => this.watchdog(), 1000);
  }

  // Conexão que não fecha: em 4s renegocia; em 9s recria a conexão do zero.
  watchdog() {
    const now = Date.now();
    for (const [id, e] of this.peers) {
      const ok = e.pc.connectionState === "connected";
      if (ok) { e.stuckSince = null; e.retried = false; continue; }
      e.stuckSince ??= now;
      const t = now - e.stuckSince;
      if (t > 9000) {
        e.fails = (e.fails || 0) + 1; console.warn("rtc: recriando conexão com", id, "tentativa", e.fails);
        if (e.fails === 2) this.onLinkTrouble?.(id);
        const fails = e.fails; this.close(id); this.open(id); this.peers.get(id).fails = fails; continue;
      }
      if (t > 4000 && !e.retried) {
        e.retried = true;
        const st = e.pc.signalingState;
        if (st === "have-local-offer") e.pc.setLocalDescription({ type: "rollback" }).then(() => this.renegotiate(id, true)).catch(() => {});
        else if (st === "stable") this.renegotiate(id, !!e.pc.remoteDescription);
      }
    }
  }
  async renegotiate(peerId, iceRestart = false) {
    const e = this.peers.get(peerId);
    if (!e || e.pc.signalingState !== "stable") return;
    try {
      e.makingOffer = true;
      if (iceRestart) e.pc.restartIce();
      await e.pc.setLocalDescription();
      this.net.emit("rtc:signal", { to: peerId, data: { description: e.pc.localDescription } });
    } catch (err) { console.warn("renegotiate", err); }
    finally { e.makingOffer = false; }
  }

  audioCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  analyserFor(stream) {
    try {
      const ctx = this.audioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.6;
      src.connect(an);
      return an;
    } catch { return null; }
  }

  level(an) {
    if (!an) return 0;
    const buf = new Uint8Array(an.frequencyBinCount);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
    return Math.sqrt(sum / buf.length);
  }

  pollSpeaking() {
    const check = (key, an, extraMute) => {
      const on = !extraMute && this.level(an) > 0.04;
      if (this.speakingNow.get(key) !== on) { this.speakingNow.set(key, on); this.onSpeaking(key, on); }
    };
    if (this.stream) { const lv = this.level(this.myAnalyser); this.tickGate(lv); const on = !(this.muted || !this.canSpeak) && lv > 0.04 && this.gateOpen !== false; if (this.speakingNow.get("me") !== on) { this.speakingNow.set("me", on); this.onSpeaking("me", on); } }
    for (const [id, p] of this.peers) if (p.analyser) check(id, p.analyser, false);
  }

  // dispositivos escolhidos nas configurações: { mic, cam, out } (deviceId ou "")
  micConstraints() { return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...(this.devices?.mic ? { deviceId: { exact: this.devices.mic } } : {}) }; }
  async enableMic() {
    if (this.stream) return true;
    try {
      this.raw = await navigator.mediaDevices.getUserMedia({ audio: this.micConstraints(), video: false }).catch((e) => { if (this.devices?.mic) { this.devices.mic = ""; return navigator.mediaDevices.getUserMedia({ audio: this.micConstraints(), video: false }); } throw e; });
      this.myAnalyser = this.analyserFor(this.raw);
      this.stream = this.processMic(this.raw) || this.raw;
      this.applyMute();
      for (const p of this.peers.values()) if (p.ready) this.addTracks(p.pc, this.stream);
      return true;
    } catch (e) { console.warn("mic indisponível", e); return false; }
  }

  // Porta de ruído + filtro grave, em cima da supressão nativa do navegador:
  // mic -> passa-altas 90Hz -> ganho (abre quando há voz, fecha no silêncio) -> trilha enviada
  processMic(raw) {
    try {
      const ctx = this.audioCtx();
      const src = ctx.createMediaStreamSource(raw); this.micSrc = src; this.micHp = null;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 90; this.micHp = hp;
      const gate = ctx.createGain(); gate.gain.value = 1;
      const dest = ctx.createMediaStreamDestination();
      src.connect(hp).connect(gate).connect(dest);
      this.gate = gate; this.gateOpen = true; this.gateLastVoice = 0;
      return dest.stream;
    } catch (e) { console.warn("sem processamento de mic", e); return null; }
  }
  setNoise(level) { this.noise = level; if (this.gate && level === "off") { this.gate.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02); this.gateOpen = true; } }
  tickGate(level) {
    if (!this.gate || this.noise === "off") return;
    const thr = this.noise === "alta" ? 0.045 : 0.018;
    const now = performance.now();
    if (level > thr) this.gateLastVoice = now;
    const open = now - this.gateLastVoice < 350; // segura 350ms depois da última voz
    if (open !== this.gateOpen) { this.gateOpen = open; this.gate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, open ? 0.015 : 0.08); }
  }

  // troca o microfone em uso sem derrubar as conexões: religa a fonte no grafo (ou substitui a trilha)
  async setMicDevice(id) {
    this.devices ??= {}; this.devices.mic = id || "";
    if (!this.stream) return true;
    try {
      const raw = await navigator.mediaDevices.getUserMedia({ audio: this.micConstraints(), video: false });
      const old = this.raw; this.raw = raw; this.myAnalyser = this.analyserFor(raw);
      if (this.micSrc && this.micHp) { try { this.micSrc.disconnect(); } catch {} this.micSrc = this.ctx.createMediaStreamSource(raw); this.micSrc.connect(this.micHp); }
      else { const t = raw.getAudioTracks()[0]; for (const p of this.peers.values()) for (const sn of p.pc.getSenders()) if (sn.track?.kind === "audio") sn.replaceTrack(t).catch(() => {}); this.stream = raw; this.applyMute(); }
      old?.getTracks().forEach((t) => t.stop());
      return true;
    } catch (e) { console.warn("troca de mic", e); return false; }
  }
  async setCamDevice(id) { this.devices ??= {}; this.devices.cam = id || ""; if (this.camera) { this.stopCamera(); return this.startCamera(); } return true; }
  // saída de áudio: elementos <audio> dos peers + o AudioContext (voz roteada pelo áudio espacial)
  async setOutputDevice(id) {
    this.devices ??= {}; this.devices.out = id || "";
    try { if (this.ctx?.setSinkId) await this.ctx.setSinkId(id || ""); } catch (e) { console.warn("sinkId ctx", e); }
    for (const p of this.peers.values()) { try { await p.audio.setSinkId?.(id || ""); } catch {} }
    return true;
  }
  setMuted(m) { this.muted = m; this.applyMute(); this.onChange(); }
  setCanSpeak(c) { this.canSpeak = c; this.applyMute(); }
  applyMute() {
    if (!this.stream) return;
    for (const t of this.stream.getAudioTracks()) t.enabled = !this.muted && this.canSpeak;
  }

  // ---------- tela e câmera ----------
  announce(peerId) {
    const streams = {};
    if (this.screen) streams[this.screen.id] = "screen";
    if (this.camera) streams[this.camera.id] = "camera";
    this.net.emit("rtc:signal", { to: peerId, data: { meta: { streams } } });
  }
  announceAll() { for (const id of this.peers.keys()) this.announce(id); }

  async startScreen() {
    if (this.screen) return true;
    try {
      this.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      this.screen.getVideoTracks()[0].onended = () => this.stopScreen();
      this.announceAll();
      for (const p of this.peers.values()) if (p.ready) this.addTracks(p.pc, this.screen);
      this.onVideo("me", "screen", this.screen);
      this.onChange();
      return true;
    } catch (e) { console.warn("tela indisponível", e); return false; }
  }
  stopScreen() { this.stopStream("screen"); }

  async startCamera() {
    if (this.camera) return true;
    try {
      this.camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 24, ...(this.devices?.cam ? { deviceId: { exact: this.devices.cam } } : { facingMode: "user" }) }, audio: false });
      this.camera.getVideoTracks()[0].onended = () => this.stopCamera();
      this.announceAll();
      for (const p of this.peers.values()) if (p.ready) this.addTracks(p.pc, this.camera);
      this.onVideo("me", "camera", this.camera);
      this.onChange();
      return true;
    } catch (e) { console.warn("câmera indisponível", e); return false; }
  }
  stopCamera() { this.stopStream("camera"); }

  stopStream(kind) {
    const st = this[kind];
    if (!st) return;
    const ids = new Set(st.getTracks().map((t) => t.id));
    for (const t of st.getTracks()) t.stop();
    for (const p of this.peers.values()) {
      for (const s of p.pc.getSenders()) if (s.track && ids.has(s.track.id)) p.pc.removeTrack(s);
    }
    this[kind] = null;
    this.onVideo("me", kind, null);
    this.announceAll();
    this.onChange();
  }

  // Sincroniza conexões com a lista de peers do grupo atual
  sync(peerIds) {
    const want = new Set(peerIds);
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.close(id);
    for (const id of want) if (!this.peers.has(id)) this.open(id);
    this.onChange();
  }

  open(peerId) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const audio = document.createElement("audio");
    audio.autoplay = true; audio.dataset.peer = peerId;
    if (this.devices?.out && audio.setSinkId) audio.setSinkId(this.devices.out).catch(() => {});
    this.sink.appendChild(audio);
    // O lado "impolite" (id menor) inicia a negociação; o outro só adiciona as próprias
    // trilhas depois de responder à primeira oferta. Evita colisão na abertura, que no Chrome
    // pode perder os candidatos ICE após o rollback e deixar a conexão parada em "new".
    const polite = this.myId > peerId;
    const entry = { pc, audio, polite, initiator: !polite, ready: !polite, makingOffer: false, ignoreOffer: false, pending: [], analyser: null };
    this.peers.set(peerId, entry);

    pc.onicecandidate = ({ candidate }) => candidate && this.net.emit("rtc:signal", { to: peerId, data: { candidate } });
    pc.ontrack = ({ track, streams }) => {
      if (track.kind === "audio") {
        const ms = streams[0] || new MediaStream([track]);
        audio.srcObject = ms; audio.play().catch(() => {});
        entry.analyser = this.analyserFor(ms);
        this.onAudio(peerId, ms, audio);
      } else {
        const sid = streams[0]?.id;
        const kind = () => this.meta.get(peerId)?.[sid] || "camera";
        const ms = new MediaStream([track]);
        const show = () => this.onVideo(peerId, kind(), ms);
        const hide = () => this.onVideo(peerId, kind(), null);
        if (this.meta.get(peerId)?.[sid]) show();
        else setTimeout(show, 300); // meta pode chegar logo depois do track
        track.onended = hide; track.onmute = hide; track.onunmute = show;
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.net.emit("rtc:signal", { to: peerId, data: { description: pc.localDescription } });
      } catch (e) { console.warn("offer", e); }
      finally { entry.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") pc.restartIce(); this.onChange(); };
    if (entry.initiator) this.attachLocal(entry, peerId);
  }

  // Adiciona ao pc tudo que estou transmitindo (mic, tela, câmera)
  attachLocal(entry, peerId) {
    const { pc } = entry;
    if (this.stream) this.addTracks(pc, this.stream);
    else if (entry.initiator && !pc.getTransceivers().length) pc.addTransceiver("audio", { direction: "recvonly" });
    if (this.screen || this.camera) this.announce(peerId);
    if (this.screen) this.addTracks(pc, this.screen);
    if (this.camera) this.addTracks(pc, this.camera);
  }

  addTracks(pc, stream) {
    for (const t of stream.getTracks()) {
      if (t.kind === "audio") {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) { sender.replaceTrack(t); continue; }
        const tr = pc.getTransceivers().find((x) => x.receiver.track?.kind === "audio" && !x.sender.track && x.direction === "recvonly");
        if (tr) { tr.direction = "sendrecv"; tr.sender.replaceTrack(t); continue; }
      }
      if (!pc.getSenders().some((s) => s.track === t)) pc.addTrack(t, stream);
    }
  }

  // "Perfect negotiation" (padrão MDN)
  async onSignal({ from, data }) {
    const entry = this.peers.get(from);
    if (!entry) return;
    const { pc, polite } = entry;
    try {
      if (data.meta) { this.meta.set(from, data.meta.streams || {}); return; }
      if (data.description) {
        const offerCollision = data.description.type === "offer" && (entry.makingOffer || pc.signalingState !== "stable");
        entry.ignoreOffer = offerCollision && !polite;
        if (entry.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        // candidatos que chegaram antes da descrição remota
        for (const c of entry.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (data.description.type === "offer") {
          await pc.setLocalDescription();
          this.net.emit("rtc:signal", { to: from, data: { description: pc.localDescription } });
          if (!entry.ready) { entry.ready = true; this.attachLocal(entry, from); }
        }
      } else if (data.candidate) {
        if (!pc.remoteDescription) { entry.pending.push(data.candidate); return; }
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!entry.ignoreOffer) throw e; }
      }
    } catch (e) { console.warn("rtc", e); }
  }

  close(peerId) {
    const p = this.peers.get(peerId);
    if (!p) return;
    this.onAudioClose(peerId);
    p.pc.close(); p.audio.remove();
    this.peers.delete(peerId);
    this.speakingNow.delete(peerId);
    this.meta.delete(peerId);
    this.onVideo(peerId, "screen", null); this.onVideo(peerId, "camera", null);
  }

  closeAll() { for (const id of [...this.peers.keys()]) this.close(id); }

  connectedCount() {
    let n = 0;
    for (const p of this.peers.values()) if (p.pc.connectionState === "connected") n++;
    return n;
  }
}

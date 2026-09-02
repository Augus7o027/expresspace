// Voz e tela em malha (mesh) WebRTC. O servidor decide quem fala com quem (voice:group);
// aqui só abrimos/fechamos conexões pra bater com a lista de peers.
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

export class Voice {
  constructor(net, myId, { onChange, onSpeaking, onScreen } = {}) {
    this.net = net;
    this.myId = myId;
    this.peers = new Map(); // peerId -> { pc, audio, video, polite, makingOffer, analyser }
    this.stream = null;      // microfone
    this.screen = null;      // tela compartilhada
    this.muted = true;
    this.canSpeak = true;
    this.onChange = onChange || (() => {});
    this.onSpeaking = onSpeaking || (() => {});
    this.onScreen = onScreen || (() => {});
    this.sink = document.getElementById("audio-sink");
    this.speakingNow = new Map(); // peerId|me -> bool
    net.on("rtc:signal", (m) => this.onSignal(m));
    this.ctx = null;
    setInterval(() => this.pollSpeaking(), 120);
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
    if (this.stream) check("me", this.myAnalyser, this.muted || !this.canSpeak);
    for (const [id, p] of this.peers) if (p.analyser) check(id, p.analyser, false);
  }

  async enableMic() {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.myAnalyser = this.analyserFor(this.stream);
      this.applyMute();
      for (const p of this.peers.values()) this.addTracks(p.pc, this.stream);
      return true;
    } catch (e) { console.warn("mic indisponível", e); return false; }
  }

  setMuted(m) { this.muted = m; this.applyMute(); this.onChange(); }
  setCanSpeak(c) { this.canSpeak = c; this.applyMute(); }
  applyMute() {
    if (!this.stream) return;
    for (const t of this.stream.getAudioTracks()) t.enabled = !this.muted && this.canSpeak;
  }

  // ---------- tela ----------
  async startScreen() {
    if (this.screen) return true;
    try {
      this.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const track = this.screen.getVideoTracks()[0];
      track.onended = () => this.stopScreen();
      for (const p of this.peers.values()) this.addTracks(p.pc, this.screen);
      this.onScreen("me", this.screen);
      this.onChange();
      return true;
    } catch (e) { console.warn("tela indisponível", e); return false; }
  }
  stopScreen() {
    if (!this.screen) return;
    for (const t of this.screen.getTracks()) t.stop();
    for (const p of this.peers.values()) {
      for (const s of p.pc.getSenders()) if (s.track?.kind === "video") { p.pc.removeTrack(s); }
    }
    this.screen = null;
    this.onScreen("me", null);
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
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = document.createElement("audio");
    audio.autoplay = true; audio.dataset.peer = peerId;
    this.sink.appendChild(audio);
    const entry = { pc, audio, polite: this.myId > peerId, makingOffer: false, ignoreOffer: false, pending: [], analyser: null };
    this.peers.set(peerId, entry);

    pc.onicecandidate = ({ candidate }) => candidate && this.net.emit("rtc:signal", { to: peerId, data: { candidate } });
    pc.ontrack = ({ track, streams }) => {
      if (track.kind === "audio") {
        const ms = streams[0] || new MediaStream([track]);
        audio.srcObject = ms; audio.play().catch(() => {});
        entry.analyser = this.analyserFor(ms);
      } else {
        const ms = new MediaStream([track]);
        this.onScreen(peerId, ms);
        track.onended = () => this.onScreen(peerId, null);
        track.onmute = () => this.onScreen(peerId, null);
        track.onunmute = () => this.onScreen(peerId, ms);
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
    if (this.stream) this.addTracks(pc, this.stream);
    else pc.addTransceiver("audio", { direction: "recvonly" });
    if (this.screen) this.addTracks(pc, this.screen);
  }

  addTracks(pc, stream) {
    for (const t of stream.getTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === t.kind);
      if (sender) sender.replaceTrack(t);
      else {
        const tr = pc.getTransceivers().find((x) => x.receiver.track?.kind === t.kind && !x.sender.track && x.direction === "recvonly");
        if (tr) { tr.direction = "sendrecv"; tr.sender.replaceTrack(t); }
        else pc.addTrack(t, stream);
      }
    }
  }

  // "Perfect negotiation" (padrão MDN)
  async onSignal({ from, data }) {
    const entry = this.peers.get(from);
    if (!entry) return;
    const { pc, polite } = entry;
    try {
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
    p.pc.close(); p.audio.remove();
    this.peers.delete(peerId);
    this.speakingNow.delete(peerId);
    this.onScreen(peerId, null);
  }

  closeAll() { for (const id of [...this.peers.keys()]) this.close(id); }

  connectedCount() {
    let n = 0;
    for (const p of this.peers.values()) if (p.pc.connectionState === "connected") n++;
    return n;
  }
}

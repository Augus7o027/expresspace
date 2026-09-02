// Voz em malha (mesh) WebRTC. O servidor decide quem fala com quem (voice:group);
// aqui só abrimos/fechamos conexões pra bater com a lista de peers.
const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export class Voice {
  constructor(net, myId, { onChange } = {}) {
    this.net = net;
    this.myId = myId;
    this.peers = new Map(); // peerId -> { pc, audio }
    this.stream = null;
    this.muted = true;
    this.canSpeak = true;
    this.onChange = onChange || (() => {});
    this.sink = document.getElementById("audio-sink");
    net.on("rtc:signal", (m) => this.onSignal(m));
  }

  async enableMic() {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      this.applyMute();
      for (const [id, p] of this.peers) this.addTracks(p.pc);
      return true;
    } catch (e) {
      console.warn("mic indisponível", e);
      return false;
    }
  }

  setMuted(m) { this.muted = m; this.applyMute(); this.onChange(); }
  setCanSpeak(c) { this.canSpeak = c; this.applyMute(); }
  applyMute() {
    if (!this.stream) return;
    for (const t of this.stream.getAudioTracks()) t.enabled = !this.muted && this.canSpeak;
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
    const entry = { pc, audio, polite: this.myId > peerId, makingOffer: false };
    this.peers.set(peerId, entry);

    pc.onicecandidate = ({ candidate }) => candidate && this.net.emit("rtc:signal", { to: peerId, data: { candidate } });
    pc.ontrack = ({ streams }) => { audio.srcObject = streams[0]; audio.play().catch(() => {}); };
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.net.emit("rtc:signal", { to: peerId, data: { description: pc.localDescription } });
      } finally { entry.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") pc.restartIce(); this.onChange(); };
    if (this.stream) this.addTracks(pc);
    else pc.addTransceiver("audio", { direction: "recvonly" });
  }

  addTracks(pc) {
    for (const t of this.stream.getTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === t.kind);
      if (sender) sender.replaceTrack(t);
      else {
        const tr = pc.getTransceivers().find((x) => x.receiver.track?.kind === "audio" && !x.sender.track);
        if (tr) { tr.direction = "sendrecv"; tr.sender.replaceTrack(t); }
        else pc.addTrack(t, this.stream);
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
        if (offerCollision && !polite) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === "offer") {
          await pc.setLocalDescription();
          this.net.emit("rtc:signal", { to: from, data: { description: pc.localDescription } });
        }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!polite) throw e; }
      }
    } catch (e) { console.warn("rtc", e); }
  }

  close(peerId) {
    const p = this.peers.get(peerId);
    if (!p) return;
    p.pc.close(); p.audio.remove();
    this.peers.delete(peerId);
  }

  connectedCount() {
    let n = 0;
    for (const p of this.peers.values()) if (p.pc.connectionState === "connected") n++;
    return n;
  }
}

// Voz, câmera e tela pelo LiveKit (SFU) no lugar da malha. Mesma interface da classe Voice:
// o resto do app não sabe a diferença. O servidor manda, junto do grupo de voz, a sala e o token.
// Dentro da sala "open" (área aberta) assinamos só quem está no nosso grupo de proximidade.
import { Room, RoomEvent, Track, ConnectionState } from "livekit-client";
import { Voice } from "./voice.js";

export class VoiceLive extends Voice {
  constructor(net, myId, opts = {}) {
    super(net, myId, opts);
    this.url = opts.liveUrl; this.live = true;
    this.room = null; this.roomName = null; this.token = null;
    this.want = new Set();          // peers do grupo atual (a quem assinar)
    this.pubs = { mic: null, camera: null, screen: null }; // publicações locais
    this.connecting = null;
    this.remoteAudio = new Map();   // peerId -> { audio, stream }
  }

  // a malha tinha watchdog e sinalização; aqui nada disso
  watchdog() {}
  onSignal() {}
  open() {}
  close(peerId) { this.detach(peerId); this.peers.delete(peerId); this.speakingNow.delete(peerId); }

  // ---------- sala ----------
  // sync(peerIds, live) : live = { room, token } vindo do servidor; sem live = fora de qualquer sala
  async sync(peerIds, live) {
    this.want = new Set(peerIds);
    if (!live?.room) { await this.leave(); this.onChange(); return; }
    if (this.roomName !== live.room) await this.join(live.room, live.token);
    else this.token = live.token;
    this.applySubscriptions();
    this.onChange();
  }

  async join(name, token) {
    await this.leave();
    const room = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: false, stopMicTrackOnMute: false, audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true } });
    this.room = room; this.roomName = name; this.token = token;
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => this.onTrack(track, pub, participant));
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => this.offTrack(track, pub, participant));
    room.on(RoomEvent.ParticipantConnected, () => { this.applySubscriptions(); this.onChange(); });
    room.on(RoomEvent.TrackPublished, () => this.applySubscriptions());
    // subiu no palco: o servidor liberou a publicação ao vivo; publica o mic que já estava ligado
    room.on(RoomEvent.ParticipantPermissionsChanged, () => { if (room.localParticipant.permissions?.canPublish && this.canSpeak && this.stream && !this.pubs.mic) this.publishMic(); });
    room.on(RoomEvent.ParticipantDisconnected, (p) => { this.close(p.identity); this.onChange(); });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const on = new Set(speakers.map((s) => s.identity));
      for (const id of this.want) { const v = on.has(id); if (this.speakingNow.get(id) !== v) { this.speakingNow.set(id, v); this.onSpeaking(id, v); } }
    });
    room.on(RoomEvent.ConnectionStateChanged, () => this.onChange());
    room.on(RoomEvent.Disconnected, () => { if (this.room === room) { this.room = null; this.roomName = null; for (const id of [...this.peers.keys()]) this.close(id); this.onChange(); } });
    room.on(RoomEvent.MediaDevicesError, (e) => console.warn("livekit devices", e));
    this.connecting = room.connect(this.url, token, { autoSubscribe: false }).then(async () => {
      if (this.room !== room) return;
      await this.publishAll();
      this.applySubscriptions();
    }).catch((e) => { console.warn("livekit connect", e); this.onLinkTrouble?.("sala"); });
    await this.connecting;
  }

  async leave() {
    const room = this.room; if (!room) return;
    this.room = null; this.roomName = null; this.token = null;
    for (const id of [...this.peers.keys()]) this.close(id);
    this.pubs = { mic: null, camera: null, screen: null };
    try { await room.disconnect(true); } catch {}
  }

  // assina só quem está no grupo; na sala "open" isso é o que separa as conversas
  applySubscriptions() {
    const room = this.room; if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      const inGroup = this.want.has(p.identity);
      if (inGroup && !this.peers.has(p.identity)) this.peers.set(p.identity, { pc: { get connectionState() { return "connected"; } }, live: true });
      if (!inGroup && this.peers.has(p.identity)) this.close(p.identity);
      for (const pub of p.trackPublications.values()) { if (pub.isSubscribed !== inGroup) pub.setSubscribed(inGroup); }
    }
  }

  onTrack(track, pub, participant) {
    const id = participant.identity;
    if (track.kind === Track.Kind.Audio) {
      const audio = document.createElement("audio"); audio.autoplay = true; audio.dataset.peer = id;
      if (this.devices?.out && audio.setSinkId) audio.setSinkId(this.devices.out).catch(() => {});
      this.sink.appendChild(audio);
      track.attach(audio);
      const stream = new MediaStream([track.mediaStreamTrack]);
      this.remoteAudio.set(id, { audio, stream, track });
      const e = this.peers.get(id) || { pc: { connectionState: "connected" }, live: true }; e.audio = audio; this.peers.set(id, e);
      this.onAudio(id, stream, audio);
    } else {
      const kind = pub.source === Track.Source.ScreenShare ? "screen" : "camera";
      this.onVideo(id, kind, new MediaStream([track.mediaStreamTrack]));
      track.on?.("muted", () => this.onVideo(id, kind, null)); track.on?.("unmuted", () => this.onVideo(id, kind, new MediaStream([track.mediaStreamTrack])));
    }
  }
  offTrack(track, pub, participant) {
    const id = participant.identity;
    if (track.kind === Track.Kind.Audio) this.detach(id);
    else this.onVideo(id, pub.source === Track.Source.ScreenShare ? "screen" : "camera", null);
  }
  detach(id) {
    const r = this.remoteAudio.get(id); if (!r) return;
    try { r.track.detach(r.audio); } catch {} r.audio.remove();
    this.remoteAudio.delete(id); this.onAudioClose(id);
    this.onVideo(id, "screen", null); this.onVideo(id, "camera", null);
  }

  // ---------- publicação local ----------
  async publishAll() {
    if (this.stream) await this.publishMic();
    if (this.camera) await this.publishVideo("camera", this.camera.getVideoTracks()[0]);
    if (this.screen) await this.publishVideo("screen", this.screen.getVideoTracks()[0]);
  }
  async publishMic() {
    const room = this.room; if (!room || !this.stream || this.pubs.mic) return;
    const t = this.stream.getAudioTracks()[0]; if (!t) return;
    try { this.pubs.mic = await room.localParticipant.publishTrack(t, { source: Track.Source.Microphone, name: "mic", dtx: true, red: true }); }
    catch (e) { if (!/permission|not allowed/i.test(String(e))) console.warn("publish mic", e); }
    this.applyMute();
  }
  async publishVideo(kind, track) {
    const room = this.room; if (!room || !track || this.pubs[kind]) return;
    try { this.pubs[kind] = await room.localParticipant.publishTrack(track, { source: kind === "screen" ? Track.Source.ScreenShare : Track.Source.Camera, name: kind, simulcast: true }); }
    catch (e) { console.warn("publish " + kind, e); }
  }
  async unpublish(kind) {
    const pub = this.pubs[kind]; this.pubs[kind] = null;
    if (pub && this.room) { try { await this.room.localParticipant.unpublishTrack(pub.track, false); } catch {} }
  }

  async enableMic() {
    const ok = await super.enableMic();
    if (ok) await this.publishMic();
    return ok;
  }
  // sem permissão de publicar (plateia do palco) o track fica desligado; a permissão nova chega pelo servidor
  applyMute() {
    super.applyMute();
    const lp = this.room?.localParticipant; if (!lp) return;
    if (this.pubs.mic) { const pub = this.pubs.mic; if (this.muted || !this.canSpeak) pub.mute?.(); else pub.unmute?.(); }
  }
  setCanSpeak(c) { super.setCanSpeak(c); if (c && this.stream && !this.pubs.mic) this.publishMic(); }

  async startScreen() {
    if (this.screen) return true;
    try {
      this.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      this.screen.getVideoTracks()[0].onended = () => this.stopScreen();
      await this.publishVideo("screen", this.screen.getVideoTracks()[0]);
      this.onVideo("me", "screen", this.screen); this.onChange();
      return true;
    } catch (e) { console.warn("tela indisponível", e); return false; }
  }
  async startCamera() {
    if (this.camera) return true;
    try {
      this.camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 24, ...(this.devices?.cam ? { deviceId: { exact: this.devices.cam } } : { facingMode: "user" }) }, audio: false });
      this.camera.getVideoTracks()[0].onended = () => this.stopCamera();
      await this.publishVideo("camera", this.camera.getVideoTracks()[0]);
      this.onVideo("me", "camera", this.camera); this.onChange();
      return true;
    } catch (e) { console.warn("câmera indisponível", e); return false; }
  }
  stopStream(kind) {
    const st = this[kind]; if (!st) return;
    this.unpublish(kind);
    for (const t of st.getTracks()) t.stop();
    this[kind] = null; this.onVideo("me", kind, null); this.onChange();
  }

  // trocar o microfone: a malha religa a fonte no grafo; o track publicado continua o mesmo (dest.stream)
  async setMicDevice(id) {
    const ok = await super.setMicDevice(id);
    if (ok && this.stream && this.pubs.mic && this.pubs.mic.track?.mediaStreamTrack !== this.stream.getAudioTracks()[0]) { await this.unpublish("mic"); await this.publishMic(); }
    return ok;
  }

  closeAll() { this.leave(); }
  connectedCount() { return this.room?.state === ConnectionState.Connected ? [...this.peers.keys()].filter((id) => this.room.remoteParticipants.has(id)).length : 0; }
  get connected() { return this.room?.state === ConnectionState.Connected; }
}

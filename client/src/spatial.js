// Áudio espacial: voz dos outros e sons do ambiente ficam mais baixos e "mais pro lado" conforme a distância.
// Um único AudioContext (compartilhado com voice.js). Se o navegador não deixar rotear a voz pelo
// Web Audio, cai pro volume do <audio> (sem pan).
export class Spatial {
  constructor(ctx) {
    this.ctx = ctx;
    this.peers = new Map();     // peerId -> { src, gain, pan, audio, ok }
    this.emitters = [];         // { kind, x, y, gain, pan, nodes }
    this.master = ctx.createGain(); this.master.gain.value = 1; this.master.connect(ctx.destination);
    this.ambientGain = ctx.createGain(); this.ambientGain.gain.value = 1; this.ambientGain.connect(this.master);
    this.enabled = true;
  }

  // ---------- voz dos peers ----------
  attachPeer(peerId, stream, audioEl) {
    this.detachPeer(peerId);
    const e = { audio: audioEl, ok: false, target: 1, targetPan: 0 };
    try {
      e.src = this.ctx.createMediaStreamSource(stream);
      e.gain = this.ctx.createGain(); e.pan = this.ctx.createStereoPanner();
      e.src.connect(e.gain).connect(e.pan).connect(this.master);
      audioEl.muted = true; // o elemento continua tocando (Chrome exige) mas sem som; o som sai pelo grafo
      e.ok = true;
    } catch { e.ok = false; audioEl.muted = false; }
    this.peers.set(peerId, e);
  }
  detachPeer(peerId) {
    const e = this.peers.get(peerId); if (!e) return;
    try { e.src?.disconnect(); e.gain?.disconnect(); e.pan?.disconnect(); } catch {}
    this.peers.delete(peerId);
  }
  // gain 0..1, pan -1..1 (suavizado pra não estalar)
  setPeer(peerId, gain, pan) {
    const e = this.peers.get(peerId); if (!e) return;
    const t = this.ctx.currentTime;
    if (e.ok) { e.gain.gain.setTargetAtTime(gain, t, 0.08); e.pan.pan.setTargetAtTime(pan, t, 0.08); }
    else e.audio.volume = Math.max(0, Math.min(1, gain));
  }

  // ---------- sons do ambiente (sintetizados) ----------
  addEmitter(kind, x, y) {
    const g = this.ctx.createGain(); g.gain.value = 0;
    const p = this.ctx.createStereoPanner(); g.connect(p).connect(this.ambientGain);
    const nodes = kind === "coffee" ? this.makeCoffee(g) : kind === "radio" ? this.makeRadio(g) : kind === "cooler" ? this.makeCooler(g) : kind === "garden" ? this.makeGarden(g) : kind === "fire" ? this.makeFire(g) : null;
    if (!nodes) return;
    this.emitters.push({ kind, x, y, gain: g, pan: p, nodes, reach: kind === "radio" ? 9 : kind === "garden" ? 12 : 6, vol: kind === "radio" ? 0.5 : kind === "garden" ? 0.35 : 0.4 });
  }
  noise(color = "brown") {
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start();
    return s;
  }
  makeCoffee(out) {
    // zumbido grave contínuo + borbulhas de vez em quando
    const hum = this.noise("brown"); const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
    const hg = this.ctx.createGain(); hg.gain.value = 0.35; hum.connect(lp).connect(hg).connect(out);
    const bubble = () => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = "sine";
      const t = this.ctx.currentTime, f = 300 + Math.random() * 400;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
      this.timers.push(setTimeout(bubble, 900 + Math.random() * 2600));
    };
    this.timers ??= []; this.timers.push(setTimeout(bubble, 1200));
    return { hum };
  }
  makeFire(out) {
    // fogueira: ruído grave abafado + estalos
    const n = this.noise("brown"); const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
    const g = this.ctx.createGain(); g.gain.value = 0.5; n.connect(lp).connect(g).connect(out);
    const pop = () => {
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), pg = this.ctx.createGain(); o.type = "square"; o.frequency.value = 900 + Math.random() * 1500;
      pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(0.08, t + 0.005); pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(pg).connect(out); o.start(t); o.stop(t + 0.04);
      this.timers.push(setTimeout(pop, 150 + Math.random() * 900));
    };
    this.timers ??= []; this.timers.push(setTimeout(pop, 500));
    return { n };
  }
  makeCooler(out) {
    const hum = this.noise("brown"); const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 140;
    const hg = this.ctx.createGain(); hg.gain.value = 0.4; hum.connect(lp).connect(hg).connect(out);
    return { hum };
  }
  makeGarden(out) {
    // vento (ruído filtrado que respira) + passarinho de vez em quando
    const wind = this.noise("white"); const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 0.5;
    const wg = this.ctx.createGain(); wg.gain.value = 0.05; wind.connect(bp).connect(wg).connect(out);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12; const lg = this.ctx.createGain(); lg.gain.value = 0.03; lfo.connect(lg).connect(wg.gain); lfo.start();
    const bird = () => {
      const t = this.ctx.currentTime;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = "sine";
        const f = 2200 + Math.random() * 1200, st = t + i * 0.16;
        o.frequency.setValueAtTime(f, st); o.frequency.exponentialRampToValueAtTime(f * 1.4, st + 0.06); o.frequency.exponentialRampToValueAtTime(f * 0.9, st + 0.12);
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.12, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.13);
        o.connect(g).connect(out); o.start(st); o.stop(st + 0.15);
      }
      this.timers.push(setTimeout(bird, 3000 + Math.random() * 7000));
    };
    this.timers ??= []; this.timers.push(setTimeout(bird, 2000));
    return { wind, lfo };
  }
  makeRadio(out) {
    // "rádio" lo-fi: arpejo lento em ondas triangulares, abafado por lowpass, com trêmulo
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const trem = this.ctx.createGain(); trem.gain.value = 0.8;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5; const lg = this.ctx.createGain(); lg.gain.value = 0.15; lfo.connect(lg).connect(trem.gain); lfo.start();
    lp.connect(trem).connect(out);
    const scale = [220, 261.6, 329.6, 392, 440, 523.3, 392, 329.6];
    let step = 0;
    const note = () => {
      const t = this.ctx.currentTime, f = scale[step++ % scale.length] * (step % 16 < 8 ? 1 : 0.75);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(lp); o.start(t); o.stop(t + 0.6);
      const bass = this.ctx.createOscillator(), bg = this.ctx.createGain(); bass.type = "sine"; bass.frequency.value = f / 4;
      if (step % 2 === 1) { bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.3, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); bass.connect(bg).connect(lp); bass.start(t); bass.stop(t + 0.45); }
      this.timers.push(setTimeout(note, 320));
    };
    this.timers ??= []; this.timers.push(setTimeout(note, 500));
    return { lfo };
  }

  // atualiza volumes/pan de tudo a partir da posição do ouvinte (em tiles)
  update(lx, ly, { proximityRadius = 3.2, positions = new Map(), spatialPeers = true } = {}) {
    const t = this.ctx.currentTime;
    for (const [id, e] of this.peers) {
      const p = positions.get(id);
      let gain = 1, pan = 0;
      if (spatialPeers && p) {
        const dx = p.x - lx, dy = p.y - ly, d = Math.hypot(dx, dy);
        // perto: cheio; até o raio de proximidade cai pra 35%; fora do raio (ainda no grupo por transitividade) 25%
        gain = d < 1.2 ? 1 : d <= proximityRadius ? 1 - 0.65 * ((d - 1.2) / (proximityRadius - 1.2)) : 0.25;
        pan = Math.max(-0.7, Math.min(0.7, dx / proximityRadius));
      }
      this.setPeer(id, gain, pan);
    }
    for (const em of this.emitters) {
      const dx = em.x - lx, dy = em.y - ly, d = Math.hypot(dx, dy);
      const g = !this.enabled || d > em.reach ? 0 : em.vol * Math.pow(1 - d / em.reach, 1.6);
      em.gain.gain.setTargetAtTime(g, t, 0.15);
      em.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, dx / em.reach)), t, 0.15);
    }
  }
  setEnabled(v) { this.enabled = v; }
}

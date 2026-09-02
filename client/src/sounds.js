// Sons curtos sintetizados (sem arquivos). Tudo passa por um único AudioContext.
let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, { type = "sine", gain = 0.08, delay = 0 } = {}) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + delay);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.05);
}

export const sounds = {
  setEnabled(v) { enabled = v; },
  get enabled() { return enabled; },
  unlock() { try { ac(); } catch {} },
  message() { if (enabled) { tone(880, 0.12); tone(1320, 0.14, { delay: 0.08 }); } },
  mention() { if (enabled) { tone(660, 0.1); tone(990, 0.1, { delay: 0.1 }); tone(1320, 0.18, { delay: 0.2 }); } },
  nearby() { if (enabled) { tone(523, 0.16, { type: "triangle" }); tone(784, 0.2, { type: "triangle", delay: 0.12 }); } },
  leave() { if (enabled) { tone(784, 0.12, { type: "triangle" }); tone(523, 0.18, { type: "triangle", delay: 0.1 }); } },
  join() { if (enabled) tone(1046, 0.08, { gain: 0.05 }); },
};

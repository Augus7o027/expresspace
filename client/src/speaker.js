// Caixa de som: toca o YouTube da sala em que você está (IFrame API), sincronizado pelo startedAt do
// servidor, com volume caindo pela distância até a caixa. Só carrega a API quando alguma sala está tocando.
let apiReady = null;
function loadApi() {
  if (apiReady) return apiReady;
  apiReady = new Promise((res) => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => res(null); document.head.appendChild(s);
  });
  return apiReady;
}

export class Speaker {
  constructor(mountEl, { onState, onEnded } = {}) {
    this.mount = mountEl; this.onState = onState; this.onEnded = onEnded;
    this.player = null; this.ready = false; this.current = null; // { id, state }
    this.volume = 0.8; this.muted = false; this.dist = 1; this.blocked = false;
    this.pending = null;
    this.clockOffset = 0;   // relógio do servidor - relógio daqui (pra sincronizar sem depender do relógio do PC)
    this.isLive = false;    // transmissão ao vivo: não tem posição pra sincronizar
    this.lastSeek = 0; this.loaded = null;
  }
  // chamado com o Date.now() do servidor sempre que chega algo dele
  setServerTime(t) { if (Number.isFinite(t)) this.clockOffset = t - Date.now(); }
  // volume pelo usuário (0..1)
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.apply(); }
  setMuted(m) { this.muted = !!m; this.apply(); }
  // fator pela distância até a caixa (0..1) — chamado a cada tick pela cena
  setDistance(f) { const nf = Math.max(0, Math.min(1, f)); if (Math.abs(nf - this.dist) > 0.02) { this.dist = nf; this.apply(); } }
  apply() {
    if (!this.player || !this.ready) return;
    try {
      const v = Math.round(this.volume * this.dist * 100);
      this.player.setVolume(v);
      if (this.muted) this.player.mute(); else this.player.unMute();
    } catch {}
  }
  expectedTime(state) { return (state.start || 0) + (Date.now() + this.clockOffset - state.startedAt) / 1000; }

  async play(id, state) {
    // mesma música (só a fila mudou, ou reentrou na sala): não recarrega, só ressincroniza
    const same = this.current && this.current.id === id && this.current.state.videoId === state.videoId && this.current.state.startedAt === state.startedAt;
    this.current = { id, state };
    if (same && this.player) { this.sync(); return; }
    this.pending = state; this.isLive = false; this.lastSeek = 0; this.loaded = state.videoId;
    const YT = await loadApi(); if (!YT) { this.onState?.("erro"); return; }
    if (this.current?.state !== state) return; // trocou enquanto carregava
    if (!this.player) {
      this.player = new YT.Player(this.mount, {
        width: 160, height: 90, videoId: state.videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(this.expectedTime(state)), origin: location.origin },
        events: {
          onReady: () => { this.ready = true; this.apply(); this.sync(true); this.onState?.("carregando"); },
          onStateChange: (e) => {
            const S = YT.PlayerState;
            if (e.data === S.PLAYING) { this.blocked = false; this.isLive = !(this.player.getDuration() > 0); this.onState?.("tocando"); }
            else if (e.data === S.ENDED) { this.onState?.("acabou"); if (this.current) this.onEnded?.(this.current.id, this.current.state); }
            else if (e.data === S.PAUSED && this.current) { /* pausa do navegador/usuário: tenta retomar no próximo sync */ this.onState?.("pausado"); }
            else if (e.data === S.UNSTARTED || e.data === S.CUED) { this.onState?.("carregando"); }
          },
          onError: () => this.onState?.("erro"),
        },
      });
      this.timer = setInterval(() => this.sync(), 6000);
      return;
    }
    try { this.player.loadVideoById({ videoId: state.videoId, startSeconds: Math.floor(this.expectedTime(state)) }); this.onState?.("carregando"); } catch {}
  }
  // re-sincroniza com o servidor (drift > 3s) e tenta retomar se o autoplay foi bloqueado
  sync(force = false) {
    if (!this.player || !this.ready || !this.current) return;
    try {
      const S = window.YT.PlayerState, st = this.player.getPlayerState();
      const dur = this.player.getDuration() || 0; this.isLive = st === S.PLAYING && dur === 0;
      const want = this.expectedTime(this.current.state), have = this.player.getCurrentTime() || 0;
      // ao vivo não tem "posição"; vídeo normal só corrige desvio grande, no máximo uma vez a cada 20s, e nunca além do fim
      const canSeek = !this.isLive && (dur === 0 || want < dur - 2) && Date.now() - this.lastSeek > 20000;
      if (st === S.PLAYING && canSeek && Math.abs(want - have) > 4) { this.lastSeek = Date.now(); this.player.seekTo(want, true); }
      if (st !== S.PLAYING && st !== S.ENDED && st !== S.BUFFERING) {
        if (force || st === S.UNSTARTED || st === S.CUED || st === S.PAUSED) { if (canSeek && !this.isLive && dur > 0) this.player.seekTo(want, true); this.player.playVideo(); }
        // se continuar parado depois de um tempo, o navegador bloqueou o autoplay: pede um toque
        setTimeout(() => { try { if (this.current && this.player.getPlayerState() !== S.PLAYING && this.player.getPlayerState() !== S.BUFFERING) { this.blocked = true; this.onState?.("bloqueado"); } } catch {} }, 1500);
      }
    } catch {}
  }
  // toque do usuário (botão "tocar"): destrava autoplay
  resume() { try { this.player?.unMute(); this.player?.playVideo(); this.muted = false; this.apply(); } catch {} }
  stop() {
    this.current = null; this.pending = null;
    try { this.player?.stopVideo(); } catch {}
    this.onState?.(null);
  }
  get playing() { try { return this.player?.getPlayerState() === window.YT?.PlayerState?.PLAYING; } catch { return false; } }
}

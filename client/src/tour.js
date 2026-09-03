// Tour de primeira vez (~20s): andar → ir até o Mural → apertar E → falar/escrever.
// Cada passo espera uma ação real; o card fica no canto e o mapa ganha um marcador.
const $ = (s) => document.querySelector(s);

export function startTour({ scene, map, state, onDone, hasMic }) {
  const box = $("#tour"), title = $("#tour-title"), text = $("#tour-text"), stepEl = $("#tour-step"), next = $("#tour-next"), skip = $("#tour-skip");
  const mural = (map.objects || []).find((o) => o.kind === "info") || map.objects?.[0];
  const spawn = { ...scene.pos };
  const mobile = document.body.classList.contains("mobile");
  let timer = null, i = 0, done = false;
  const STEPS = [
    { title: "Bem-vindo(a). Vamos andar.", text: mobile ? "Arraste o joystick no canto pra andar (empurrando mais longe, corre)." : "Use W A S D ou as setas pra andar. Segure Shift pra correr.", check: () => Math.hypot(scene.pos.x - spawn.x, scene.pos.y - spawn.y) > 2 },
    { title: "Vá até o marcador.", text: `Chegue perto do ${mural?.label || "Mural"} — objetos com brilho são interativos.`, enter: () => mural && scene.setMarker(mural.x + Math.floor(mural.w / 2), mural.y + mural.h), check: () => state.nearObject && state.nearObject.id === mural?.id, leave: () => scene.clearMarker() },
    { title: mobile ? "Toque em \"Ler\"." : "Aperte E.", text: mobile ? "O botão que apareceu embaixo abre o objeto. Serve pra quadros, telão, caixa de som e agentes." : "E abre o que estiver perto: quadros, telão, caixa de som, agentes de IA. Esc fecha.", check: () => !$("#modal").classList.contains("hidden"), after: () => new Promise((r) => { const t = setInterval(() => { if ($("#modal").classList.contains("hidden")) { clearInterval(t); r(); } }, 200); }) },
    { title: "Agora é só conversar.", text: (hasMic() ? "Seu microfone está ligado: chegou perto de alguém, a voz conecta sozinha. " : "M liga o microfone: chegou perto de alguém, a voz conecta sozinha. ") + (mobile ? "O balão embaixo abre o chat." : "Enter abre o chat; @nome menciona alguém."), manual: true },
  ];
  const show = () => {
    const s = STEPS[i];
    stepEl.textContent = `${i + 1} / ${STEPS.length}`; title.textContent = s.title; text.textContent = s.text;
    next.classList.toggle("hidden", !s.manual); next.textContent = i === STEPS.length - 1 ? "concluir" : "próximo";
    box.classList.remove("hidden");
    s.enter?.();
  };
  const finish = () => { if (done) return; done = true; clearInterval(timer); STEPS[i]?.leave?.(); scene.clearMarker(); box.classList.add("hidden"); onDone?.(); };
  const advance = async () => { const s = STEPS[i]; s.leave?.(); if (s.after) await s.after(); i++; if (i >= STEPS.length) return finish(); show(); };
  // relógio: checa o passo atual; reinicia depois de um passo assíncrono
  const loop = () => { clearInterval(timer); timer = setInterval(() => { if (done) return; const s = STEPS[i]; if (s.check && s.check()) { clearInterval(timer); advance().then(loop); } }, 250); };
  loop();
  next.onclick = () => advance().then(loop);
  skip.onclick = finish;
  show();
  return { finish };
}

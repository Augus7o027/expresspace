// Controles de celular: joystick virtual, barra de ações e gavetas (canais / chat).
// Só liga quando a tela é estreita ou o ponteiro é "coarse" (dedo).
export const isMobile = () => matchMedia("(max-width: 820px), (pointer: coarse) and (max-width: 1100px)").matches;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Joystick: arrasta o dedo dentro do círculo; devolve um vetor -1..1 pra cena
export function mountJoystick(el, onVec) {
  const knob = el.querySelector("#joy-knob");
  const R = 34; let active = null;
  const set = (dx, dy) => {
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const nx = (dx * k) / R, ny = (dy * k) / R;
    onVec(Math.hypot(nx, ny) < 0.18 ? null : { x: nx, y: ny, run: d > R * 1.35 });
  };
  el.addEventListener("pointerdown", (e) => {
    active = e.pointerId; el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect(); el.cx = r.left + r.width / 2; el.cy = r.top + r.height / 2;
    set(e.clientX - el.cx, e.clientY - el.cy);
  });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === active) set(e.clientX - el.cx, e.clientY - el.cy); });
  const up = (e) => { if (e.pointerId !== active) return; active = null; knob.style.transform = ""; onVec(null); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}

// Gavetas: abre uma, fecha a outra; backdrop fecha
export function drawers({ sidebar, chat, backdrop, onOpenChat }) {
  const closeAll = () => { sidebar.classList.remove("open"); chat.classList.remove("open"); backdrop.classList.add("hidden"); };
  const open = (which) => {
    const el = which === "chat" ? chat : sidebar, other = which === "chat" ? sidebar : chat;
    const willOpen = !el.classList.contains("open");
    other.classList.remove("open"); el.classList.toggle("open", willOpen); backdrop.classList.toggle("hidden", !willOpen);
    if (willOpen && which === "chat") onOpenChat?.();
  };
  backdrop.onclick = closeAll;
  return { open, closeAll, isOpen: (which) => (which === "chat" ? chat : sidebar).classList.contains("open") };
}

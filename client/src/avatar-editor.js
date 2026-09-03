// Editor de avatar: preview grande + seletores. Usado no login e no modal "Editar avatar".
import { SKINS, HAIR_COLORS, HAIRS, SHIRTS, ACCESSORIES, BODIES, OUTFITS, PANTS_COLORS, SHOES_COLORS, DEFAULT_AVATAR, normalizeAvatar, drawPreview } from "./sprites.js";

// opts.premium: libera o corpo Orc (skin premium). Sem isso o botão aparece travado.
export function mountAvatarEditor(root, initial, onChange, opts = {}) {
  const a = normalizeAvatar(initial || DEFAULT_AVATAR);
  root.innerHTML = "";
  root.className = "avatar-editor";

  const preview = document.createElement("div"); preview.className = "avatar-preview";
  const canvas = document.createElement("canvas");
  preview.appendChild(canvas);
  const turn = document.createElement("div"); turn.className = "avatar-turn";
  let dir = 0; const DIRS = ["down", "left", "up", "right"];
  const mk = (t, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = fn; return b; };
  turn.append(mk("‹", () => { dir = (dir + 3) % 4; paint(); }), mk("›", () => { dir = (dir + 1) % 4; paint(); }));
  preview.appendChild(turn);

  const controls = document.createElement("div"); controls.className = "avatar-controls";
  const LABELS = { hair: HAIRS, accessory: ACCESSORIES, body: BODIES, outfit: OUTFITS };
  const rows = {};
  const row = (label, count, key, colors, locked = () => false) => {
    const r = document.createElement("div"); r.className = "avatar-row"; rows[key] = r;
    const l = document.createElement("div"); l.className = "mono dim"; l.textContent = label; r.appendChild(l);
    const opts = document.createElement("div"); opts.className = "avatar-opts";
    for (let i = 0; i < count; i++) {
      const b = document.createElement("button"); b.type = "button"; b.className = "avatar-opt";
      if (colors) b.style.background = colors[i]; else b.textContent = LABELS[key][i];
      if (locked(i)) { b.classList.add("locked"); b.title = "skin premium: disponível pra professores e membros premium"; b.textContent += " 🔒"; }
      b.classList.toggle("active", a[key] === i);
      b.onclick = () => { if (locked(i)) return; a[key] = i; [...opts.children].forEach((c, j) => c.classList.toggle("active", j === i)); paint(); onChange?.({ ...a }); };
      opts.appendChild(b);
    }
    r.appendChild(opts); controls.appendChild(r);
  };
  row("corpo", BODIES.length, "body", null, (i) => i === 1 && !opts.premium);
  row("pele", SKINS.length, "skin", SKINS);
  row("cabelo", HAIRS.length, "hair", null);
  row("cor do cabelo", HAIR_COLORS.length, "hairColor", HAIR_COLORS);
  row("roupa", OUTFITS.length, "outfit", null);
  row("cor da roupa", SHIRTS.length, "shirt", SHIRTS);
  row("calça", PANTS_COLORS.length, "pants", PANTS_COLORS);
  row("sapato", SHOES_COLORS.length, "shoes", SHOES_COLORS);
  row("acessório", ACCESSORIES.length, "accessory", null);
  const rnd = document.createElement("button"); rnd.type = "button"; rnd.className = "avatar-random"; rnd.textContent = "🎲 aleatório";
  rnd.onclick = () => {
    const pick = (n) => Math.floor(Math.random() * n);
    Object.assign(a, { skin: pick(SKINS.length), hair: pick(HAIRS.length), hairColor: pick(HAIR_COLORS.length), shirt: pick(SHIRTS.length), outfit: pick(OUTFITS.length), pants: pick(PANTS_COLORS.length), shoes: pick(SHOES_COLORS.length), accessory: pick(ACCESSORIES.length) });
    for (const k of Object.keys(rows)) [...rows[k].querySelectorAll(".avatar-opt")].forEach((c, j) => c.classList.toggle("active", a[k] === j));
    paint(); onChange?.({ ...a });
  };
  controls.appendChild(rnd);

  root.append(preview, controls);
  function paint() {
    drawPreview(canvas, a, DIRS[dir], 5);
    for (const k of ["skin", "hair", "hairColor", "outfit", "shirt", "pants", "shoes", "accessory"]) rows[k].classList.toggle("hidden", a.body === 1); // orc não tem recolorização
    rnd.classList.toggle("hidden", a.body === 1);
  }
  paint();
  return { get: () => ({ ...a }) };
}

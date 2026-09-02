// Editor de avatar: preview grande + seletores. Usado no login e no modal "Editar avatar".
import { SKINS, HAIR_COLORS, HAIRS, SHIRTS, ACCESSORIES, DEFAULT_AVATAR, normalizeAvatar, drawPreview } from "./sprites.js";

export function mountAvatarEditor(root, initial, onChange) {
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
  const row = (label, count, key, colors) => {
    const r = document.createElement("div"); r.className = "avatar-row";
    const l = document.createElement("div"); l.className = "mono dim"; l.textContent = label; r.appendChild(l);
    const opts = document.createElement("div"); opts.className = "avatar-opts";
    for (let i = 0; i < count; i++) {
      const b = document.createElement("button"); b.type = "button"; b.className = "avatar-opt";
      if (colors) b.style.background = colors[i]; else b.textContent = HAIRS === colors ? "" : (key === "hair" ? HAIRS[i] : ACCESSORIES[i]);
      b.classList.toggle("active", a[key] === i);
      b.onclick = () => { a[key] = i; [...opts.children].forEach((c, j) => c.classList.toggle("active", j === i)); paint(); onChange?.({ ...a }); };
      opts.appendChild(b);
    }
    r.appendChild(opts); controls.appendChild(r);
  };
  row("pele", SKINS.length, "skin", SKINS);
  row("cabelo", HAIRS.length, "hair", null);
  row("cor do cabelo", HAIR_COLORS.length, "hairColor", HAIR_COLORS);
  row("roupa", SHIRTS.length, "shirt", SHIRTS);
  row("acessório", ACCESSORIES.length, "accessory", null);

  root.append(preview, controls);
  function paint() { drawPreview(canvas, a, DIRS[dir], 7); }
  paint();
  return { get: () => ({ ...a }) };
}

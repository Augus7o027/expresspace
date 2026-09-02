// Biblioteca própria de ícones e "emojis" em traço monocromático (SVG inline, 24x24).
// Nada de emoji do sistema: tudo desenhado no mesmo estilo da marca.
const S = (paths, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;

const face = (mouth, eyes = '<circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/>') =>
  S(`<circle cx="12" cy="12" r="9"/>${eyes}${mouth}`);

// ---------- emojis: chave -> { svg, label } ----------
export const EMOJI = {
  smile:    { label: "sorriso",   svg: face('<path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/>') },
  grin:     { label: "risada",    svg: face('<path d="M8 13.5h8c0 2.2-1.8 4-4 4s-4-1.8-4-4z" fill="currentColor" stroke="none"/><path d="M8 13.5h8"/>') },
  laugh:    { label: "chorando de rir", svg: face('<path d="M8 13.5h8c0 2.2-1.8 4-4 4s-4-1.8-4-4z"/>', '<path d="M7.5 10.5l1.5-1 1.5 1M13.5 10.5l1.5-1 1.5 1"/><path d="M5 13c-.6 1-.6 2 0 2.5M19 13c.6 1 .6 2 0 2.5"/>') },
  wink:     { label: "piscada",   svg: face('<path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/>', '<circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><path d="M14 10h2.5"/>') },
  cool:     { label: "de óculos", svg: face('<path d="M9 15.5c1 .8 2 1.2 3 1.2s2-.4 3-1.2"/>', '<path d="M5.5 9.5h13M6.5 9.5v1.5a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V9.5M12.5 9.5v1.5a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V9.5"/>') },
  think:    { label: "pensando",  svg: face('<path d="M9 15.5h4.5"/>', '<circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/><path d="M7 7.5l2.5-.8M14.5 6.7l2.5.8"/><path d="M15 17.5c.5-.7 1.5-.8 2.2-.3"/>') },
  sad:      { label: "triste",    svg: face('<path d="M8.5 16.5c1-1.3 2.2-2 3.5-2s2.5.7 3.5 2"/>') },
  wow:      { label: "surpreso",  svg: face('<ellipse cx="12" cy="15.5" rx="1.6" ry="2.2"/>') },
  love:     { label: "apaixonado", svg: face('<path d="M8.5 15c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/>', '<path d="M7 9.2c.6-.9 1.8-.9 2.2 0 .4-.9 1.6-.9 2.2 0 .4.9-.8 1.9-2.2 3.1C7.8 11.1 6.6 10.1 7 9.2zM12.6 9.2c.6-.9 1.8-.9 2.2 0 .4-.9 1.6-.9 2.2 0 .4.9-.8 1.9-2.2 3.1-1.4-1.2-2.6-2.2-2.2-3.1z" fill="currentColor" stroke="none"/>') },
  sleep:    { label: "sono",      svg: face('<path d="M10 16h4"/>', '<path d="M7.5 10.5h3M13.5 10.5h3"/><path d="M15 4h3l-3 3h3"/>') },
  heart:    { label: "coração",   svg: S('<path d="M12 20s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.6 12 20 12 20z"/>') },
  fire:     { label: "fogo",      svg: S('<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-2.7 1.8-4.4 3-6.4.6 1.2 1.4 1.8 2.2 1.8C11 8 12 5.5 14 3c1 2.6 4 5.4 4 9.4 0 3.6-2.6 8.6-6 8.6z"/><path d="M12 21c-1.5 0-2.5-1.1-2.5-2.5 0-1.5 1.2-2.2 2-3.7.9 1.2 3 2 3 3.9 0 1.3-1 2.3-2.5 2.3z"/>') },
  rocket:   { label: "foguete",   svg: S('<path d="M5 19l3-3M9 15c-2-2-2.5-5 0-8s7.5-4 9-3-1 6.5-3 9-6 2-6 2z"/><path d="M14.5 9.5a1 1 0 1 0 0-.01"/><path d="M8 12l-3 .5 2-3M12 16l-.5 3 3-2"/>') },
  thumbsup: { label: "joinha",    svg: S('<path d="M7 11v9H4v-9h3zM7 11l3.5-6.5c1.5 0 2.5 1 2.5 2.5V10h4.5a2 2 0 0 1 2 2.3l-1 6a2 2 0 0 1-2 1.7H7"/>') },
  thumbsdown: { label: "não curti", svg: S('<path d="M7 13V4H4v9h3zM7 13l3.5 6.5c1.5 0 2.5-1 2.5-2.5V14h4.5a2 2 0 0 0 2-2.3l-1-6a2 2 0 0 0-2-1.7H7"/>') },
  clap:     { label: "palmas",    svg: S('<path d="M8 21c-3 0-5-2-5-5V9.5a1.5 1.5 0 0 1 3 0V13"/><path d="M6 8.5a1.5 1.5 0 0 1 3 0V12M9 7.5a1.5 1.5 0 0 1 3 0V12M12 8.5a1.5 1.5 0 0 1 3 0V14c0 3.5-2 7-6 7"/><path d="M15 12l2.5-2.5a1.5 1.5 0 0 1 2.1 2.1L17 14.3"/><path d="M4 3l1.5 1.5M9 2v2M14 3l-1.5 1.5"/>') },
  check:    { label: "feito",     svg: S('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>') },
  x:        { label: "não",       svg: S('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>') },
  eyes:     { label: "de olho",   svg: S('<ellipse cx="8" cy="12" rx="3.5" ry="4.5"/><ellipse cx="16" cy="12" rx="3.5" ry="4.5"/><circle cx="9" cy="12.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="17" cy="12.5" r="1.3" fill="currentColor" stroke="none"/>') },
  bulb:     { label: "ideia",     svg: S('<path d="M9 18h6M10 21h4"/><path d="M8.5 14.5C7 13.3 6 11.7 6 9.8 6 6.6 8.7 4 12 4s6 2.6 6 5.8c0 1.9-1 3.5-2.5 4.7-.5.4-.8 1-.8 1.5H9.3c0-.5-.3-1.1-.8-1.5z"/>') },
  coffee:   { label: "café",      svg: S('<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3c0 1.5-1 1.5-1 3M12 3c0 1.5-1 1.5-1 3"/>') },
  target:   { label: "foco",      svg: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>') },
  muscle:   { label: "força",     svg: S('<path d="M5 18c0-3 1-5 3-6l1-6c0-1.2.8-2 2-2s2 .8 2 2v3.5"/><path d="M13 9.5c2 0 4 1 5 3s1 4 0 5.5H7"/><path d="M13 9.5c-1.5 1-2 2-2 3.5"/>') },
  pray:     { label: "obrigado",  svg: S('<path d="M12 3v8"/><path d="M12 11c-2-1.5-4-1.5-5.5 0S5 15 7 17l5 4 5-4c2-2 2-4.5.5-6s-3.5-1.5-5.5 0z"/>') },
  party:    { label: "festa",     svg: S('<path d="M5 19l3.5-11 7.5 7.5L5 19z"/><path d="M8.5 8c1 0 2.3.6 3.5 1.8s1.8 2.5 1.8 3.5"/><path d="M14 4l.5 2M19 6l-2 1.5M20 11l-2 .3M17 3l-.5 1"/>') },
  handshake:{ label: "combinado", svg: S('<path d="M3 10l3-3h4l3 3 2-2h3l3 3-6 7a2 2 0 0 1-3 0l-1-1"/><path d="M9 14l2 2a1.5 1.5 0 0 0 2-2l-3-3"/><path d="M6 15l2 2"/>') },
  pin:      { label: "importante", svg: S('<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>') },
  star:     { label: "estrela",   svg: S('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>') },
  bolt:     { label: "energia",   svg: S('<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>') },
  hundred:  { label: "100",       svg: S('<path d="M4 9v6M9.5 8.5a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-3a2 2 0 0 1 2-2zM16.5 8.5a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-3a2 2 0 0 1 2-2z"/><path d="M4 18h16"/>') },
  wave:     { label: "oi",        svg: S('<path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 5.5a1.5 1.5 0 0 1 3 0V11M13 6.5a1.5 1.5 0 0 1 3 0V11M16 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.4-3.4L4 13.5a1.5 1.5 0 0 1 2.6-1.5L7 13"/>') },
  moon:     { label: "boa noite", svg: S('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') },
  sun:      { label: "bom dia",   svg: S('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>') },
};

export const EMOJI_ORDER = Object.keys(EMOJI);

// Substitui :codigo: por SVG. Retorna DocumentFragment seguro (sem innerHTML do usuário).
const RE = /:([a-z0-9_]+):/g;
export function renderEmoji(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const key = m[1];
    if (!EMOJI[key]) continue;
    frag.append(text.slice(last, m.index));
    const span = document.createElement("span");
    span.className = "emo"; span.title = EMOJI[key].label; span.innerHTML = EMOJI[key].svg;
    frag.append(span);
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

// ---------- ícones de interface ----------
export const ICON = {
  mic:      S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>'),
  micOff:   S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6M4 4l16 16"/>'),
  screen:   S('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  camera:   S('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  cameraOff:S('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3zM4 4l16 16"/>'),
  bell:     S('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 21h4"/>'),
  bellOff:  S('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 21h4M4 4l16 16"/>'),
  smile:    S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/>'),
  send:     S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  close:    S('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit:     S('<path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L4 16v4z"/><path d="M13 7l4 4"/>'),
  hash:     S('<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>'),
  voice:    S('<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>'),
  room:     S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'),
  user:     S('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  expand:   S('<path d="M4 9V4h5M20 15v5h-5M20 4l-6 6M4 20l6-6"/>'),
};

export function icon(name, cls = "") { const s = document.createElement("span"); s.className = "ico " + cls; s.innerHTML = ICON[name]; return s; }

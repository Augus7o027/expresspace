// Definição do mundo. Mesmo formato é servido ao cliente via GET /api/map.
// Grid em tiles de 32px. Zonas são retângulos em tiles.
//   kind: "meeting"  -> quem está dentro entra numa call da sala (voz em grupo)
//         "silent"   -> sem voz por proximidade (foco)
//         "stage"    -> palco: só quem está no "stage" fala, plateia ouve
//         "open"     -> área livre: voz por proximidade
// Objetos interativos (tecla E perto deles):
//   kind: "board" (quadro de texto compartilhado), "link" (abre iframe), "video" (embed), "info" (texto)
export const TILE = 32;

export const WORLD = {
  name: "ExpresSpace",
  width: 58,
  height: 38,
  spawn: { x: 5, y: 6 },
  proximityRadius: 3.2, // em tiles
  zones: [
    { id: "recepcao",  name: "Recepção",   kind: "open",    x: 1,  y: 1,  w: 12, h: 9 },
    { id: "openspace", name: "Open Space", kind: "open",    x: 1,  y: 11, w: 22, h: 14 },
    { id: "cafe",      name: "Café",       kind: "open",    x: 1,  y: 26, w: 12, h: 11 },
    { id: "lounge",    name: "Lounge",     kind: "open",    x: 14, y: 26, w: 9,  h: 11 },
    { id: "foco",      name: "Foco",       kind: "silent",  x: 14, y: 1,  w: 9,  h: 9 },
    { id: "reuniao-1", name: "Reunião 1",  kind: "meeting", x: 24, y: 1,  w: 10, h: 8 },
    { id: "reuniao-2", name: "Reunião 2",  kind: "meeting", x: 35, y: 1,  w: 10, h: 8 },
    { id: "diretoria", name: "Diretoria",  kind: "meeting", x: 46, y: 1,  w: 11, h: 8 },
    { id: "auditorio", name: "Auditório",  kind: "stage",   x: 24, y: 10, w: 33, h: 14,
      stage: { x: 26, y: 11, w: 29, h: 2 } },
    { id: "reuniao-3", name: "Reunião 3",  kind: "meeting", x: 24, y: 25, w: 10, h: 12 },
    { id: "terraco",   name: "Terraço",    kind: "open",    x: 35, y: 25, w: 22, h: 12 },
  ],
  // Paredes (retângulos em tiles). door: true abre passagem naquele trecho
  walls: [
    // recepção | foco | corredor
    { x: 13, y: 0, w: 1, h: 11 }, { x: 13, y: 4, w: 1, h: 2, door: true },
    { x: 0, y: 10, w: 24, h: 1 }, { x: 5, y: 10, w: 2, h: 1, door: true }, { x: 17, y: 10, w: 2, h: 1, door: true },
    // coluna central separando lado esquerdo do direito
    { x: 23, y: 0, w: 1, h: 38 },
    { x: 23, y: 5, w: 1, h: 2, door: true }, { x: 23, y: 16, w: 1, h: 3, door: true }, { x: 23, y: 30, w: 1, h: 2, door: true },
    // salas do topo
    { x: 34, y: 0, w: 1, h: 10 }, { x: 45, y: 0, w: 1, h: 10 },
    { x: 24, y: 9, w: 34, h: 1 },
    { x: 28, y: 9, w: 2, h: 1, door: true }, { x: 39, y: 9, w: 2, h: 1, door: true }, { x: 50, y: 9, w: 2, h: 1, door: true },
    // auditório / embaixo
    { x: 24, y: 24, w: 34, h: 1 },
    { x: 28, y: 24, w: 2, h: 1, door: true }, { x: 44, y: 24, w: 3, h: 1, door: true },
    { x: 34, y: 25, w: 1, h: 13 }, { x: 34, y: 30, w: 1, h: 2, door: true },
    // open space / café / lounge
    { x: 0, y: 25, w: 24, h: 1 }, { x: 5, y: 25, w: 2, h: 1, door: true }, { x: 17, y: 25, w: 2, h: 1, door: true },
    { x: 13, y: 26, w: 1, h: 12 }, { x: 13, y: 31, w: 1, h: 2, door: true },
  ],
  // Mobília (visual + colisão)
  props: [
    // recepção
    { kind: "counter", x: 3, y: 3, w: 5, h: 1 }, { kind: "plant", x: 1, y: 1, w: 1, h: 1 }, { kind: "plant", x: 11, y: 1, w: 1, h: 1 },
    { kind: "sofa", x: 8, y: 7, w: 3, h: 1 },
    // foco
    { kind: "desk", x: 15, y: 2, w: 2, h: 1 }, { kind: "desk", x: 19, y: 2, w: 2, h: 1 },
    { kind: "desk", x: 15, y: 5, w: 2, h: 1 }, { kind: "desk", x: 19, y: 5, w: 2, h: 1 },
    { kind: "plant", x: 21, y: 8, w: 1, h: 1 },
    // open space: 4 ilhas de mesas
    { kind: "desk", x: 3, y: 13, w: 3, h: 1 }, { kind: "desk", x: 3, y: 15, w: 3, h: 1 },
    { kind: "desk", x: 9, y: 13, w: 3, h: 1 }, { kind: "desk", x: 9, y: 15, w: 3, h: 1 },
    { kind: "desk", x: 15, y: 13, w: 3, h: 1 }, { kind: "desk", x: 15, y: 15, w: 3, h: 1 },
    { kind: "desk", x: 3, y: 19, w: 3, h: 1 }, { kind: "desk", x: 3, y: 21, w: 3, h: 1 },
    { kind: "desk", x: 9, y: 19, w: 3, h: 1 }, { kind: "desk", x: 9, y: 21, w: 3, h: 1 },
    { kind: "desk", x: 15, y: 19, w: 3, h: 1 }, { kind: "desk", x: 15, y: 21, w: 3, h: 1 },
    { kind: "plant", x: 21, y: 12, w: 1, h: 1 }, { kind: "plant", x: 1, y: 23, w: 1, h: 1 },
    // café
    { kind: "counter", x: 2, y: 27, w: 5, h: 1 }, { kind: "table", x: 3, y: 31, w: 2, h: 2 }, { kind: "table", x: 8, y: 31, w: 2, h: 2 },
    { kind: "table", x: 3, y: 35, w: 2, h: 1 }, { kind: "table", x: 8, y: 35, w: 2, h: 1 },
    // lounge
    { kind: "sofa", x: 15, y: 28, w: 3, h: 1 }, { kind: "sofa", x: 19, y: 28, w: 3, h: 1 },
    { kind: "sofa", x: 15, y: 33, w: 3, h: 1 }, { kind: "sofa", x: 19, y: 33, w: 3, h: 1 }, { kind: "plant", x: 21, y: 36, w: 1, h: 1 },
    // salas de reunião
    { kind: "table", x: 26, y: 3, w: 6, h: 2 }, { kind: "table", x: 37, y: 3, w: 6, h: 2 }, { kind: "table", x: 48, y: 3, w: 7, h: 2 },
    { kind: "table", x: 27, y: 29, w: 4, h: 3 },
    // auditório
    { kind: "plant", x: 25, y: 22, w: 1, h: 1 }, { kind: "plant", x: 55, y: 22, w: 1, h: 1 },
    { kind: "bench", x: 27, y: 16, w: 10, h: 1 }, { kind: "bench", x: 42, y: 16, w: 10, h: 1 },
    { kind: "bench", x: 27, y: 19, w: 10, h: 1 }, { kind: "bench", x: 42, y: 19, w: 10, h: 1 },
    // terraço
    { kind: "plant", x: 36, y: 26, w: 1, h: 1 }, { kind: "plant", x: 55, y: 26, w: 1, h: 1 }, { kind: "plant", x: 36, y: 35, w: 1, h: 1 }, { kind: "plant", x: 55, y: 35, w: 1, h: 1 },
    { kind: "table", x: 39, y: 29, w: 2, h: 2 }, { kind: "table", x: 45, y: 29, w: 2, h: 2 }, { kind: "table", x: 51, y: 29, w: 2, h: 2 },
    { kind: "sofa", x: 42, y: 34, w: 3, h: 1 }, { kind: "sofa", x: 48, y: 34, w: 3, h: 1 },
  ],
  // Objetos interativos: chega perto e aperta E
  objects: [
    { id: "mural", kind: "info", x: 9, y: 2, w: 3, h: 1, label: "Mural",
      text: "Bem-vindo ao ExpresSpace.\n\nAnde com WASD ou setas. Chegue perto de alguém para conversar por voz. Entre numa sala de reunião para cair na call dela. Aperte E perto de objetos como este.\n\nCanais de texto e voz ficam na barra da esquerda. M liga e desliga o microfone." },
    { id: "quadro-open", kind: "board", x: 20, y: 17, w: 1, h: 2, label: "Quadro do time" },
    { id: "quadro-r1", kind: "board", x: 24, y: 2, w: 1, h: 2, label: "Quadro" },
    { id: "quadro-r2", kind: "board", x: 35, y: 2, w: 1, h: 2, label: "Quadro" },
    { id: "quadro-dir", kind: "board", x: 46, y: 2, w: 1, h: 2, label: "Quadro" },
    { id: "quadro-r3", kind: "board", x: 24, y: 27, w: 1, h: 2, label: "Quadro" },
    { id: "telao", kind: "video", x: 36, y: 10, w: 9, h: 1, label: "Telão",
      url: "https://www.youtube.com/embed/jfKfPfyJRdk" },
    { id: "docs", kind: "link", x: 3, y: 12, w: 1, h: 1, label: "Documentos",
      url: "https://drive.google.com" },
    { id: "jukebox", kind: "link", x: 11, y: 27, w: 1, h: 1, label: "Rádio",
      url: "https://www.youtube.com/embed/videoseries?list=PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo" },
  ],
};

export function zoneAt(world, tx, ty) {
  for (const z of world.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z;
  }
  return null;
}

export function onStage(zone, tx, ty) {
  if (!zone || !zone.stage) return false;
  const s = zone.stage;
  return tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h;
}

export function isBlocked(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return true;
  const door = world.walls.some((d) => d.door && tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h);
  if (door) return false;
  for (const wl of world.walls) {
    if (!wl.door && tx >= wl.x && tx < wl.x + wl.w && ty >= wl.y && ty < wl.y + wl.h) return true;
  }
  for (const p of [...world.props, ...world.objects]) {
    if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) return true;
  }
  return false;
}

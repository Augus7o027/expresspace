// Definição do mundo. Mesmo formato é servido ao cliente via GET /api/map.
// Grid em tiles de 32px. Zonas são retângulos em tiles.
//   kind: "meeting"  -> quem está dentro entra numa call da sala (voz em grupo)
//         "silent"   -> sem voz por proximidade (foco)
//         "stage"    -> palco: só quem está no "stage" fala, plateia ouve
//         "open"     -> área livre: voz por proximidade
export const TILE = 32;

export const WORLD = {
  name: "Sede",
  width: 40,
  height: 26,
  spawn: { x: 6, y: 13 },
  proximityRadius: 3.2, // em tiles
  zones: [
    { id: "lobby", name: "Lobby", kind: "open", x: 1, y: 8, w: 12, h: 10 },
    { id: "cafe", name: "Café", kind: "open", x: 1, y: 19, w: 12, h: 6, accent: "#8a8a8a" },
    { id: "sala-a", name: "Sala A", kind: "meeting", x: 14, y: 1, w: 8, h: 7 },
    { id: "sala-b", name: "Sala B", kind: "meeting", x: 23, y: 1, w: 8, h: 7 },
    { id: "sala-c", name: "Sala C", kind: "meeting", x: 32, y: 1, w: 7, h: 7 },
    { id: "auditorio", name: "Auditório", kind: "stage", x: 14, y: 9, w: 25, h: 9,
      stage: { x: 15, y: 10, w: 23, h: 2 } },
    { id: "foco", name: "Foco", kind: "silent", x: 14, y: 19, w: 12, h: 6 },
    { id: "praca", name: "Praça", kind: "open", x: 27, y: 19, w: 12, h: 6 },
  ],
  // Paredes (retângulos em tiles) além das bordas das salas
  walls: [
    { x: 13, y: 0, w: 1, h: 26 },     // divisória vertical principal
    { x: 13, y: 12, w: 1, h: 2, door: true },
    { x: 13, y: 21, w: 1, h: 2, door: true },
    { x: 14, y: 8, w: 25, h: 1 },     // teto do auditório
    { x: 16, y: 8, w: 2, h: 1, door: true },
    { x: 25, y: 8, w: 2, h: 1, door: true },
    { x: 34, y: 8, w: 2, h: 1, door: true },
    { x: 22, y: 0, w: 1, h: 8 },
    { x: 31, y: 0, w: 1, h: 8 },
    { x: 14, y: 18, w: 25, h: 1 },    // piso do auditório
    { x: 19, y: 18, w: 2, h: 1, door: true },
    { x: 32, y: 18, w: 2, h: 1, door: true },
    { x: 26, y: 19, w: 1, h: 7 },
    { x: 1, y: 18, w: 12, h: 1 },
    { x: 6, y: 18, w: 2, h: 1, door: true },
  ],
  // Mobília decorativa (só visual + colisão leve)
  props: [
    { kind: "table", x: 16, y: 3, w: 4, h: 2 },
    { kind: "table", x: 25, y: 3, w: 4, h: 2 },
    { kind: "table", x: 34, y: 3, w: 3, h: 2 },
    { kind: "counter", x: 2, y: 20, w: 4, h: 1 },
    { kind: "plant", x: 2, y: 9, w: 1, h: 1 },
    { kind: "plant", x: 11, y: 9, w: 1, h: 1 },
    { kind: "plant", x: 15, y: 16, w: 1, h: 1 },
    { kind: "plant", x: 37, y: 16, w: 1, h: 1 },
    { kind: "desk", x: 16, y: 21, w: 2, h: 1 },
    { kind: "desk", x: 20, y: 21, w: 2, h: 1 },
    { kind: "desk", x: 16, y: 23, w: 2, h: 1 },
    { kind: "desk", x: 20, y: 23, w: 2, h: 1 },
    { kind: "sofa", x: 30, y: 21, w: 3, h: 1 },
    { kind: "sofa", x: 34, y: 21, w: 3, h: 1 },
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
  for (const wl of world.walls) {
    if (tx >= wl.x && tx < wl.x + wl.w && ty >= wl.y && ty < wl.y + wl.h) {
      if (wl.door) return false;
      // portas sobrescrevem paredes: checar se alguma porta cobre esse tile
      const door = world.walls.some(
        (d) => d.door && tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h
      );
      if (!door) return true;
    }
  }
  for (const p of world.props) {
    if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) return true;
  }
  return false;
}

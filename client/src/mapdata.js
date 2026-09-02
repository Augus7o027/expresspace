// Funções de mapa espelhadas do servidor (server/src/map.js).
export const TILE = 32;

export function zoneAt(world, tx, ty) {
  for (const z of world.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z;
  }
  return null;
}

export function isBlocked(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return true;
  const door = world.walls.some((d) => d.door && tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h);
  if (door) return false;
  for (const wl of world.walls) {
    if (!wl.door && tx >= wl.x && tx < wl.x + wl.w && ty >= wl.y && ty < wl.y + wl.h) return true;
  }
  for (const p of world.props) {
    if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) return true;
  }
  return false;
}

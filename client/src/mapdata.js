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
  return world.grid[ty][tx] === "1";
}

// Objeto interativo a até `reach` tiles do ponto (x,y)
export function objectNear(world, x, y, reach = 1.1) {
  let best = null, bestD = Infinity;
  for (const o of world.objects || []) {
    // distância até o retângulo do objeto
    const cx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(y, o.y + o.h));
    const d = Math.hypot(x - cx, y - cy);
    if (d <= reach && d < bestD) { best = o; bestD = d; }
  }
  return best;
}

// 4-neighbour BFS over a small boolean obstacle grid. Returns the path
// excluding the start cell -- so route[0] is the first step the walker takes.
// Returns null when the target is unreachable or invalid.
export function bfs(
  obstacles: boolean[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Array<{ px: number; py: number }> | null {
  if (sx === tx && sy === ty) return [];
  if (!inBounds(tx, ty, w, h)) return null;
  if (obstacles[ty * w + tx]) return null;

  const prev = new Int32Array(w * h).fill(-1);
  const visited = new Uint8Array(w * h);
  const queue: number[] = [sy * w + sx];
  visited[sy * w + sx] = 1;

  let found = false;
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const cx = idx % w;
    const cy = (idx - cx) / w;

    if (cx === tx && cy === ty) {
      found = true;
      break;
    }

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      const nIdx = ny * w + nx;
      if (visited[nIdx]) continue;
      if (obstacles[nIdx]) continue;
      visited[nIdx] = 1;
      prev[nIdx] = idx;
      queue.push(nIdx);
    }
  }

  if (!found) return null;

  const path: Array<{ px: number; py: number }> = [];
  let cur = ty * w + tx;
  while (cur !== sy * w + sx) {
    const cx = cur % w;
    const cy = (cur - cx) / w;
    path.push({ px: cx, py: cy });
    cur = prev[cur]!;
    if (cur < 0) return null;
  }
  return path.reverse();
}

export function isReachable(
  obstacles: boolean[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): boolean {
  return bfs(obstacles, w, h, sx, sy, tx, ty) !== null;
}

// Bounded BFS over an arbitrary obstacle predicate so we can path across
// many lazily-generated biome interiors in global tile space without ever
// materialising one big grid. maxRadius caps work to keep walks tractable
// regardless of total world size.
export function bfsPredicate(
  isObstacle: (gx: number, gy: number) => boolean,
  sgx: number,
  sgy: number,
  tgx: number,
  tgy: number,
  maxRadius: number,
): Array<{ gx: number; gy: number }> | null {
  if (sgx === tgx && sgy === tgy) return [];
  if (isObstacle(tgx, tgy)) return null;

  const visited = new Map<string, string | null>();
  const startKey = `${sgx},${sgy}`;
  visited.set(startKey, null);
  const queue: Array<[number, number]> = [[sgx, sgy]];
  const r2 = maxRadius * maxRadius;

  let found = false;
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    if (cx === tgx && cy === tgy) {
      found = true;
      break;
    }

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const dx2 = nx - sgx;
      const dy2 = ny - sgy;
      if (dx2 * dx2 + dy2 * dy2 > r2) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (isObstacle(nx, ny)) continue;
      visited.set(key, `${cx},${cy}`);
      queue.push([nx, ny]);
    }
  }

  if (!found) return null;

  const path: Array<{ gx: number; gy: number }> = [];
  let curKey: string | null = `${tgx},${tgy}`;
  while (curKey && curKey !== startKey) {
    const [cxs, cys] = curKey.split(",");
    path.push({ gx: parseInt(cxs!, 10), gy: parseInt(cys!, 10) });
    const prev = visited.get(curKey);
    if (prev === undefined) return null;
    curKey = prev;
  }
  return path.reverse();
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

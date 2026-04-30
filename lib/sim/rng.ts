// Mulberry32 — small, fast, deterministic. Good enough for a sim, not crypto.
export function createRng(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, maxExclusive: number): number {
      return Math.floor(this.next() * (maxExclusive - min)) + min;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)] as T;
    },
    chance(p: number): boolean {
      return this.next() < p;
    },
    state(): number {
      return state;
    },
    setState(s: number): void {
      state = s >>> 0;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

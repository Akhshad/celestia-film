export const D2R = Math.PI / 180;
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const sstep = (a: number, b: number, x: number) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeIn2 = (t: number) => t * t;
export const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Seeded RNG (mulberry32). Every builder reseeds it so the art is identical on every load. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let cur = rng(20261117);
export const seed = (s: number) => { cur = rng(s); };
/** Swap the active generator (returns the previous one, to restore later). */
export const swapRng = (next: () => number) => { const prev = cur; cur = next; return prev; };
export const newRng = rng;
export const R = () => cur();
export const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d') as CanvasRenderingContext2D;

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

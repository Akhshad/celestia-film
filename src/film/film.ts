/* =====================================================================
   SCROLL FILM: the AI-generated opening film (clouds → plot → construction →
   finished Celestia), cut into WebP frames and painted onto a canvas by scroll
   position, so scrolling plays it forwards and backwards.
   Frames load progressively (every 12th, then 6th, 3rd, then all), so the film
   is usable long before every frame has arrived.
   ===================================================================== */
import { clamp } from '../util';

export const FRAME_COUNT = 286;
const frameUrl = (i: number) => `${import.meta.env.BASE_URL}film/f-${String(i + 1).padStart(4, '0')}.webp`;

export class Film {
  private ctx: CanvasRenderingContext2D;
  private imgs: (HTMLImageElement | undefined)[] = new Array(FRAME_COUNT);
  private started = false;
  private w = 0;
  private h = 0;
  private lastKey = '';
  private shownO = -1;
  /** frames loaded so far */
  loaded = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }

  /** true once the first frame (needed for the hand-off from the space journey) is in */
  get ready() { return !!this.imgs[0]; }

  /** Load frames coarse-to-fine with a few parallel requests. */
  start() {
    if (this.started) return;
    this.started = true;
    const order: number[] = [];
    const seen = new Set<number>();
    for (const step of [12, 6, 3, 1]) for (let i = 0; i < FRAME_COUNT; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
    if (!seen.has(FRAME_COUNT - 1)) order.splice(1, 0, FRAME_COUNT - 1);
    let next = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++];
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { this.imgs[i] = im; this.loaded++; this.lastKey = ''; pump(); };
      im.onerror = () => pump();
      im.src = frameUrl(i);
    };
    for (let k = 0; k < 6; k++) pump();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = Math.max(2, Math.round(r.width * dpr)); this.h = Math.max(2, Math.round(r.height * dpr));
    if (this.canvas.width !== this.w || this.canvas.height !== this.h) { this.canvas.width = this.w; this.canvas.height = this.h; }
    this.lastKey = '';
  }

  private nearest(i: number) {
    for (let d = 0; d < FRAME_COUNT; d++) {
      const a = this.imgs[i - d]; if (a) return { im: a, i: i - d };
      const b = this.imgs[i + d]; if (b) return { im: b, i: i + d };
    }
    return null;
  }

  private cover(im: HTMLImageElement) {
    const s = Math.max(this.w / im.naturalWidth, this.h / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    this.ctx.drawImage(im, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
  }

  /**
   * @param f film position 0–1
   * @param opacity canvas opacity (cross-fade with the space journey underneath)
   * @param dim 0–1 darkening behind end titles
   */
  draw(f: number, opacity: number, dim = 0) {
    if (opacity !== this.shownO) {
      this.shownO = opacity;
      this.canvas.style.opacity = opacity.toFixed(3);
      this.canvas.style.visibility = opacity > 0 ? 'visible' : 'hidden';
    }
    if (opacity <= 0 || !this.w) return;
    const pos = clamp(f, 0, 1) * (FRAME_COUNT - 1);
    const i0 = Math.floor(pos), frac = pos - i0;
    const key = `${pos.toFixed(3)}|${dim.toFixed(3)}|${this.w}x${this.h}`;
    if (key === this.lastKey) return;          // nothing changed since the last paint
    const a = this.nearest(i0);
    if (!a) return;
    this.lastKey = key;
    const g = this.ctx;
    g.globalAlpha = 1;
    this.cover(a.im);
    // blend into the next frame when it is loaded, for smooth slow scrolling
    const b = a.i === i0 && frac > 0.02 ? this.imgs[i0 + 1] : undefined;
    if (b) { g.globalAlpha = frac; this.cover(b); g.globalAlpha = 1; }
    // soft cinematic vignette
    const vg = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * .35, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * .62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    g.fillStyle = vg; g.fillRect(0, 0, this.w, this.h);
    const top = g.createLinearGradient(0, 0, 0, this.h * .16);
    top.addColorStop(0, 'rgba(0,0,0,.35)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top; g.fillRect(0, 0, this.w, this.h * .16);
    if (dim > 0) { g.fillStyle = `rgba(8,6,4,${dim.toFixed(3)})`; g.fillRect(0, 0, this.w, this.h); }
  }
}

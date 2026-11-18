import { mk, ctx2d } from '../util';

function spriteCanvas(rgb: string, size = 64) {
  const c = mk(size, size), g = ctx2d(c), h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}

/** Soft radial glow sprites. */
export const SPR = {
  blue: spriteCanvas('170,192,255'), warm: spriteCanvas('255,214,165'), pink: spriteCanvas('255,120,175'),
  white: spriteCanvas('255,255,255'), gold: spriteCanvas('255,214,140'), dark: spriteCanvas('6,4,10'),
};

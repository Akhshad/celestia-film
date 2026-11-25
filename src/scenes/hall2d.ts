/* =====================================================================
   2D FALLBACK ENDING: top view of the hall.
   Used only if WebGL or the 3D model is unavailable.
   ===================================================================== */
import { R, seed, mk, ctx2d, roundRect, clamp, easeOut3, lerp } from '../util';
import { view, ctx } from '../view';

type Box = { cx: number; cy: number; w: number; h: number };
type Img = HTMLCanvasElement | HTMLImageElement;

let HALL: { img: Img; b: Box; iw: number; ih: number } | null = null;
let HALLBG: HTMLCanvasElement;
let HL = { s: 1 };

/** Drawn placeholder (until a real top-view photo is provided). */
export function buildPlaceholderHall(): { img: HTMLCanvasElement; b: Box } {
  seed(11);
  const N = view.SMALL ? 1500 : 2200, c = mk(N, N), g = ctx2d(c);
  const f = (v: number) => v * N;
  g.fillStyle = '#5d7c3a'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < N * N / 260; i++) { const v = R(); g.fillStyle = v < .5 ? 'rgba(35,62,18,.16)' : 'rgba(160,190,95,.12)'; g.fillRect(R() * N, R() * N, 2 + R() * 5, 2 + R() * 5); }
  for (let i = 0; i < 28; i++) if (i % 2) { g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(i * N / 28, 0, N / 28, N); }
  // road
  g.fillStyle = '#c9c2b4'; g.fillRect(0, f(.845), N, f(.015)); g.fillRect(0, f(.945), N, f(.015));
  g.fillStyle = '#4a4c51'; g.fillRect(0, f(.86), N, f(.085));
  g.fillStyle = 'rgba(255,255,255,.75)'; for (let x = 0; x < N; x += f(.05)) g.fillRect(x, f(.9), f(.026), f(.004));
  // compound wall
  g.strokeStyle = '#ddd5c6'; g.lineWidth = f(.006); g.strokeRect(f(.035), f(.13), f(.93), f(.705));
  // driveway & forecourt
  g.fillStyle = '#a7a194'; g.fillRect(f(.455), f(.6), f(.09), f(.245));
  g.fillStyle = '#b9b2a5'; roundRect(g, f(.36), f(.6), f(.28), f(.07), f(.02)); g.fill();
  // parking (left)
  g.fillStyle = '#707377'; g.fillRect(f(.06), f(.2), f(.24), f(.6));
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = f(.0018);
  const carCols = ['#e8e8e8', '#1d1f24', '#8a8f96', '#b02a2a', '#2f4f8f', '#d0d0d0', '#5b5f66', '#f0f0f0', '#7a1f1f'];
  for (let row = 0; row < 5; row++) {
    const y = f(.23 + row * .115);
    for (let x = f(.075); x < f(.29); x += f(.034)) {
      g.strokeRect(x, y, f(.034), f(.055));
      if (R() < .72) {
        g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = f(.006); g.shadowOffsetX = f(.003); g.shadowOffsetY = f(.004);
        g.fillStyle = carCols[(R() * carCols.length) | 0]; roundRect(g, x + f(.006), y + f(.005), f(.022), f(.045), f(.006)); g.fill(); g.restore();
        g.fillStyle = 'rgba(20,28,38,.75)'; g.fillRect(x + f(.008), y + f(.012), f(.018), f(.008)); g.fillRect(x + f(.008), y + f(.034), f(.018), f(.006));
      }
    }
  }
  // garden (right): paths + fountain
  g.fillStyle = '#6e9145'; g.fillRect(f(.7), f(.2), f(.25), f(.6));
  g.strokeStyle = '#d8cdb5'; g.lineWidth = f(.012);
  g.beginPath(); g.moveTo(f(.7), f(.5)); g.lineTo(f(.95), f(.5)); g.moveTo(f(.825), f(.2)); g.lineTo(f(.825), f(.8)); g.stroke();
  g.beginPath(); g.arc(f(.825), f(.5), f(.075), 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#d8cdb5'; g.beginPath(); g.arc(f(.825), f(.5), f(.045), 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5aa0c8'; g.beginPath(); g.arc(f(.825), f(.5), f(.035), 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(f(.825), f(.5), f(.01), 0, Math.PI * 2); g.fill();
  // building
  const B = { cx: .5, cy: .48, w: .3, h: .22 };
  const bx = f(B.cx - B.w / 2), by = f(B.cy - B.h / 2), bw = f(B.w), bh = f(B.h);
  g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = f(.02); g.shadowOffsetX = f(.012); g.shadowOffsetY = f(.016);
  g.fillStyle = '#e9e4da'; g.fillRect(bx, by, bw, bh); g.restore();
  g.strokeStyle = '#cbc3b3'; g.lineWidth = f(.008); g.strokeRect(bx + f(.004), by + f(.004), bw - f(.008), bh - f(.008));
  g.fillStyle = 'rgba(140,168,190,.9)'; for (let i = 0; i < 3; i++) g.fillRect(bx + bw * (.2 + i * .25), by + bh * .2, bw * .1, bh * .6);
  g.fillStyle = '#9a9a98'; for (let i = 0; i < 6; i++) { g.fillRect(bx + bw * .05, by + bh * (.12 + i * .13), bw * .06, bh * .08); }
  g.fillStyle = '#3c3f44'; g.beginPath(); g.arc(bx + bw * .92, by + bh * .18, bh * .055, 0, Math.PI * 2); g.arc(bx + bw * .92, by + bh * .36, bh * .055, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ddd3c2'; g.fillRect(f(.44), by + bh, f(.12), f(.035));
  // trees
  const tree = (x: number, y: number, r: number) => {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + r * .35, y + r * .45, r, r * .9, 0, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r);
    gr.addColorStop(0, '#6f9a45'); gr.addColorStop(.7, '#3f6a26'); gr.addColorStop(1, '#2b4a1a');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  for (let t = 0; t < 1; t += .028) { tree(f(.035 + t * .93), f(.105 + R() * .012), f(.016 + R() * .01)); tree(f(.035 + t * .93), f(.825 + R() * .01), f(.014 + R() * .008)); }
  for (let t = 0; t < 1; t += .045) { tree(f(.02 + R() * .01), f(.15 + t * .66), f(.015 + R() * .008)); tree(f(.975 + R() * .01), f(.15 + t * .66), f(.015 + R() * .008)); }
  for (let i = 0; i < 14; i++) tree(f(.72 + R() * .21), f(.23 + R() * .54), f(.012 + R() * .012));
  for (let i = 0; i < 6; i++) { tree(f(.355 + i * .058), f(.715), f(.013)); }
  return { img: c, b: B };
}

export function setHall(img: Img, b: Box) {
  HALL = { img, b, iw: img.width, ih: img.height };
  const sm = mk(Math.max(8, img.width >> 4), Math.max(8, img.height >> 4));
  ctx2d(sm).drawImage(img, 0, 0, sm.width, sm.height);
  HALLBG = sm;
  layoutHall();
}

export function layoutHall() {
  const { W, H, PORTRAIT } = view;
  if (!HALL || !W) return;
  const bw = HALL.b.w * HALL.iw, bh = HALL.b.h * HALL.ih;
  const s = PORTRAIT ? Math.min(.68 * W / bw, .46 * H / bh) : Math.min(.46 * W / bw, .52 * H / bh);
  HL = { s };
}

export function drawHall(p: number) {
  if (!HALL) return;
  const { W, H, CX, CY } = view;
  const t = easeOut3(clamp((p - .735) / (.865 - .735), 0, 1));
  const hz = lerp(.5, 1, t);
  const s = HL.s * hz;
  const dw = HALL.iw * s, dh = HALL.ih * s;
  const x = CX - HALL.b.cx * dw, y = CY - HALL.b.cy * dh;
  if (x > 0 || y > 0 || x + dw < W || y + dh < H) {
    const cs = Math.max(W / HALLBG.width, H / HALLBG.height) * 1.1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(HALLBG, CX - HALLBG.width * cs / 2, CY - HALLBG.height * cs / 2, HALLBG.width * cs, HALLBG.height * cs);
  }
  ctx.drawImage(HALL.img, x, y, dw, dh);
  const haze = (1 - t) * .2;
  if (haze > 0) { ctx.globalAlpha = haze; ctx.fillStyle = '#e8eef7'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

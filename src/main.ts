/* Celestia Banquets: scroll journey
   Milky Way → solar system → Earth → India → Nagpur → clouds → the building → drape "Coming Soon". */
import './style.css';
import { clamp, sstep } from './util';
import { view, clock, ctx, canvas2d } from './view';
import { HALL_IMAGE, HALL_BUILDING } from './config';
import { LK, Lat, buildKeys } from './timeline';
import { buildLayers } from './geo/layers';
import { buildGalaxy, buildBG, drawBG, drawGalaxy } from './scenes/galaxy';
import { drawSolar } from './scenes/solar';
import { drawEarth, drawEarthOverlay } from './scenes/earth';
import { buildClouds, drawClouds } from './scenes/clouds';
import { buildPlaceholderHall, setHall, layoutHall, drawHall, buildTextTexture, drawDrape2D } from './scenes/hall2d';
type ThreeMod = typeof import('./three/index');

// Three.js (3D space, clouds, finale) loads lazily; the 2D journey starts immediately and is the fallback.
let T: (Omit<ThreeMod, 'Clouds'> & { clouds: InstanceType<ThreeMod['Clouds']> }) | null = null;
const credits = document.getElementById('mapcredit') as HTMLElement;
let creditOn = false;

const stage = document.getElementById('stage') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const lines = [...document.querySelectorAll<HTMLElement>('.line')].map(el => ({ el, a: +el.dataset.a!, b: +el.dataset.b!, o: -1 }));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let hintO = -1;

let VIG: CanvasGradient | null = null;
function drawVignette() {
  const { W, H, CX, CY, MIN } = view;
  if (!VIG) {
    VIG = ctx.createRadialGradient(CX, CY, MIN * .35, CX, CY, Math.hypot(W, H) * .6);
    VIG.addColorStop(0, 'rgba(0,0,0,0)'); VIG.addColorStop(1, 'rgba(0,0,0,.5)');
  }
  ctx.fillStyle = VIG; ctx.fillRect(0, 0, W, H);
}

function render(p: number) {
  const { W, H } = view;
  const L = Lat(p);
  const use3D = !!T?.finale.ready, live3D = use3D && p > .735;
  const space3D = !!T?.space.ready && !live3D && L > LK.sun - .9 && (use3D || p < .74);
  if (T) {
    if (live3D) T.finale.draw(p);
    else if (space3D) T.space.render(L);
    if ((live3D || space3D) && p > .67 && p < .805) T.clouds.render(p, use3D);
    T.showGL(live3D || space3D);
    const c = space3D && T.space.tiles.visible;
    if (c !== creditOn) { creditOn = c; credits.style.opacity = c ? '1' : '0'; }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (live3D && p > .741) ctx.clearRect(0, 0, W, H);
  else if (space3D) {
    // 3D space underneath: keep the 2D layer transparent, with the galaxy remnant, stars and labels on top
    ctx.clearRect(0, 0, W, H);
    if (L < LK.ind + .5) drawBG(L, 1 - sstep(LK.globe + .4, LK.ind - .2, L));
    if (L < 6.8) drawGalaxy(L);
    drawEarthOverlay(L, p, (lon, lat) => T!.space.project(lon, lat));
  } else {
    ctx.fillStyle = '#04050b'; ctx.fillRect(0, 0, W, H);
    if (L < LK.ind + .5) drawBG(L, 1 - sstep(LK.globe + .4, LK.ind - .2, L));
    if (L < 6.8) drawGalaxy(L);
    const globeA = sstep(LK.earth - .06, LK.earth + .12, L);
    if (L > LK.sun - .9 && L < LK.earth + 2) drawSolar(L, globeA);
    if (L > LK.earth - .07 && p < .76) drawEarth(L, p);
    if (!use3D && p > .73) drawHall(p);
  }
  if (!space3D && !live3D && p > .67 && p < .805) drawClouds(p, use3D);
  const wo = sstep(.71, .736, p) * (1 - sstep(.74, .772, p)) * .96;
  if (wo > 0) { ctx.globalAlpha = wo; ctx.fillStyle = use3D ? '#f4e2d4' : '#eef2f8'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  ctx.globalAlpha = live3D ? .55 : 1; drawVignette(); ctx.globalAlpha = 1;
  if (!use3D) drawDrape2D(p);
  for (const l of lines) {
    const t = (p - l.a) / (l.b - l.a);
    const o = t <= 0 || t >= 1 ? 0 : sstep(0, .2, t) * (1 - sstep(.8, 1, t));
    if (o !== l.o) {
      l.o = o;
      l.el.style.opacity = o.toFixed(3);
      l.el.style.transform = `translateY(${((1 - sstep(0, .25, t)) * 18 - sstep(.8, 1, t) * 14).toFixed(1)}px)`;
      l.el.style.filter = o < .99 ? `blur(${((1 - o) * 6).toFixed(1)}px)` : 'none';
    }
  }
  const ho = 1 - sstep(.004, .03, p);
  if (ho !== hintO) { hintO = ho; hint.style.opacity = ho.toFixed(3); }
}

function resize() {
  const r = stage.getBoundingClientRect();
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(2, Math.round(r.width * DPR)), H = Math.max(2, Math.round(r.height * DPR));
  canvas2d.width = W; canvas2d.height = H;
  Object.assign(view, { DPR, W, H, MIN: Math.min(W, H), MAX: Math.max(W, H), CX: W / 2, CY: H / 2, PORTRAIT: H > W * 1.05 });
  VIG = null;
  buildKeys(); layoutHall(); buildTextTexture(false);
  if (T) { T.resizeRenderer(); T.finale.resize(); }
}

/* scroll progress, eased towards the target so the journey glides */
let pT = 0, pS = 0, last = performance.now();
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  pT = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
}
function frame(now: number) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; clock.time += dt;
  pS += (pT - pS) * (reduced ? 1 : 1 - Math.exp(-dt * 4.2));
  if (Math.abs(pT - pS) < 1e-5) pS = pT;
  render(pS);
  requestAnimationFrame(frame);
}

// ---- boot ----
buildLayers(); buildGalaxy(); buildBG(); buildClouds();
const ph = buildPlaceholderHall();
setHall(ph.img, ph.b);
resize();
buildTextTexture(true);
if (HALL_IMAGE) {
  const im = new Image();
  im.onload = () => { setHall(im, HALL_BUILDING); buildTextTexture(true); };
  im.src = HALL_IMAGE;
}
const fontsReady = document.fonts?.load
  ? Promise.all([document.fonts.load('italic 500 80px "Cormorant Garamond"'), document.fonts.load('500 40px Jost')]).catch(() => {})
  : Promise.resolve();
fontsReady.then(() => buildTextTexture(true));
addEventListener('scroll', readScroll, { passive: true });
new ResizeObserver(() => resize()).observe(stage);
readScroll(); pS = pT;
// debug hook: window.__celestia.setP(0.9) jumps to a point in the journey
(window as unknown as { __celestia: unknown }).__celestia = { setP: (v: number) => { pT = pS = v; }, get three() { return T; } };
import('./three/index')
  .then(async m => {
    const clouds = new m.Clouds();
    T = { ...m, clouds };
    await Promise.all([
      m.space.start().catch(err => console.warn('3D space unavailable, using 2D version:', err)),
      m.finale.start(clouds.textures),
    ]);
    await fontsReady; m.finale.refreshText();
  })
  .catch(err => { console.warn('3D unavailable, using 2D version:', err); T = null; });
requestAnimationFrame(frame);

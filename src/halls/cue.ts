/* The intro cue on the hall explorer, ported from the Reposé residences selector:
   the building dims, a soft light with a bright edge sweeps down it while a white line
   ticks in under every floor, a tap marker slides down and lands on one floor (which lights
   as a glass band), and the copy rises in. The floor list stays hidden until the visitor
   taps the building or the "Explore the halls" pill. Timings and values match the original. */

export interface CueGeometry {
  /** image box on screen, px */
  ox: number; oy: number; s: number;
  /** image size, px */
  iw: number; ih: number;
  /** left/right edge of the tower, fractions of the image width */
  x: [number, number];
  /** every floor's [top, bottom], fractions of the image height, top floor first */
  bands: [number, number][];
  /** index into bands of the floor the tap marker lands on */
  target: number;
}

const NS = 'http://www.w3.org/2000/svg';

export class Cue {
  readonly el: HTMLElement;
  readonly invite: HTMLButtonElement;
  readonly gate: HTMLElement;
  readonly tower: HTMLButtonElement;
  private g: CueGeometry | null = null;

  constructor(private onReveal: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'ex-cue'; this.el.setAttribute('aria-hidden', 'true');
    this.invite = document.createElement('button');
    this.invite.type = 'button'; this.invite.className = 'ex-invite';
    this.invite.innerHTML = '<span class="ex-invite__label">Explore the halls</span><span class="ex-invite__arrow">→</span>';
    this.gate = document.createElement('div');
    this.gate.className = 'ex-gate';
    this.gate.innerHTML = '<span class="ex-gate__rule" aria-hidden="true"></span><p class="ex-gate__text">Open a hall to step inside</p>';
    this.tower = document.createElement('button');
    this.tower.type = 'button'; this.tower.className = 'ex-tower'; this.tower.setAttribute('aria-label', 'Explore the halls');
    this.invite.addEventListener('click', () => this.onReveal());
    this.tower.addEventListener('click', () => this.onReveal());
  }

  /** Keep the art, the pill and the tap area on the building as it is laid out. */
  place(g: CueGeometry) {
    const portraitChanged = this.g && (this.g.iw !== g.iw || this.g.ih !== g.ih);
    this.g = g;
    const art = this.el.querySelector<SVGSVGElement>('.ex-cue__art');
    if (art) {
      if (portraitChanged) { this.build(); return; }
      this.boxArt(art);
    }
    this.placeControls();
  }

  /** (Re)start the whole cue from the beginning. */
  play() { this.build(); }

  private boxArt(art: SVGSVGElement) {
    const g = this.g!;
    Object.assign(art.style, { left: `${g.ox}px`, top: `${g.oy}px`, width: `${g.iw * g.s}px`, height: `${g.ih * g.s}px` });
  }

  private placeControls() {
    const g = this.g; if (!g) return;
    const { ox, oy, s, iw, ih } = g;
    const x0 = ox + g.x[0] * iw * s, x1 = ox + g.x[1] * iw * s;
    const top = oy + g.bands[0][0] * ih * s, bottom = oy + g.bands[g.bands.length - 1][1] * ih * s;
    Object.assign(this.tower.style, { left: `${x0}px`, top: `${top}px`, width: `${x1 - x0}px`, height: `${bottom - top}px` });
    // the pill sits low on the tower, centred (as on Reposé: 85% of the way down)
    Object.assign(this.invite.style, { left: `${(x0 + x1) / 2}px`, top: `${top + (bottom - top) * .85}px` });
  }

  private build() {
    const g = this.g; if (!g) return;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const { iw, ih, s } = g;
    const X0 = g.x[0] * iw, X1 = g.x[1] * iw, W = X1 - X0;
    const ys = g.bands.map(([a, b]) => [a * ih, b * ih] as [number, number]);
    const top = ys[0][0], bottom = ys[ys.length - 1][1], H = bottom - top;
    const travel = H * 1.0456;
    const tgt = ys[g.target];
    const f = (n: number) => n.toFixed(2);

    // a white tick under every floor, each lit as the sweep passes it
    const ticks = ys.map(([, y]) => {
      const delay = .35 + 2.6 * ((y - top) / travel);
      return `<g class="ex-cue__tick" style="animation-delay:${delay.toFixed(3)}s">`
        + `<line class="ex-cue__tick-under" x1="${f(X0)}" y1="${f(y)}" x2="${f(X1)}" y2="${f(y)}"/>`
        + `<line class="ex-cue__tick-line" x1="${f(X0)}" y1="${f(y)}" x2="${f(X1)}" y2="${f(y)}"/></g>`;
    }).join('');
    const glow = H * .1673;
    const k = (coarse ? 1.414 : 1) / s;     // tap marker keeps its on-screen size
    const cx = X0 + W / 2;

    this.el.innerHTML = `
      <div class="ex-cue__wash"></div>
      <svg class="ex-cue__art" viewBox="0 0 ${iw} ${ih}" preserveAspectRatio="none" focusable="false" xmlns="${NS}">
        <defs>
          <linearGradient id="ex-cue-sweep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="55%" stop-color="#fff" stop-opacity=".42"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
          <clipPath id="ex-cue-tower"><rect x="${f(X0)}" y="${f(top)}" width="${f(W)}" height="${f(H)}"/></clipPath>
        </defs>
        <g clip-path="url(#ex-cue-tower)">
          ${ticks}
          <rect class="ex-cue__band" x="${f(X0)}" y="${f(tgt[0])}" width="${f(W)}" height="${f(tgt[1] - tgt[0])}"/>
          <g class="ex-cue__sweep" style="--travel:${f(travel)}px">
            <rect x="${f(X0 - W * .46)}" y="${f(top - glow)}" width="${f(W * 1.92)}" height="${f(glow)}" fill="url(#ex-cue-sweep)"/>
            <line class="ex-cue__edge" x1="${f(X0 - W * .46)}" y1="${f(top)}" x2="${f(X1 + W * .46)}" y2="${f(top)}"/>
          </g>
        </g>
        <g class="ex-cue__pointer" style="--from:${f(top)}px;--to:${f((tgt[0] + tgt[1]) / 2)}px">
          <g transform="translate(${f(cx)} 0)">
            <circle class="ex-cue__ring" cx="0" cy="0" r="${f(17 * k)}"/>
            <circle class="ex-cue__tap" cx="0" cy="0" r="${f(8 * k)}"/>
          </g>
        </g>
      </svg>
      <div class="ex-cue__copy">
        <span class="ex-cue__eyebrow">The halls</span>
        <span class="ex-cue__rule" aria-hidden="true"></span>
        <h3 class="ex-cue__headline">Eight floors.<br><em>Every celebration.</em></h3>
        <p class="ex-cue__action">${coarse ? 'Tap' : 'Click'} the building · choose a level</p>
      </div>`;
    this.boxArt(this.el.querySelector<SVGSVGElement>('.ex-cue__art')!);
    this.placeControls();
  }
}

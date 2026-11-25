/* =====================================================================
   EXPLORE THE HALLS (full screen, after the film): the straight-on front view of
   Celestia. Hover a floor and a band of light runs across it with an "Open …" tag;
   the panel on the left shows that floor. Opening a hall shows a full-screen view of it
   (image, details, Enquire now); room floors go straight to the enquiry page.
   ===================================================================== */
import { floors, BUILDING_X, type Floor } from './data';
import { Cue } from './cue';

const IMG = `${import.meta.env.BASE_URL}halls/front.webp`;
const IW = 1672, IH = 941;
// portrait phones use a tall crop of the centre pavilion
const IMG_M = `${import.meta.env.BASE_URL}halls/front-mobile.webp`;
const IWM = 880, IHM = 1912;
// left/right edge of the pavilion's window bays in the phone image (fractions of its width): the select frame spans this
const FRAME_XM: [number, number] = [0.165, 0.8];
// the central pavilion's window bays in the wide desktop image: the intro cue runs down this "tower"
const CUE_X: [number, number] = [0.381, 0.617];
const INTERIORS = `${import.meta.env.BASE_URL}halls/interiors/`;
/** enquiry page, with the hall (or 'rooms') pre-selected */
export const enquiryUrl = (id: string) => `${import.meta.env.BASE_URL}enquiry.html?for=${encodeURIComponent(id)}`;

export class Explorer {
  private root: HTMLElement;
  private img: HTMLImageElement;
  private bandsEl: HTMLElement;
  private panel: HTMLElement;
  private bands = new Map<string, HTMLButtonElement>();
  private levels = new Map<string, HTMLButtonElement>();
  private levelsEl: HTMLElement;
  private halfEl: HTMLElement;
  private locked: Floor | null = null;
  private shown: Floor | null = null;
  private setupIx = 0;
  private active = false;
  private lastO = -1;
  private lastScale = -1;
  private curSrc = IMG;
  private detail: HTMLElement;
  private opened: Floor | null = null;
  private detailSetup = 0;
  // intro cue (Reposé style); the floor list appears once the visitor taps the building
  private cue = new Cue(() => this.reveal());
  private revealed = false;

  constructor(stage: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'explore';
    this.root.setAttribute('aria-label', 'Explore the halls');
    this.img = document.createElement('img');
    this.img.className = 'ex-img'; this.img.src = IMG; this.img.alt = 'Front view of Celestia Banquets, Nagpur'; this.img.decoding = 'async';
    const shade = document.createElement('div'); shade.className = 'ex-shade';
    this.bandsEl = document.createElement('div'); this.bandsEl.className = 'ex-bands';
    this.halfEl = document.createElement('div'); this.halfEl.className = 'ex-half';
    this.panel = document.createElement('aside'); this.panel.className = 'ex-panel'; this.panel.setAttribute('aria-live', 'polite');
    // floor numbers down the right edge (top floor first), as on the building
    this.levelsEl = document.createElement('ol'); this.levelsEl.className = 'ex-levels'; this.levelsEl.setAttribute('aria-label', 'Floors');
    for (const f of floors) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = `ex-lvl ${f.kind}`;
      b.textContent = f.short === 'G' ? 'G' : f.short.padStart(2, '0');
      b.setAttribute('aria-label', `${f.level}: ${f.name}`);
      b.addEventListener('mouseenter', () => this.hover(f));
      b.addEventListener('click', () => this.select(f));
      li.appendChild(b); this.levelsEl.appendChild(li); this.levels.set(f.id, b);
    }
    this.levelsEl.addEventListener('mouseleave', () => this.hover(null));

    for (const f of floors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ex-band ${f.kind}`;
      b.setAttribute('aria-label', `${f.level}: ${f.name}`);
      b.innerHTML = `<span class="ex-tag">${f.kind === 'hall' ? `Open ${f.name}` : 'Enquire about rooms'}</span>`;
      b.addEventListener('mouseenter', () => this.hover(f));
      b.addEventListener('focus', () => this.hover(f));
      b.addEventListener('click', () => this.select(f));
      this.bandsEl.appendChild(b); this.bands.set(f.id, b);
    }
    this.bandsEl.appendChild(this.halfEl);
    this.bandsEl.addEventListener('mouseleave', () => this.hover(null));

    this.detail = document.createElement('div');
    this.detail.className = 'ex-detail'; this.detail.setAttribute('role', 'dialog'); this.detail.setAttribute('aria-hidden', 'true');
    this.root.append(this.img, shade, this.bandsEl, this.cue.el, this.cue.tower, this.cue.invite, this.cue.gate, this.panel, this.detail, this.levelsEl);
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.opened) this.closeDetail(); });
    stage.appendChild(this.root);
    this.img.addEventListener('load', () => this.layout());
    this.show(null);
  }

  /** Size the image and position the floor bands over it. Landscape: the wide render, cover, centred.
      Portrait (phones): the tall pavilion image fills the screen; bands run the full width. */
  layout() {
    const W = this.root.clientWidth, H = this.root.clientHeight;
    if (!W || !H) return;
    const portrait = H > W * 1.1;
    const src = portrait ? IMG_M : IMG;
    if (this.curSrc !== src) { this.curSrc = src; this.img.src = src; }
    const iw = portrait ? IWM : IW, ih = portrait ? IHM : IH;
    const bandOf = (f: Floor) => portrait ? f.bandM : f.band;
    const k = this.lastScale > 0 ? this.lastScale : 1;
    const s = Math.max(W / iw, H / ih) * k;
    const ox = (W - iw * s) / 2;
    let oy = (H - ih * s) / 2;
    // phones: lift the building so a selected lower floor sits clear of the text at the bottom
    const f = portrait ? (this.locked ?? this.shown) : null;
    if (f) { const c = (bandOf(f)[0] + bandOf(f)[1]) / 2; oy = Math.min(oy, H * .42 - c * ih * s); }
    // phones, during the intro: the tower ends about two thirds down, clear of the copy (as on Reposé)
    else if (portrait && !this.revealed) oy = Math.min(oy, H * .66 - bandOf(floors[floors.length - 1])[1] * ih * s);
    Object.assign(this.img.style, { left: `${ox}px`, top: `${oy}px`, width: `${iw * s}px`, height: `${ih * s}px` });
    const x0 = portrait ? 0 : Math.max(0, ox + BUILDING_X[0] * iw * s), x1 = portrait ? W : Math.min(W, ox + BUILDING_X[1] * iw * s);
    for (const g of floors) {
      const b = this.bands.get(g.id)!, band = bandOf(g);
      b.style.left = `${x0}px`; b.style.width = `${x1 - x0}px`;
      b.style.top = `${oy + band[0] * ih * s}px`; b.style.height = `${(band[1] - band[0]) * ih * s}px`;
      if (portrait) {
        // frame edges measured on the facade, as px from the band's left edge
        b.style.setProperty('--fx0', `${ox + FRAME_XM[0] * iw * s}px`);
        b.style.setProperty('--fx1', `${ox + FRAME_XM[1] * iw * s}px`);
      }
    }
    this.placeHalf();
    this.cue.place({
      ox, oy, s, iw, ih, x: portrait ? FRAME_XM : CUE_X,
      bands: floors.map(bandOf), target: Math.max(0, floors.findIndex(g => g.id === 'f5')),
    });
  }

  /**
   * @param o visibility 0–1 (cross-fade from the film)
   * @param push 0–1, the slow push-in as it arrives
   */
  update(o: number, push: number) {
    const scale = 1 + .06 * (1 - push);
    if (o !== this.lastO) {
      this.lastO = o;
      this.root.style.opacity = o.toFixed(3);
      this.root.style.visibility = o > 0 ? 'visible' : 'hidden';
    }
    if (Math.abs(scale - this.lastScale) > 1e-4) {
      this.lastScale = scale;
      this.layout();
    }
    const active = o > .98;
    if (active !== this.active) {
      this.active = active;
      this.root.classList.toggle('active', active);
      if (!active) { if (this.opened) this.closeDetail(); this.locked = null; this.show(null); this.root.classList.remove('cueing'); }
      else if (!this.revealed) this.playCue();
    }
  }

  /** Play the intro cue once the building picture is there. */
  private playCue() {
    if (!this.img.complete || !this.img.naturalWidth) { this.img.addEventListener('load', () => { if (this.active && !this.revealed) this.playCue(); }, { once: true }); return; }
    this.cue.play();
    this.root.classList.add('cueing');
  }

  /** The visitor tapped the building (or the pill): hand over to the floor list. */
  private reveal() {
    if (this.revealed) return;
    this.revealed = true;
    this.root.classList.remove('cueing');
    this.root.classList.add('revealed');
    this.layout();
  }

  /** Hover previews a floor; while one is clicked open, hover only lights the band. */
  private hover(f: Floor | null) {
    if (this.locked) { this.light(f ?? this.locked); return; }
    this.show(f);
  }

  private light(f: Floor | null) {
    for (const g of floors) {
      const l = this.levels.get(g.id)!;
      l.classList.toggle('on', g === f);
      l.classList.toggle('locked', g === this.locked);
      const b = this.bands.get(g.id)!;
      b.classList.toggle('on', g === f);
      b.classList.toggle('locked', g === this.locked);
      b.setAttribute('aria-pressed', String(g === this.locked));
    }
  }

  private panelKey = '';

  /** Halls open their full-screen view; room floors go to the enquiry page. */
  private select(f: Floor) {
    if (f.kind === 'rooms') { location.href = enquiryUrl('rooms'); return; }
    this.openDetail(f);
  }

  private openDetail(f: Floor) {
    this.opened = f; this.detailSetup = 0;
    this.locked = null; this.show(f);
    this.root.classList.add('detail-open');
    this.detail.setAttribute('aria-hidden', 'false');
    this.renderDetail();
  }

  private closeDetail() {
    this.opened = null;
    this.root.classList.remove('detail-open');
    this.detail.setAttribute('aria-hidden', 'true');
    this.show(null);
  }

  private renderDetail() {
    const f = this.opened; if (!f) return;
    const setup = f.setups?.[this.detailSetup];
    const capacity = setup ? setup.capacity : f.capacity;
    const note = setup && this.detailSetup > 0 ? 'guests' : f.capacityNote ?? '';
    for (const g of floors) this.levels.get(g.id)!.classList.toggle('locked', g === f);
    this.detail.innerHTML = `
      <div class="exd-head">
        <button type="button" class="exd-back"><span></span>Back to building</button>
        <h2 class="exd-name">${f.name}</h2>
        <p class="exd-meta">${capacity} ${note}</p>
        <p class="exd-sub"><span></span>${f.level}${f.idealFor ? ' · ' + f.idealFor.join(' · ') : ''}</p>
      </div>
      <figure class="exd-figure">
        <div class="exd-photo" data-name="${f.name}">${f.image ? `<img src="${INTERIORS}${f.image}" alt="${f.name} at Celestia Banquets" decoding="async">` : ''}</div>
        <figcaption>${f.name} · ${f.level}</figcaption>
      </figure>
      ${f.setups ? `<div class="exd-setups" role="group" aria-label="Hall layout">${f.setups.map((s, i) =>
        `<button type="button" data-setup="${i}" class="${i === this.detailSetup ? 'on' : ''}">${s.label}<small>${s.capacity}</small></button>`).join('')}</div>` : ''}
      <a class="exd-enquire" href="${enquiryUrl(f.id)}">Enquire now <span>↗</span></a>`;
    // no photo yet (or it failed to load): keep the elegant empty frame
    const im = this.detail.querySelector<HTMLImageElement>('.exd-photo img');
    im?.addEventListener('error', () => im.remove());
    im?.addEventListener('load', () => im.closest('.exd-photo')!.classList.add('has-photo'));
    this.detail.querySelector('.exd-back')!.addEventListener('click', () => this.closeDetail());
    this.detail.querySelectorAll<HTMLButtonElement>('[data-setup]').forEach(b => b.addEventListener('click', () => {
      this.detailSetup = +b.dataset.setup!; this.renderDetail();
    }));
  }

  private show(f: Floor | null) {
    if (f !== this.shown) this.setupIx = f && f === this.locked ? this.setupIx : 0;
    const moved = f !== this.shown;
    this.shown = f;
    this.light(f);
    if (moved) this.layout();
    this.root.classList.toggle('has-floor', !!f);
    this.placeHalf();
    const key = `${f?.id ?? '-'}|${this.setupIx}|${!!this.locked}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panel.innerHTML = f ? this.floorHtml(f) : this.introHtml();
    this.panel.querySelectorAll<HTMLButtonElement>('[data-setup]').forEach(b => b.addEventListener('click', () => {
      this.setupIx = +b.dataset.setup!; this.locked = f; this.show(f);
    }));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(b => {
      const g = floors.find(x => x.id === b.dataset.go)!;
      b.addEventListener('click', () => this.select(g));
      b.addEventListener('mouseenter', () => { if (!this.locked) this.light(g); });
    });
    this.panel.querySelector<HTMLButtonElement>('.ex-back')?.addEventListener('click', () => { this.locked = null; this.show(null); });
  }

  private placeHalf() {
    const f = this.shown;
    const on = !!f?.setups && this.setupIx > 0;
    this.halfEl.classList.toggle('on', on);
    if (!on || !f) return;
    const b = this.bands.get(f.id)!;
    const l = parseFloat(b.style.left), w = parseFloat(b.style.width) / 2;
    this.halfEl.style.left = `${this.setupIx === 1 ? l : l + w}px`; this.halfEl.style.width = `${w}px`;
    this.halfEl.style.top = b.style.top; this.halfEl.style.height = b.style.height;
  }

  private introHtml() {
    const halls = floors.filter(f => f.kind === 'hall').slice().reverse();
    return `
      <h2 class="ex-title">Explore <br>the halls</h2>
      <p class="ex-lead">Select a level to discover the halls.</p>
      <ul class="ex-list">${halls.map(f => `<li><button type="button" data-go="${f.id}"><span>${f.short}</span><b>${f.name}</b><i>${f.capacity}</i></button></li>`).join('')}
        <li><button type="button" data-go="f3"><span>3·4·6·7</span><b>Guest rooms</b><i>80</i></button></li></ul>`;
  }

  private floorHtml(f: Floor) {
    const setup = f.setups?.[this.setupIx];
    const capacity = setup ? setup.capacity : f.capacity;
    const note = setup && this.setupIx > 0 ? 'guests' : f.capacityNote ?? '';
    return `
      <h2 class="ex-title">Explore <br>the halls</h2>
      <p class="ex-lead">${f.kind === 'hall' ? 'Click to open this hall' : 'Click to enquire about rooms'}</p>
      <p class="ex-level">${f.level}</p>
      <h3 class="ex-name">${f.name}</h3>
      <p class="ex-cap"><b>${capacity}</b><span>${note}</span></p>
      ${f.setups ? `<div class="ex-setups" role="group" aria-label="Hall layout">${f.setups.map((s, i) =>
        `<button type="button" data-setup="${i}" class="${i === this.setupIx ? 'on' : ''}">${s.label}<small>${s.capacity}</small></button>`).join('')}</div>` : ''}
      <p class="ex-summary">${f.summary}</p>
      ${f.idealFor ? `<p class="ex-label">Ideal for</p><p class="ex-ideal">${f.idealFor.join(' · ')}</p>` : ''}
      <p class="ex-label">Highlights</p>
      <ul class="ex-points">${f.highlights.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }
}

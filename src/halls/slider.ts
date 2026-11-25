/* "The halls" card slider, ported from the Red Dot destinations carousel:
   a full-bleed background that slides in from the side with a parallax, three fanned photo
   cards and the hall name in the centre (cross-fade 1.5 s: the name rises out of a blur, the
   cards settle from 1.3× and a blur), tabs with a progress line, prev/next, swipe, and
   autoplay every 6 s that pauses while the pointer is over it. */

const B = import.meta.env.BASE_URL;

export interface SliderHall {
  name: string;
  /** link for the name (enquiry page with the hall pre-selected) */
  href: string;
  /** background, then three cards: back-left, back-right, front */
  bg: string;
  cards: [string, string, string];
}

// PLACEHOLDER IMAGES: swap in each hall's own photos (public/halls/slider/…) when they arrive.
export const sliderHalls: SliderHall[] = [
  { name: 'Orion', href: `${B}enquiry.html?for=g`, bg: `${B}film/f-0286.webp`,
    cards: [`${B}story/teal-flowers.webp`, `${B}halls/front-mobile.webp`, `${B}story/bride-mirror.webp`] },
  { name: 'Nova', href: `${B}enquiry.html?for=f1`, bg: `${B}film/f-0240.webp`,
    cards: [`${B}story/bride-mirror.webp`, `${B}film/f-0270.webp`, `${B}story/teal-flowers.webp`] },
  { name: 'Horizon', href: `${B}enquiry.html?for=f2`, bg: `${B}film/f-0190.webp`,
    cards: [`${B}story/teal-flowers.webp`, `${B}story/bride-mirror.webp`, `${B}halls/front-mobile.webp`] },
  { name: 'Rooftop', href: `${B}enquiry.html?for=f5`, bg: `${B}film/f-0270.webp`,
    cards: [`${B}halls/front-mobile.webp`, `${B}story/teal-flowers.webp`, `${B}story/bride-mirror.webp`] },
];

const SPEED = 1500, DELAY = 6000;

export function initHallSlider(root: HTMLElement | null) {
  if (!root) return;
  const n = sliderHalls.length;
  const pad = (i: number) => String(i + 1).padStart(2, '0');
  root.innerHTML = `
    <div class="hs-bg" aria-hidden="true">${sliderHalls.map(h => `<div class="hs-bg__slide"><img src="${h.bg}" alt="" loading="lazy" decoding="async"></div>`).join('')}</div>
    <div class="hs-stage">${sliderHalls.map((h, i) => `
      <div class="hs-slide" role="group" aria-roledescription="slide" aria-label="${pad(i)} of ${pad(n - 1)}: ${h.name}">
        <a class="hs-title" href="${h.href}">${h.name}</a>
        <div class="hs-cards">${h.cards.map((c, k) => `<div class="hs-card"><img src="${c}" alt="${k === 2 ? `${h.name} at Celestia Banquets` : ''}" loading="lazy" decoding="async"></div>`).join('')}</div>
      </div>`).join('')}</div>
    <div class="hs-footer">
      <div class="hs-tabs" role="tablist" aria-label="Halls">${sliderHalls.map((h, i) => `
        <button type="button" class="hs-tab" role="tab" data-i="${i}"><span class="hs-tab__progress"></span><span class="hs-tab__label">${h.name}</span></button>`).join('')}</div>
      <div class="hs-nav">
        <button type="button" class="hs-arrow hs-prev" aria-label="Previous hall">${arrow(true)}</button>
        <button type="button" class="hs-arrow hs-next" aria-label="Next hall">${arrow(false)}</button>
      </div>
    </div>`;

  const bgs = [...root.querySelectorAll<HTMLElement>('.hs-bg__slide')];
  const slides = [...root.querySelectorAll<HTMLElement>('.hs-slide')];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.hs-tab')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, busy = false;

  // background: active in place; the others wait off to the right (forward) with their picture counter-shifted
  const setBg = (el: HTMLElement, x: string, imgX: string, z: number, animate: boolean) => {
    const img = el.firstElementChild as HTMLElement;
    const t = animate && !reduced ? `transform ${SPEED}ms cubic-bezier(.77,0,.175,1)` : 'none';
    el.style.transition = t; img.style.transition = t;
    el.style.transform = `translate3d(${x},0,0)`; img.style.transform = `translate3d(${imgX},0,0)`;
    el.style.zIndex = String(z);
  };
  bgs.forEach((el, i) => setBg(el, i === 0 ? '0' : '100%', i === 0 ? '0' : '-80%', i === 0 ? 2 : 1, false));

  const setSlide = (el: HTMLElement, state: 'active' | 'out-up' | 'out-down' | 'in-up' | 'in-down', animate: boolean) => {
    el.classList.toggle('no-anim', !animate || reduced);
    el.dataset.state = state;
  };
  slides.forEach((el, i) => setSlide(el, i === 0 ? 'active' : 'in-up', false));

  const go = (to: number, dir: 1 | -1) => {
    to = (to + n) % n;
    if (to === cur || busy) return;
    busy = true;
    const from = cur; cur = to;
    // background: the new picture slides over the old one from the side it comes from
    setBg(bgs[to], dir > 0 ? '100%' : '-100%', dir > 0 ? '-80%' : '80%', 3, false);
    void bgs[to].offsetWidth;
    setBg(bgs[to], '0', '0', 3, true);
    setBg(bgs[from], dir > 0 ? '-100%' : '100%', dir > 0 ? '80%' : '-80%', 2, true);
    // cards + name: cross-fade with the parallax lift
    setSlide(slides[to], dir > 0 ? 'in-up' : 'in-down', false);
    void slides[to].offsetWidth;
    setSlide(slides[to], 'active', true);
    setSlide(slides[from], dir > 0 ? 'out-up' : 'out-down', true);
    tabs.forEach((t, i) => { t.classList.toggle('on', i === to); t.setAttribute('aria-selected', String(i === to)); });
    elapsed = 0; setProgress(0);
    setTimeout(() => {
      busy = false;
      bgs.forEach((el, i) => { if (i !== cur) setBg(el, '100%', '-80%', 1, false); });
      slides.forEach((el, i) => { if (i !== cur) setSlide(el, 'in-up', false); });
    }, reduced ? 0 : SPEED);
  };
  tabs[0].classList.add('on'); tabs[0].setAttribute('aria-selected', 'true');
  tabs.forEach((t, i) => t.addEventListener('click', () => go(i, i > cur ? 1 : -1)));
  root.querySelector('.hs-next')!.addEventListener('click', () => go(cur + 1, 1));
  root.querySelector('.hs-prev')!.addEventListener('click', () => go(cur - 1, -1));

  // autoplay: 6 s after each change, shown as the line filling over the active tab; pauses on hover
  let elapsed = 0, last = performance.now(), hovering = false, visible = false;
  const setProgress = (p: number) => root.style.setProperty('--hs-progress', p.toFixed(4));
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    root.addEventListener('mouseenter', () => { hovering = true; });
    root.addEventListener('mouseleave', () => { hovering = false; });
  }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: .25 }).observe(root);
  const tick = (now: number) => {
    const dt = now - last; last = now;
    if (visible && !hovering && !busy && !reduced) {
      elapsed += dt;
      setProgress(Math.min(1, elapsed / DELAY));
      if (elapsed >= DELAY) go(cur + 1, 1);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // swipe / drag
  let sx = 0, sy = 0, down = false;
  root.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('.hs-footer')) return; down = true; sx = e.clientX; sy = e.clientY; });
  root.addEventListener('pointerup', e => {
    if (!down) return; down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
  root.addEventListener('pointercancel', () => { down = false; });
  // a drag shouldn't follow the name's link
  root.querySelectorAll('.hs-title').forEach(a => a.addEventListener('click', e => {
    if (Math.abs((e as MouseEvent).clientX - sx) > 10) e.preventDefault();
  }));
}

function arrow(left: boolean) {
  return `<span class="hs-arrow__ring"><svg viewBox="0 0 50 50" fill="none"><circle vector-effect="non-scaling-stroke" cx="25" cy="25" r="24" stroke="currentColor" stroke-dasharray="1 3" stroke-linecap="round"/></svg></span>`
    + `<svg class="hs-arrow__icon" viewBox="0 0 16 16" fill="none"><path d="${left ? 'M13 8H3M7 4 3 8l4 4' : 'M3 8h10M9 4l4 4-4 4'}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

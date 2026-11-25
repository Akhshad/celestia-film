/* The closing sections, ported from the Red Dot homepage (dark brown swapped for Celestia green):
   1. "The heart of your celebration": a serif marquee that loops left, reverses while you scroll
      up and shifts with the scroll, over three drifting photos; then the guest-rooms copy.
   2. Featured spaces: a centred carousel (3 across on desktop, 1 on phones); the middle slide
      shows its name, details and photo, its neighbours fade to half.
   3. "Plan your celebration" call to action over a full-width picture.
   4. Footer: newsletter, wordmark, links, back to top. */

const B = import.meta.env.BASE_URL;
const enq = (q = '') => `${B}enquiry.html${q ? `?${q}` : ''}`;
const KEY = import.meta.env.VITE_WEB3FORMS_KEY || '';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const ring = `<span class="rd-btn__icon" aria-hidden="true"><span class="rd-btn__ring"><svg viewBox="0 0 50 50" fill="none"><circle vector-effect="non-scaling-stroke" cx="25" cy="25" r="24" stroke="currentColor" stroke-dasharray="1 3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><svg class="rd-btn__arrow" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const btn = (label: string, href: string) => `<a class="rd-btn" href="${href}" data-reveal><span class="rd-btn__label">${label}</span>${ring}</a>`;
const pin = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 14s4.5-4.2 4.5-7.6A4.5 4.5 0 0 0 3.5 6.4C3.5 9.8 8 14 8 14Z" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="6.4" r="1.6" stroke="currentColor" stroke-width="1.1"/></svg>`;

// PLACEHOLDER IMAGES: replace with Celestia's own photos when they arrive.
const JOURNEY_IMAGES = [`${B}story/teal-flowers.webp`, `${B}story/bride-mirror.webp`, `${B}halls/front-mobile.webp`];
const SPACES = [
  { name: 'Orion', where: 'Ground floor · 400–500 guests', img: `${B}story/teal-flowers.webp`, id: 'g',
    text: 'A flexible banquet hall at street level that opens up for larger events or divides into two for smaller functions.' },
  { name: 'Nova', where: 'First floor · 2,000 guests', img: `${B}halls/front-mobile.webp`, id: 'f1',
    text: 'The largest hall at Celestia, made for grand weddings and receptions with room for every guest.' },
  { name: 'Horizon', where: 'Second floor · 1,500 guests', img: `${B}story/bride-mirror.webp`, id: 'f2',
    text: 'A grand banquet hall for weddings, receptions and sangeet nights, one floor above Nova.' },
  { name: 'The Rooftop', where: 'Fifth floor · 500 guests', img: `${B}film/f-0286.webp`, id: 'f5',
    text: 'An open-air rooftop above Nagpur, made for haldi, mehendi and evenings under the sky.' },
];
const CTA_IMAGE = `${B}halls/front.webp`;

export function initFinale() {
  journey(document.getElementById('journey'));
  spaces(document.getElementById('spaces'));
  cta(document.getElementById('plan'));
  footer(document.getElementById('site-footer'));
}

/* ---------- 1. marquee + drifting photos ---------- */
function journey(root: HTMLElement | null) {
  if (!root) return;
  const line = `<p class="jr-marquee__p">The heart of your <i>celebration</i></p>`;
  root.innerHTML = `
    <div class="jr-images" aria-hidden="true">${JOURNEY_IMAGES.map(s => `<div class="jr-image"><img src="${s}" alt="" loading="lazy" decoding="async"></div>`).join('')}</div>
    <div class="jr-marquee" aria-label="The heart of your celebration">
      <div class="jr-marquee__scroll"><div class="jr-marquee__collection">${line}${line}</div></div>
    </div>
    <div class="jr-content">
      <div class="jr-copy">
        <p class="rd-hand" data-reveal>Be our guest</p>
        <p class="jr-body" data-reveal>Eighty guest rooms on floors three, four, six and seven, right above the celebration. Your family can rest, dress and gather without ever leaving Celestia, and every hall is a lift ride away.</p>
        ${btn('Discover your stay', enq('for=rooms'))}
      </div>
    </div>`;
  const scroll = root.querySelector<HTMLElement>('.jr-marquee__scroll')!;
  const first = root.querySelector<HTMLElement>('.jr-marquee__collection')!;
  for (let i = 0; i < 2; i++) scroll.appendChild(first.cloneNode(true));
  const cols = [...scroll.querySelectorAll<HTMLElement>('.jr-marquee__collection')];
  const imgs = [...root.querySelectorAll<HTMLElement>('.jr-image img')];
  if (reduced) return;

  // loop: each collection slides -100% of its own width over `dur` seconds (Red Dot: speed 15 × width/viewport)
  let pos = 0, dir = 1, lastY = scrollY, last = performance.now(), visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '20% 0px' }).observe(root);
  const tick = (now: number) => {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (visible) {
      const w = first.offsetWidth, vw = innerWidth;
      const dur = 15 * (w / vw) * (vw < 479 ? .25 : vw < 991 ? .5 : 1);
      pos = (pos + dir * dt / dur) % 1;
      const x = -(((pos % 1) + 1) % 1) * 100;
      for (const c of cols) c.style.transform = `translate3d(${x.toFixed(3)}%,0,0)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const onScroll = () => {
    const y = scrollY; if (y !== lastY) dir = y > lastY ? 1 : -1; lastY = y;
    const r = root.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    const p = clamp01((vh - r.top) / (vh + r.height));        // top-bottom .. bottom-top
    scroll.style.transform = `translate3d(${(10 - 20 * p).toFixed(3)}vw,0,0)`;
    for (const im of imgs) im.style.transform = `translate3d(0,${(20 * p).toFixed(3)}%,0)`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- 2. featured spaces carousel ---------- */
function spaces(root: HTMLElement | null) {
  if (!root) return;
  const arrow = (left: boolean, label: string) => `<button type="button" class="sp-arrow ${left ? 'sp-prev' : 'sp-next'}" aria-label="${label}"><span class="rd-btn__icon"><span class="rd-btn__ring"><svg viewBox="0 0 50 50" fill="none"><circle vector-effect="non-scaling-stroke" cx="25" cy="25" r="24" stroke="currentColor" stroke-dasharray="1 3" stroke-linecap="round"/></svg></span><svg class="rd-btn__arrow" viewBox="0 0 16 16" fill="none"><path d="${left ? 'M13 8H3M7 4 3 8l4 4' : 'M3 8h10M9 4l4 4-4 4'}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>`;
  root.innerHTML = `
    <div class="sp-intro">
      <p class="rd-hand" data-reveal>Featured spaces</p>
      <h2 class="sp-heading" data-reveal>Where every celebration <i>flows</i></h2>
      <p class="sp-lead" data-reveal>Three banquet halls and an open-air rooftop, all under one roof in Nagpur. Tell us about your occasion and we'll match it to the space that suits it best, with rooms upstairs for your family and guests.</p>
    </div>
    <div class="sp-content">
      <div class="sp-track">${SPACES.map(s => `
        <div class="sp-slide">
          <div class="sp-top"><h3 class="sp-title">${s.name}</h3><span class="sp-tag">${pin}<span>${s.where}</span></span></div>
          <div class="sp-image"><img src="${s.img}" alt="${s.name} at Celestia Banquets" loading="lazy" decoding="async"></div>
          <div class="sp-bottom"><p class="sp-text">${s.text}</p><a class="rd-btn rd-btn--plain" href="${enq(`for=${s.id}`)}"><span class="rd-btn__label">More info</span></a></div>
        </div>`).join('')}</div>
      ${arrow(true, 'Previous space')}${arrow(false, 'Next space')}
    </div>`;
  const slides = [...root.querySelectorAll<HTMLElement>('.sp-slide')];
  const track = root.querySelector<HTMLElement>('.sp-track')!;
  const n = slides.length;
  let cur = 0;
  const perView = () => innerWidth >= 1200 ? 3 : innerWidth >= 960 ? 2 : innerWidth >= 720 ? 1.5 : 1;
  const place = () => {
    const w = track.clientWidth / perView();
    slides.forEach((s, i) => {
      let d = i - cur;
      if (d > n / 2) d -= n; if (d < -n / 2 + .01) d += n;      // nearest way round the loop
      const a = Math.abs(d);
      s.style.width = `${w}px`;
      s.style.transform = `translate3d(${(d * w - w / 2).toFixed(1)}px,0,0)`;
      s.style.opacity = String(Math.max(0, 1 - a * .5));
      s.style.zIndex = String(10 - Math.round(a));
      s.classList.toggle('is-active', d === 0);
      s.setAttribute('aria-hidden', String(d !== 0));
      s.querySelectorAll('a').forEach(x => (x.tabIndex = d === 0 ? 0 : -1));
    });
  };
  const go = (k: number) => { cur = (k + n) % n; place(); };
  root.querySelector('.sp-prev')!.addEventListener('click', () => go(cur - 1));
  root.querySelector('.sp-next')!.addEventListener('click', () => go(cur + 1));
  slides.forEach((s, i) => s.addEventListener('click', e => { if (i !== cur) { e.preventDefault(); go(i); } }));
  let sx = 0, sy = 0, down = false;
  track.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; });
  track.addEventListener('pointerup', e => {
    if (!down) return; down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1));
  });
  addEventListener('resize', place);
  place();
}

/* ---------- 3. call to action ---------- */
function cta(root: HTMLElement | null) {
  if (!root) return;
  root.innerHTML = `
    <div class="cta-main">
      <h2 class="cta-heading" data-reveal>Plan <i>your</i> celebration</h2>
      <div class="cta-side">
        <p class="cta-body" data-reveal>Speak to our team to get started. After all, your celebration won't plan itself.</p>
        ${btn("Let's get planning", enq())}
      </div>
    </div>
    <div class="cta-bg"><img src="${CTA_IMAGE}" alt="Celestia Banquets, Nagpur" loading="lazy" decoding="async"></div>`;
}

/* ---------- 4. footer ---------- */
function footer(root: HTMLElement | null) {
  if (!root) return;
  const year = new Date().getFullYear();
  root.innerHTML = `
    <div class="ft-section ft-top">
      <span class="ft-signup">Sign up for news &amp; updates</span>
      <form class="ft-news" novalidate>
        <label class="sr-only" for="ft-email">Email address for news and updates</label>
        <input class="ft-news__input" id="ft-email" type="email" name="email" placeholder="Subscribe to our newsletter" autocomplete="email" required>
        <input type="checkbox" name="botcheck" class="enq-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="ft-news__submit" type="submit" aria-label="Subscribe">${ring}</button>
        <p class="ft-news__status" role="status"></p>
      </form>
    </div>
    <div class="ft-section ft-middle">
      <a class="ft-logo" href="#" aria-label="Celestia Banquets, back to the start"><img src="${B}brand/celestia-logo.svg" alt="Celestia Banquets" width="1522" height="843"></a>
      <div class="ft-col">
        <div class="ft-sub">Bookings &amp; Enquiries</div>
        <div class="ft-links">
          <a href="mailto:info@celestiabanquets.com">info@celestiabanquets.com</a>
          <a href="tel:+919093666620">+91 9093 6666 20</a>
          <a href="tel:+919093666640">+91 9093 6666 40</a>
        </div>
      </div>
      <div class="ft-col">
        <div class="ft-sub">The Estates</div>
        <div class="ft-links">
          <a href="${enq('for=g')}">Orion</a><a href="${enq('for=f1')}">Nova</a><a href="${enq('for=f2')}">Horizon</a><a href="${enq('for=f5')}">The Rooftop</a>
        </div>
      </div>
      <div class="ft-col">
        <div class="ft-sub">Connect</div>
        <div class="ft-links">
          <a href="https://www.instagram.com/celestia_banquet/" target="_blank" rel="noopener">Instagram</a>
        </div>
      </div>
      <p class="ft-note">Celestia Banquets, Nagpur: three banquet halls, an open-air rooftop and 80 guest rooms under one roof. For bookings, availability and site visits, call or email the Celestia team.</p>
    </div>
    <div class="ft-section ft-bottom">
      <ul><li><a href="${enq()}">Enquire</a></li><li><a href="#halls">The halls</a></li><li><a href="#ideas">Ideas</a></li></ul>
      <div class="ft-bottom__end">
        <span>© ${year} Celestia Banquets. All rights reserved.</span>
        <button type="button" class="ft-top-link"><span>Back to top</span>${ring}</button>
      </div>
    </div>`;
  root.querySelector('.ft-top-link')!.addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  root.querySelector('.ft-logo')!.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });

  const form = root.querySelector<HTMLFormElement>('.ft-news')!;
  const status = form.querySelector<HTMLElement>('.ft-news__status')!;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(form);
    if (d.get('botcheck')) return;
    if (!form.reportValidity()) return;
    if (!KEY) { status.textContent = 'Sign-up is not connected yet. Please try again soon.'; return; }
    status.textContent = 'Signing you up…';
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: KEY, subject: 'Newsletter sign-up', from_name: 'Celestia website', Email: d.get('email') }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error();
      form.reset(); status.textContent = 'Thank you, you are on the list.';
    } catch { status.textContent = 'Sorry, that did not go through. Please try again.'; }
  });
}

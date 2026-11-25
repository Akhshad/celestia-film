/* The light sections after the journey: reveal on entry, photo parallax, and the fixed header
   switching to dark text while it sits over them. */
const after = document.getElementById('after');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initStory() {
  if (!after) return;
  document.documentElement.classList.add('js');

  // fade/slide in once, when an element first comes on screen
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  after.querySelectorAll('[data-reveal], .intro-media').forEach(el => io.observe(el));

  // photos drift at different speeds (data-speed = px moved per px of scroll, relative to their box)
  const groups = [...after.querySelectorAll<HTMLElement>('.intro-media')].map(box => ({
    box, items: [...box.querySelectorAll<HTMLElement>('[data-speed]')].map(el => ({ el, s: +el.dataset.speed! })),
  }));

  // hover: tell the CSS where the cursor is over the photo pair (-1…1 from the centre)
  if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    for (const { box } of groups) {
      const set = (nx: number, ny: number) => { box.style.setProperty('--nx', nx.toFixed(3)); box.style.setProperty('--ny', ny.toFixed(3)); };
      box.addEventListener('pointerenter', () => box.classList.add('hover'));
      box.addEventListener('pointermove', e => {
        const r = box.getBoundingClientRect();
        set(Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)), Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)));
      });
      box.addEventListener('pointerleave', () => { box.classList.remove('hover'); set(0, 0); });
    }
  }

  const header = document.querySelector('header');
  let queued = false;
  const update = () => {
    queued = false;
    const top = after.getBoundingClientRect().top;
    const headH = header ? header.offsetHeight : 60;
    document.body.classList.toggle('past-journey', top < innerHeight);
    // dark header text only while a light section sits under the header
    let light = false;
    if (top < headH * .5) for (const sec of after.querySelectorAll<HTMLElement>('[data-tone]')) {
      const r = sec.getBoundingClientRect();
      if (r.top <= headH * .5 && r.bottom > headH * .5) { light = sec.dataset.tone === 'light'; break; }
    }
    document.body.classList.toggle('light-head', light);
    if (reduced) return;
    for (const g of groups) {
      const r = g.box.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) continue;
      const d = r.top + r.height / 2 - innerHeight / 2;
      for (const it of g.items) it.el.style.transform = `translate3d(0, ${(d * it.s).toFixed(1)}px, 0)`;
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
}

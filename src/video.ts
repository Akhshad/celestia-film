/* Full-bleed video that opens up as you scroll (ported from the Red Dot homepage):
   the section is 200vh with the video pinned full-screen inside it. It starts clipped to
   inset(20%) and opens to inset(0) from when the section's middle reaches the bottom of
   the screen until its end does; as the section then leaves, the video drifts down 30%
   so it exits slower than the page. Plays muted and looped only while on screen. */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function initGrowVideo(root: HTMLElement | null) {
  if (!root) return;
  const box = root.querySelector<HTMLElement>('.grow-video__container')!;
  const video = root.querySelector<HTMLVideoElement>('video')!;

  // load and play only near / on screen
  let loaded = false;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      if (!loaded) { loaded = true; video.src = video.dataset.src!; video.load(); }
      if (!reduced) video.play().catch(() => {});
    } else video.pause();
  }, { rootMargin: '50% 0px' }).observe(root);

  if (reduced) { root.dataset.tone = 'dark'; return; }
  let queued = false;
  const update = () => {
    queued = false;
    const r = root.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < -vh || r.top > vh * 2) return;
    const open = clamp01((vh - r.top - r.height / 2) / (r.height / 2));   // center→bottom .. bottom→bottom
    const leave = clamp01((vh - r.bottom) / vh);                           // bottom→bottom .. bottom→top
    video.style.clipPath = `inset(${(20 * (1 - open)).toFixed(3)}%)`;
    box.style.transform = `translate3d(0, ${(30 * leave).toFixed(3)}%, 0)`;
    // the header reads against the off-white margin until the video has opened past it
    root.dataset.tone = 20 * (1 - open) / 100 * vh > 30 ? 'light' : 'dark';
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
}

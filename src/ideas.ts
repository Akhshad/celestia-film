/* "This way for ideas" (ported from the Red Dot homepage): a script line and serif heading,
   a pill tab switch, and two lists. By Occasion is a centred list of large serif lines;
   hovering one turns it rust, fades the rest and brings in two tilted photos either side.
   By Space is a two-column list with circled arrows. Every line opens the enquiry page
   with the occasion or the hall already chosen. */

const B = import.meta.env.BASE_URL;
const enq = (q: string) => `${B}enquiry.html?${q}`;

// PLACEHOLDER IMAGES: swap in a left and right photo for each occasion when they arrive.
const P = [`${B}story/bride-mirror.webp`, `${B}story/teal-flowers.webp`, `${B}halls/front-mobile.webp`,
  `${B}film/f-0286.webp`, `${B}film/f-0240.webp`];
const pic = (i: number): [string, string] => [P[i % P.length], P[(i + 2) % P.length]];

export const occasions: { name: string; occasion: string }[] = [
  { name: 'Wedding Celebrations', occasion: 'Wedding' },
  { name: 'Engagement Ceremonies', occasion: 'Engagement' },
  { name: 'Haldi & Mehendi', occasion: 'Haldi / Mehendi / Sangeet' },
  { name: 'Sangeet Nights', occasion: 'Haldi / Mehendi / Sangeet' },
  { name: 'Wedding Receptions', occasion: 'Reception' },
  { name: 'Birthday Celebrations', occasion: 'Birthday' },
  { name: 'Anniversary Celebrations', occasion: 'Anniversary' },
  { name: 'Baby Showers & Naming Ceremonies', occasion: 'Baby shower / Naming ceremony' },
  { name: 'Family Gatherings', occasion: 'Family gathering' },
  { name: 'Festive Celebrations', occasion: 'Festive celebration' },
];

export const spaces: { name: string; note: string; id: string }[] = [
  { name: 'Orion', note: 'Banquet Hall', id: 'g' },
  { name: 'Nova', note: 'Banquet Hall', id: 'f1' },
  { name: 'Horizon', note: 'Banquet Hall', id: 'f2' },
  { name: 'The Rooftop', note: 'Open-Air Celebrations', id: 'f5' },
];

export function initIdeas(root: HTMLElement | null) {
  if (!root) return;
  const arrowIcon = `<span class="ideas-arrow" aria-hidden="true"><svg class="ideas-arrow__ring" viewBox="0 0 50 50" fill="none"><circle vector-effect="non-scaling-stroke" cx="25" cy="25" r="24" stroke="currentColor" stroke-dasharray="1 3" stroke-linecap="round"/></svg><svg class="ideas-arrow__icon" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  root.innerHTML = `
    <div class="ideas-head">
      <p class="ideas-hand" data-reveal>Your next celebration</p>
      <h2 class="ideas-title" data-reveal>This way for <i>ideas</i></h2>
    </div>
    <div class="ideas-tabs" data-reveal>
      <div class="ideas-tabs__nav" role="tablist" aria-label="Browse ideas">
        <button type="button" class="ideas-tab active" role="tab" aria-selected="true" aria-controls="ideas-occasion" id="ideas-tab-occasion">By Occasion</button>
        <button type="button" class="ideas-tab" role="tab" aria-selected="false" aria-controls="ideas-space" id="ideas-tab-space">By Space</button>
      </div>
      <div class="ideas-pane active" id="ideas-occasion" role="tabpanel" aria-labelledby="ideas-tab-occasion">
        <div class="ideas-list ideas-list--alt">${occasions.map((o, i) => {
          const [l, r] = pic(i);
          return `<a class="ideas-item" href="${enq(`occasion=${encodeURIComponent(o.occasion)}`)}">
            <span class="ideas-item__title">${o.name}</span>
            <img class="ideas-item__img left" src="${l}" alt="" loading="lazy" decoding="async">
            <img class="ideas-item__img right" src="${r}" alt="" loading="lazy" decoding="async">
          </a>`;
        }).join('')}</div>
      </div>
      <div class="ideas-pane" id="ideas-space" role="tabpanel" aria-labelledby="ideas-tab-space" hidden>
        <div class="ideas-list ideas-list--grid">${spaces.map(s => `
          <a class="ideas-item" href="${enq(`for=${s.id}`)}"><span class="ideas-item__title">${s.name} <small>– ${s.note}</small></span>${arrowIcon}</a>`).join('')}</div>
      </div>
      <p class="ideas-unsure"><a href="${enq('for=unsure')}"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M4.7 4.7l2.1 2.1M13.2 13.2l2.1 2.1M4.7 15.3l2.1-2.1M13.2 6.8l2.1-2.1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg><span>Unsure? Let us help you choose</span></a></p>
    </div>`;

  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.ideas-tab')];
  const panes = [...root.querySelectorAll<HTMLElement>('.ideas-pane')];
  tabs.forEach((t, i) => t.addEventListener('click', () => {
    tabs.forEach((x, k) => { x.classList.toggle('active', k === i); x.setAttribute('aria-selected', String(k === i)); });
    panes.forEach((p, k) => { p.classList.toggle('active', k === i); p.hidden = k !== i; });
  }));
}

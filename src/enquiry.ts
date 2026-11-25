/* Enquiry page: pre-selects what was opened (?for=f1, ?for=rooms …) and sends the enquiry
   by email through Web3Forms when VITE_WEB3FORMS_KEY is set (see .env.example). */
import './style.css';
import './enquiry.css';

const KEY = import.meta.env.VITE_WEB3FORMS_KEY || '';
const form = document.getElementById('enquiry') as HTMLFormElement;
const status = form.querySelector('.enq-status') as HTMLElement;
const forSel = form.elements.namedItem('for') as HTMLSelectElement;
const occasion = form.elements.namedItem('occasion') as HTMLSelectElement;
const roomsRow = form.querySelector('.enq-rooms') as HTMLElement;
const submit = form.querySelector('.enq-submit') as HTMLButtonElement;

// pre-select from the link that brought the visitor here
const want = new URLSearchParams(location.search).get('for');
if (want && [...forSel.options].some(o => o.value === want)) forSel.value = want;
const wantOcc = new URLSearchParams(location.search).get('occasion');
if (wantOcc && [...occasion.options].some(o => o.value === wantOcc)) occasion.value = wantOcc;
const syncRooms = () => {
  const rooms = forSel.value === 'rooms';
  roomsRow.hidden = !rooms;
  if (rooms && !occasion.value) occasion.value = 'Stay / guest rooms';
};
forSel.addEventListener('change', syncRooms);
syncRooms();

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!form.reportValidity() || submit.disabled) return;
  const d = new FormData(form);
  if (d.get('botcheck')) return;                         // spam bots tick the hidden box
  if (!KEY) {
    status.textContent = 'The enquiry form is not connected yet. Please call or email the Celestia team directly.';
    return;
  }
  const label = forSel.selectedOptions[0]?.textContent || '';
  submit.disabled = true; status.textContent = 'Sending your enquiry…';
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: KEY,
        subject: `New enquiry: ${d.get('occasion')} · ${label} (${d.get('name')})`,
        from_name: 'Celestia website',
        Name: d.get('name'), Phone: d.get('phone'), Email: d.get('email') || 'Not given',
        'Interested in': label, Occasion: d.get('occasion'),
        'Event date': d.get('date') || 'Not specified', 'Expected guests': d.get('guests') || 'Not specified',
        'Rooms needed': forSel.value === 'rooms' ? d.get('rooms') || 'Not specified' : '-',
        Message: d.get('message') || '-',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || res.statusText);
    form.reset(); syncRooms();
    status.textContent = 'Thank you. Your enquiry has reached the Celestia team and we will call you shortly.';
  } catch {
    status.textContent = 'Sorry, your enquiry could not be sent. Please try again in a moment.';
  } finally {
    submit.disabled = false;
  }
});

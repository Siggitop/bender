// Start der Gebäude-App: öffnet das Werkzeug im ganzen Fenster; Hinweise und Rückfragen kommen von hier.
import { openBuilding } from './building.js';

const $ = s => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}
function ask(msg, ok = 'Löschen') {
  const dlg = $('#askDlg'), yes = $('#askYes'), no = $('#askNo');
  $('#askMsg').textContent = msg; yes.textContent = ok; yes.classList.toggle('mdanger', ok === 'Löschen'); dlg.hidden = false;
  return new Promise(res => {
    const done = v => { dlg.hidden = true; yes.onclick = no.onclick = dlg.onclick = null; res(v); };
    yes.onclick = () => done(true); no.onclick = () => done(false);
    dlg.onclick = e => { if (e.target === dlg) done(false); };
  });
}

let open = false;
async function start() {
  if (open) return;
  open = true; $('#gstart').hidden = true;
  try {
    const ed = await openBuilding({ toast, ask, onClose: () => { open = false; $('#gstart').hidden = false; if (window.biegeDebug) delete window.biegeDebug.bau; } });
    if (DEBUG) (window.biegeDebug ||= {}).bau = ed;
  } catch (err) { open = false; $('#gstart').hidden = false; toast(`Gebäude lässt sich nicht öffnen: ${err.message || err}`); }
}
$('#gver').textContent = `Version ${self.APP_VERSION} vom ${self.APP_DATE}`;
$('#gopen').addEventListener('click', start);
start();

// Offline-Speicher; eine neue Version meldet sich und lädt beim nächsten Start
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Neue Version geladen – beim nächsten Öffnen aktiv.'); }); });
  }).catch(() => {});
}

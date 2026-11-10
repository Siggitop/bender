// Offline-Cache der Gebäude-App: erst Netz (damit Updates ankommen), sonst Cache.
importScripts('version.js'); // setzt self.APP_VERSION
const CACHE = 'gebaeude-v' + self.APP_VERSION;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'building.js', 'building-math.js', 'building-steel.js', 'building-store.js', 'building-lists.js', 'building-pdf.js', 'building-xlsx.js', 'building-schema.js', 'building-data.js', 'building-css.js', 'building-test.js', 'building-parts.js', 'building-partedit.js', 'building-glb.js', 'version.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('gebaeude-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

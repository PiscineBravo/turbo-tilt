const CACHE = 'turbotilt-v14';
const SHELL = ['./', 'index.html', 'style.css', 'game.js', 'net.js', 'tracks.js', 'audio.js', 'manifest.webmanifest', 'icon.svg',
  'https://unpkg.com/three@0.160.0/build/three.module.js', 'https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
// Rete prima (così gli aggiornamenti arrivano subito), cache se offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});

// Service worker : met l'appli en cache pour qu'elle fonctionne hors ligne.
// Incrémenter CACHE à chaque déploiement pour que les téléphones récupèrent la nouvelle version.
const CACHE = 'ru-app-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './data/words.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/answers.js',
  './js/api.js',
  './js/remote-backend.js',
  './js/app.js',
  './js/dates.js',
  './js/session.js',
  './js/speech.js',
  './js/srs.js',
  './js/storage.js',
  './js/stress.js',
  './js/validate.js',
  './js/ui/dom.js',
  './js/ui/exercises.js',
  './js/ui/home.js',
  './js/ui/session-screen.js',
  './js/ui/settings-screen.js',
  './js/ui/word-form.js',
  './js/ui/words-screen.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()));
});

// Réponse depuis le cache si possible, avec mise à jour du cache en arrière-plan.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const cachePromise = caches.open(CACHE);
  const network = fetch(request)
    .then(async response => {
      if (response.ok) {
        const copy = response.clone();
        await (await cachePromise).put(request, copy);
      }
      return response;
    })
    .catch(() => null);
  // Appelé de façon synchrone dans le gestionnaire (exigé par certains navigateurs, dont Safari).
  event.waitUntil(network);

  event.respondWith((async () => {
    const cache = await cachePromise;
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await network;
    if (response) return response;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});

// Service worker minimal — sa seule présence active (avec le manifest) suffit
// à rendre le site installable sur Android/Chrome. Pas de mise en cache forcée
// pour l'instant, afin de ne jamais servir une version périmée de la carte.
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Laisse passer toutes les requêtes normalement (pas de cache).
  e.respondWith(fetch(e.request));
});

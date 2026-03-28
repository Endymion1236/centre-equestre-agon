const CACHE_NAME = "ce-agon-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Installation — mise en cache des ressources statiques
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activation — nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — réseau d'abord, cache en fallback
self.addEventListener("fetch", (event) => {
  // Ne pas intercepter les requêtes API ni Firestore
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Mettre en cache les pages naviguées
        if (response.ok && event.request.destination === "document") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — retourner depuis le cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Page offline générique
          return new Response(
            `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Hors ligne</title>
            <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;}
            .box{text-align:center;padding:2rem;}.emoji{font-size:3rem;}</style></head>
            <body><div class="box"><div class="emoji">🐴</div>
            <h2>Pas de connexion</h2><p>Reconnectez-vous pour accéder au centre équestre.</p></div></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        });
      })
  );
});

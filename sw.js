// IMPORTANT : incrémente ce numéro à chaque mise à jour déployée de l'appli.
// Ça force le renouvellement du cache ET (via APP_VERSION dans index.html)
// la déconnexion de tous les utilisateurs pour qu'ils rechargent la dernière version.
const CACHE_NAME = "caisse-noire-v2026-07-06-06";
const ASSETS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./bg-app.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin.includes("firebaseio.com") || url.origin.includes("googleapis.com") || url.origin.includes("gstatic.com") || url.origin.includes("script.google.com")) {
    return;
  }

  // index.html (et la racine du site) : toujours vérifier le réseau en premier,
  // pour ne jamais servir une version périmée du code de l'appli.
  // Le cache ne sert que si le téléphone est hors ligne.
  const isAppShell = event.request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/");
  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Le reste (icônes, manifest) : cache d'abord, pour rester rapide et fonctionner hors-ligne
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

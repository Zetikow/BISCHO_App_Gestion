// IMPORTANT : incrémente ce numéro à chaque mise à jour déployée de l'appli.
// Ça force le renouvellement du cache ET (via APP_VERSION dans index.html)
// la déconnexion de tous les utilisateurs pour qu'ils rechargent la dernière version.
const CACHE_NAME = "caisse-noire-v2026-08-04-3";
const ASSETS = [
  "./manifest.json",
  "./images/icon-192.png",
  "./images/icon-512.png",
  "./images/bg-app.jpg"
];

// ===== Notifications push (Firebase Cloud Messaging) =====
// Intégré ici plutôt que dans un fichier "firebase-messaging-sw.js" séparé : un seul service
// worker peut contrôler la page à la fois, et celui-ci gère déjà le cache/offline. Même
// firebaseConfig que config/firebase-config.js — un service worker ne peut pas importer les
// fichiers JS de la page principale, doit être dupliqué ici si le projet Firebase change.
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD2x5SnYT5bz_niQkUMAL_H-DwxajuRTJA",
  authDomain: "appgestionlustuzone.firebaseapp.com",
  projectId: "appgestionlustuzone",
  storageBucket: "appgestionlustuzone.firebasestorage.app",
  messagingSenderId: "746274171647",
  appId: "1:746274171647:web:01659a3777cbd8ec503aca",
});

const messaging = firebase.messaging();

// Notification reçue alors que l'appli est fermée ou en arrière-plan (celles reçues appli
// ouverte au premier plan passent par messaging.onMessage() côté page, voir js/core/push.js).
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "LustuZone";
  const options = {
    body: (payload.notification && payload.notification.body) || "",
    icon: "images/icon-192.png",
    badge: "images/icon-192.png",
  };
  self.registration.showNotification(title, options);
});

// Clic sur une notification : ramène l'onglet déjà ouvert au premier plan, ou en ouvre un nouveau.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});

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

  // index.html, CSS et JS (le "code" de l'appli) : toujours vérifier le réseau en premier, pour
  // ne jamais servir une version périmée — sans ça, le cache HTTP natif du navigateur peut garder
  // une ancienne réponse pour ces URLs (elles ne changent jamais de nom), même après avoir bumpé
  // CACHE_NAME/APP_VERSION, puisque seule la mise en cache de CE service worker en tenait compte.
  // Le cache ne sert que si le téléphone est hors ligne.
  const isAppShell = event.request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/") || url.pathname.endsWith(".css") || url.pathname.endsWith(".js");
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

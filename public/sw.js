// Service Worker — Centre Équestre Agon-Coutainville
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: "gestion-2026.firebaseapp.com",
  projectId: "gestion-2026",
  storageBucket: "gestion-2026.firebasestorage.app",
  messagingSenderId: "785848912923",
  appId: "1:785848912923:web:47f03aa109fa13eb1c7cbe",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title = "Centre Équestre", body = "", icon = "/icons/icon-192x192.png" } = payload.notification || {};
  const url = payload.fcmOptions?.link || payload.data?.url || "/espace-cavalier";
  self.registration.showNotification(title, {
    body, icon, badge: "/icons/icon-72x72.png",
    tag: "ce-agon", data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/espace-cavalier";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});

const CACHE_NAME = "ce-agon-v2";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(["/","/manifest.json"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.hostname.includes("firebase") || url.hostname.includes("googleapis") || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(r => { if(r.ok && event.request.destination==="document"){const c=r.clone();caches.open(CACHE_NAME).then(ca=>ca.put(event.request,c));} return r; }).catch(() => caches.match(event.request).then(c => c || new Response(`<html><body><div style="text-align:center;padding:2rem">🐴<h2>Pas de connexion</h2></div></body></html>`,{headers:{"Content-Type":"text/html"}}))));
});

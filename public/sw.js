/**
 * BizaNet Control n'utilise pas de PWA.
 * Ce fichier évite les 404 quand le navigateur recharge un ancien service worker.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(self.registration.unregister());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});

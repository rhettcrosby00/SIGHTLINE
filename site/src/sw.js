// sightrep.app served the app itself (5.0 to 5.2) before it became this
// website, so some browsers still have the app's offline copy saved here. When
// such a browser checks for an update, it gets this file: it deletes the old
// offline copy, removes itself and reloads the page, which then shows the
// website. Browsers that never opened the app here never load this file.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});

// The build supplies BUILD and PRECACHE. Only public, build-owned files enter this cache.
const prefix = 'smairys-inventar-shell-';
const cacheName = prefix + BUILD;
const paths = new Set(PRECACHE.map(entry => entry.url));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const files = await Promise.all(PRECACHE.map(async ({ url, hash }) => {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok || response.redirected) throw new Error('Offline file unavailable: ' + url);
      const bytes = await response.clone().arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const actual = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== actual) throw new Error('Offline file changed during install: ' + url);
      return { url, response };
    }));
    try {
      const cache = await caches.open(cacheName);
      for (const { url, response } of files) await cache.put(url, response);
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'ACTIVATE_UPDATE' || !event.source?.id) return;
  const reply = event.ports[0];
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const anotherApp = windows.some(client => client.id !== event.source.id && ['/', '/index.html'].includes(new URL(client.url).pathname));
    if (anotherApp) { reply?.postMessage({ accepted: false }); return; }
    reply?.postMessage({ accepted: true });
    await self.skipWaiting();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isAppNavigation = event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html');
  if (!isAppNavigation && (!paths.has(url.pathname) || url.search || event.request.mode === 'navigate')) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(isAppNavigation ? '/index.html' : url.pathname) ?? await fetch(event.request);
  })());
});

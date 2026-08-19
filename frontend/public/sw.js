/* PWA service worker — share-target + fast cache + update overlay */
const CACHE = 'block7-shell-v13';
const PRECACHE = [
  '/manifest.webmanifest',
  '/manifest.json',
  '/app-logo.jpg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-192.png',
  '/pwa-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/fonts/Vazirmatn-Variable.woff2',
  '/share-target',
];

let lastSharePayload = null;

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function notifyClients(type) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage({ type });
  });
}

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(?:woff2|png|jpg|jpeg|svg|webp)$/i.test(url.pathname)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) await cache.put(url, res.clone());
          } catch (_) {
            /* ignore */
          }
        }),
      );
      const hasController = !!self.registration.active;
      if (hasController) {
        await notifyClients('SW_UPDATE_READY');
      } else {
        await self.skipWaiting();
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (
    req.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname.replace(/\/+$/, '') === '/share-target'
  ) {
    event.respondWith(handleShareTargetPost(req));
    return;
  }

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/')) return;
  if (url.pathname.startsWith('/sf/')) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(req);
          cache.put('/index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          const cached = (await caches.match('/index.html')) || (await caches.match('/'));
          if (cached) return cached;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);

      if (isImmutableAsset(url) && cached) return cached;

      const networkPromise = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);

      if (cached) {
        networkPromise.catch(() => {});
        return cached;
      }

      const fresh = await networkPromise;
      if (fresh) return fresh;
      return new Response('', { status: 504 });
    })(),
  );
});

async function handleShareTargetPost(request) {
  try {
    const form = await request.formData();
    const title = String(form.get('title') || form.get('name') || '');
    const text = String(form.get('text') || '');
    const shareUrl = String(form.get('url') || '');

    const file =
      form.get('image') ||
      form.get('media') ||
      form.get('file') ||
      form.get('screenshot') ||
      null;

    let fileDataUrl = '';
    let fileName = '';
    let fileType = '';

    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
      if (file.size && file.size > 4.5 * 1024 * 1024) {
        fileName = file.name || '';
        fileType = file.type || '';
      } else {
        fileDataUrl = await blobToDataURL(file);
        fileName = file.name || `receipt-${Date.now()}.jpg`;
        fileType = file.type || 'image/jpeg';
      }
    }

    lastSharePayload = {
      title,
      text,
      url: shareUrl,
      fileDataUrl,
      fileName,
      fileType,
      receivedAt: new Date().toISOString(),
      source: 'share-target',
      tooLarge: Boolean(file && file.size && file.size > 4.5 * 1024 * 1024),
    };
  } catch (err) {
    lastSharePayload = {
      title: '',
      text: '',
      url: '',
      fileDataUrl: '',
      fileName: '',
      fileType: '',
      receivedAt: new Date().toISOString(),
      source: 'share-target-error',
      error: String(err && err.message ? err.message : err),
    };
  }

  return Response.redirect(`${self.location.origin}/share-target?received=1`, 303);
}

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'GET_SHARE_TARGET') {
    const payload = lastSharePayload;
    lastSharePayload = null;
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
    }
  }
  if (event.data.type === 'CLEAR_SHARE_TARGET') {
    lastSharePayload = null;
  }
});

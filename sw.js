const CACHE_VERSION = 'v10';
const STATIC_CACHE = `recipes-static-${CACHE_VERSION}`;
const DATA_CACHE = `recipes-data-${CACHE_VERSION}`;
const IMAGES_CACHE = `recipes-images-${CACHE_VERSION}`;

const getScopePath = () => {
    try {
        const p = new URL(self.registration.scope).pathname;
        return p.endsWith('/') ? p : p + '/';
    } catch (e) {
        return './';
    }
};

const BASE = getScopePath();

const STATIC_ASSETS = [
    BASE,
    BASE + 'index.html',
    BASE + 'style.css',
    BASE + 'script.js',
    BASE + 'recipes.json',
    BASE + 'marked.min.js',
    BASE + 'manifest.json',
    BASE + 'icons/icon-192x192.png',
    BASE + 'icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil((async () => {
        try {
            const staticCache = await caches.open(STATIC_CACHE);
            await Promise.allSettled(
                STATIC_ASSETS.map(url => staticCache.add(url).catch(err => console.warn('Pre-cache asset warning:', url, err)))
            );
        } catch (e) {
            console.warn('Install static pre-cache warning:', e);
        }
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.map(k => {
                if (k !== STATIC_CACHE && k !== DATA_CACHE && k !== IMAGES_CACHE) {
                    return caches.delete(k);
                }
            })
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // 1. Navigation requests: CACHE-FIRST for instantaneous 0ms launch, then background revalidate
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith((async () => {
            const cached = await caches.match(BASE + 'index.html') ||
                           await caches.match(BASE) ||
                           await caches.match(event.request);

            // Silent background revalidation when network is available
            fetch(event.request).then(async (netResp) => {
                if (netResp && netResp.ok) {
                    const cache = await caches.open(STATIC_CACHE);
                    cache.put(BASE + 'index.html', netResp.clone());
                    cache.put(event.request, netResp);
                }
            }).catch(() => {});

            if (cached) return cached;

            try {
                const netResp = await fetch(event.request);
                if (netResp && netResp.ok) {
                    const cache = await caches.open(STATIC_CACHE);
                    cache.put(BASE + 'index.html', netResp.clone());
                    return netResp;
                }
            } catch (e) {}

            return cached;
        })());
        return;
    }

    // 2. Data / recipes.json -> Stale-while-revalidate
    if (url.pathname.endsWith('recipes.json') || url.pathname.endsWith('/api/recipes')) {
        event.respondWith((async () => {
            const dataCache = await caches.open(DATA_CACHE);
            const cached = await dataCache.match(event.request) ||
                           await caches.match(BASE + 'recipes.json');

            const fetchPromise = fetch(event.request).then(async (netResp) => {
                if (netResp && netResp.ok) {
                    await dataCache.put(event.request, netResp.clone());
                    await dataCache.put(BASE + 'recipes.json', netResp.clone());
                }
                return netResp;
            }).catch(() => null);

            return cached || (await fetchPromise);
        })());
        return;
    }

    // 3. Images -> Cache-first for rapid cooking display
    if (url.pathname.includes('/images/') || event.request.destination === 'image') {
        event.respondWith((async () => {
            const imgCache = await caches.open(IMAGES_CACHE);
            const cached = await imgCache.match(event.request);
            if (cached) return cached;

            try {
                const netResp = await fetch(event.request);
                if (netResp && netResp.ok) {
                    imgCache.put(event.request, netResp.clone());
                    return netResp;
                }
            } catch (e) {}

            return cached;
        })());
        return;
    }

    // 4. Static assets (CSS, JS, Fonts)
    event.respondWith((async () => {
        const cached = await caches.match(event.request);
        if (cached) {
            fetch(event.request).then(async (netResp) => {
                if (netResp && netResp.ok) {
                    const cache = await caches.open(STATIC_CACHE);
                    cache.put(event.request, netResp);
                }
            }).catch(() => {});
            return cached;
        }

        try {
            const netResp = await fetch(event.request);
            if (netResp && netResp.ok) {
                const cache = await caches.open(STATIC_CACHE);
                cache.put(event.request, netResp.clone());
                return netResp;
            }
        } catch (e) {}

        return cached;
    })());
});

const CACHE_NAME = 'photo-gallery-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/styles.css',
    '/manifest.json',
    // Add other static assets you want cached for offline use
];

// Install: cache important assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

// Activate: clean up old caches if needed
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: serve cached assets if offline, and dynamically cache gallery images
self.addEventListener('fetch', event => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Check if the request is for a gallery image
    if (url.pathname.startsWith('/images/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(event.request).then(response =>
                    response ||
                    fetch(event.request).then(fetchRes => {
                        // Only cache successful responses
                        if (fetchRes.ok) {
                            cache.put(event.request, fetchRes.clone());
                        }
                        return fetchRes;
                    }).catch(() => {
                        // Optionally return a fallback image here
                    })
                )
            )
        );
        return;
    }

    // Default: cache-first for static assets
    event.respondWith(
        caches.match(event.request).then(response =>
            response ||
            fetch(event.request).then(fetchRes => {
                return fetchRes;
            }).catch(() => {
                // Optionally return a fallback page/image here
            })
        )
    );
});
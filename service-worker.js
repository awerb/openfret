/**
 * OpenFret service worker.
 *
 * Caches the app shell so OpenFret keeps working offline after the first visit.
 * Strategy:
 *   - Install: pre-cache the core app shell (HTML, CSS, JS, sample songs, key images).
 *   - Activate: clean up old caches when the version bumps.
 *   - Fetch: cache-first for app-shell assets, network-first with cache fallback for everything else.
 *
 * Bump CACHE_VERSION whenever you ship a release that changes any cached file.
 */
const CACHE_VERSION = 'openfret-v3';
const APP_SHELL = [
    './',
    './index.html',
    './styles/main.css',
    './js/app.js',
    './js/library.js',
    './js/onboarding.js',
    './data/sample-songs.js',
    './assets/openfret-banner.jpg',
    './assets/openfret-icon.png',
    './assets/openfret-wordmark.png',
    './assets/openfret-wordmark.webp',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // Cache-first for same-origin assets we ship in the app shell.
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(req).then((cached) => {
                if (cached) return cached;
                return fetch(req).then((res) => {
                    // Cache successful responses transparently so first-touch assets
                    // (like a starter pack JSON) become offline-available too.
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
                    }
                    return res;
                }).catch(() => caches.match('./index.html'));
            })
        );
        return;
    }
    // Cross-origin (e.g., YouTube redirects) just go to network.
});

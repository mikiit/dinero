// Dinero service worker.
//
// Deliberately minimal. It does two things:
//   1. caches the app's static files (hashed JS/CSS, icons) so the app shell
//      starts fast, and
//   2. shows a friendly offline page when a page can't be loaded.
//
// It deliberately does NOT cache pages, data, API responses or anything from
// Supabase. This is a money app: a cached screen showing last week's balance
// as if it were today's is worse than a screen saying "you're offline".
// Everything not listed above goes straight to the network, untouched.

const VERSION = "v1";
const STATIC_CACHE = `dinero-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_STATIC_ENTRIES = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("dinero-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Hashed build files pile up across deploys; keep the cache bounded by
// dropping the oldest entries.
async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch another origin (Supabase, Google, fonts): auth and data
  // must always be live.
  if (url.origin !== self.location.origin) return;

  // Opening a page: always the network; only if it's unreachable, the
  // offline page. A server error (4xx/5xx) is passed through as is.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  // Immutable, content-hashed build output and the icons: cache first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, copy).then(() => trim(cache));
              });
            }
            return response;
          }),
      ),
    );
  }
  // Anything else (data requests, server actions, RSC payloads): not handled
  // here, so the browser goes to the network as if there were no worker.
});

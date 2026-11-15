// loosedraw service worker. The cache version and file list below are
// filled in at build time (see vite.config.ts).
const CACHE = "loosedraw-__VERSION__";
const FONTS = "loosedraw-fonts";
const FILES = __FILES__;

// Download the whole app up front so it opens with no network.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(FILES.map((file) => cache.add(file))))
      .then(() => self.skipWaiting()),
  );
});

// Drop caches left by older versions of the app.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // "inkboard-" caches are from the product's earlier name.
            .filter((key) => /^(loosedraw|inkboard)-/.test(key) && key !== CACHE && key !== FONTS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Pages: try the network for the newest version, fall back to the cached app.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./", copy));
          }
          return response;
        })
        .catch(() => caches.match("./", { cacheName: CACHE })),
    );
    return;
  }

  // Everything else is content-hashed or static: cache first, then network.
  // ignoreVary: a page's <script> and a plain fetch send different headers,
  // and must still find the same cached file.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            const name = url.pathname.includes("/fonts/") ? FONTS : CACHE;
            caches.open(name).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

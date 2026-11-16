// loosedraw service worker. The cache version and file list below are
// filled in at build time (see vite.config.ts).
const CACHE = "loosedraw-81c5e2fb0a96";
const FONTS = "loosedraw-fonts";
const FILES = ["./","favicon.svg","manifest.webmanifest","assets/index-CCZoe-Zk.js","assets/AllPackages-C1Iy1TN1.js","assets/BaseConfiguration-CliZ3e-D.js","assets/Entities-B_jbILds.js","assets/InputJax-Dc-VSP-a.js","assets/MathItem-BSYPmuh0.js","assets/Options-DeBgK8Ru.js","assets/PrioritizedList-DY22_XMy.js","assets/Styles-C7joLEiJ.js","assets/TeXAtom-2CBZGe-w.js","assets/html-D-kwJQgg.js","assets/lengths-ByU8C2Jc.js","assets/liteAdaptor-Bv6AUuJ5.js","assets/mathjax-CljTaI1W.js","assets/mo-B52Tx8Es.js","assets/svg-l1fnQuYJ.js","assets/tex-_3GuUUpw.js","assets/index-BNYnfWDk.css","assets/shantell-sans-cyrillic-400-normal-Cp5KOPMv.woff2","assets/shantell-sans-cyrillic-400-normal-yzKE5QnF.woff","assets/shantell-sans-cyrillic-ext-400-normal-CRITSbCX.woff","assets/shantell-sans-cyrillic-ext-400-normal-CmnrvRWX.woff2","assets/shantell-sans-latin-400-normal-CcMlhG-a.woff2","assets/shantell-sans-latin-400-normal-p77rJlyL.woff","assets/shantell-sans-latin-ext-400-normal-CtgLysDE.woff","assets/shantell-sans-latin-ext-400-normal-Dvojt9UL.woff2","assets/shantell-sans-vietnamese-400-normal-BGbVhMdP.woff","assets/shantell-sans-vietnamese-400-normal-CRDTjqOo.woff2"];

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

  // Pages: try the network for the newest version. Only the app itself is
  // kept as the offline fallback; other pages (privacy, terms) are cached
  // under their own address, so they never replace the app.
  if (request.mode === "navigate") {
    const isApp = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    const key = isApp ? "./" : request;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(() => caches.match(key, { cacheName: CACHE })),
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

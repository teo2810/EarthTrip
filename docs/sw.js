// Service worker di EarthTrip. La versione viene aggiornata da scripts/build-docs.mjs.
const CACHE = "earthtrip-v25";
// Texture, GeoJSON e TLE dai CDN: cache separata che sopravvive ai rilasci.
const ASSETS_CACHE = "earth-assets-v1";
const SHELL = [
  "./",
  "./index.html",
  "./app-v25.js",
  "./style.css",
  "./favicon.svg",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];
// Scaricate in anticipo (senza bloccare l'installazione), così il globo ha le texture anche al primo avvio offline.
const WARM = [
  "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-blue-marble.jpg",
  "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-night.jpg",
  "https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-water.png",
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_clouds_1024.png",
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/moon_1024.jpg",
];

// v25: niente skipWaiting. Con un SW già attivo il nuovo aspetta la chiusura delle schede e comanda al prossimo avvio,
// così la pagina aperta non cambia sotto i piedi e non si ricarica. L'HTML è comunque rete-prima: i file nuovi arrivano subito.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => {
        caches.open(ASSETS_CACHE).then((c) =>
          Promise.all(WARM.map((url) => c.match(url).then((hit) => hit || fetch(url, { mode: "cors" }).then((res) => res.ok && c.put(url, res)).catch(() => {})))),
        );
      }),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ASSETS_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function put(cacheName, req, res) {
  if (!res || !(res.ok || res.type === "opaque")) return;
  const copy = res.clone();
  caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
}

/** Rete prima, poi cache (HTML, CSS, manifest, TLE): dopo un rilascio non resta la versione vecchia. */
function networkFirst(req, cacheName, fallbackUrl) {
  return fetch(req)
    .then((res) => {
      put(cacheName, req, res);
      return res;
    })
    .catch(() =>
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl, { ignoreSearch: true }) : undefined)).then((hit) => hit || Response.error()),
    );
}

/** Cache prima (bundle versionato, icone, texture e GeoJSON statici). */
function cacheFirst(req, cacheName) {
  return caches.match(req, { ignoreSearch: cacheName === CACHE }).then(
    (hit) =>
      hit ||
      fetch(req).then((res) => {
        put(cacheName, req, res);
        return res;
      }),
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, CACHE, "./index.html"));
    return;
  }
  if (url.origin === self.location.origin) {
    const fresh = /\/(index\.html|style\.css|manifest\.json)?$/.test(url.pathname);
    e.respondWith(fresh ? networkFirst(req, CACHE) : cacheFirst(req, CACHE));
    return;
  }
  // Le tessere della mappa satellitare non si mettono in cache: sarebbero centinaia di MB.
  if (url.hostname.endsWith("arcgisonline.com")) return;
  const live = /\/tle\/|celestrak\.org/.test(url.href);
  e.respondWith(live ? networkFirst(req, ASSETS_CACHE) : cacheFirst(req, ASSETS_CACHE));
});

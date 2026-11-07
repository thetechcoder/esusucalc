/* EsusuCalc service worker: offline app shell.
   Bump VERSION whenever any shipped file changes so installed copies refresh. */
var VERSION = 'esusucalc-v20';
/* Cloudflare Pages redirects /index.html to /. A redirected response cannot be used to answer a page
   load, so store a clean copy instead. */
function clean(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function (b) {
    return new Response(b, { status: 200, statusText: 'OK', headers: res.headers });
  });
}
function store(cache, req, res) {
  return clean(res.clone()).then(function (c) { return cache.put(req, c); });
}
var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) {
        /* one missing file must not stop the app shell from caching */
        return Promise.all(SHELL.map(function (u) {
          return fetch(u).then(function (res) { if (res.ok) return store(c, u, res); }).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) store(cache, req, res);
        return res;
      });
      if (hit) { net.catch(function () {}); return hit; }
      return net.catch(function () {
        return cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })
          .then(function (r) { return r || cache.match('index.html'); });
      });
    });
  });
}

function cacheFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  }
});

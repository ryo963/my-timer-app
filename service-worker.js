const CACHE_NAME = 'timetracker-cache-v1';
const urlsToCache = [
  '/',
  'index.html',
  'manifest.json',
  'lib/index.global.min.js',
  'images/icon-512x512.png'
];

// インストール時に、指定されたファイルをキャッシュする
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// ファイルのリクエストがあった際に、キャッシュから返す
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュにあればそれを返す。なければ通常通りネットワークから取得
        return response || fetch(event.request);
      })
  );
});
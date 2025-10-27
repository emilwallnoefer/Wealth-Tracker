// Basic cache-first service worker for GitHub Pages
const CACHE_NAME = 'wealth-tracker-v0.1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k=> k!==CACHE_NAME ? caches.delete(k): null))));
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(resp => resp || fetch(e.request))
    );
  }
});

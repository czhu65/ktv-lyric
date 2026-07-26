// Cache-first for immutable assets. This also neutralises GitHub Pages'
// hard-coded Cache-Control: max-age=600, which cannot be overridden.
const CACHE = 'ktv-lyric-audio-v1'

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  const cacheable = url.pathname.includes('/audio/syl/') || url.pathname.includes('/data/')
  if (!cacheable) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request)
      if (hit) return hit
      const res = await fetch(event.request)
      if (res.ok) cache.put(event.request, res.clone())
      return res
    }),
  )
})

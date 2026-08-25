// Keeps Shift Mode usable when the stand loses signal mid-game.
//
// Navigations are network-first with a cached fallback, so a volunteer who
// reloads or re-opens the tab off-network still gets the shift screen. Queued
// sales live in IndexedDB (see src/lib/offline-queue.ts), not here — this only
// makes sure the app shell itself loads.

// Bump this whenever the shift screens change, so phones that cached the old
// shell during a game pick up the new one instead of serving it forever.
const CACHE = 'tilltrack-v3'

// Shown only when the phone is genuinely offline and nothing is cached for the
// page being asked for. Deliberately self-contained: no CSS or JS to fetch.
const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>No connection</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:1.5rem;
    font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#f7f9f9;color:#0d1b1e}
  .card{max-width:22rem;text-align:center}
  h1{font-size:1.4rem;margin:0 0 .6rem}
  p{margin:0 0 1.2rem;color:#5b7073}
  button{font:inherit;font-weight:600;padding:.9rem 1.6rem;border:0;border-radius:.75rem;
    background:#0f766e;color:#fff}
</style>
</head>
<body>
  <div class="card">
    <h1>No connection</h1>
    <p>Any sales you already recorded are saved on this phone and will upload by themselves once you have signal.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Signing out clears the cached pages, so the next volunteer to borrow the
// phone can't page back through someone else's shift. Sent from sign-out.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-cache') {
    event.waitUntil(caches.delete(CACHE).then(() => caches.open(CACHE)))
  }
})

async function respond(request, isNavigation) {
  try {
    const response = await fetch(request)

    // fetch() follows redirects, and handing a redirected response back for a
    // navigation is rejected by the browser — which would surface as a bogus
    // "offline" screen every time a session expired. Re-issue it instead so the
    // browser navigates to the login page properly.
    if (isNavigation && response.redirected) {
      return Response.redirect(response.url, 303)
    }

    if (response.ok && !response.redirected) {
      const copy = response.clone()
      // Caching is best-effort; a failure here must not break the response.
      caches
        .open(CACHE)
        .then((cache) => cache.put(request, copy))
        .catch(() => {})
    }

    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached

    if (isNavigation) {
      const shell = (await caches.match('/shifts')) ?? (await caches.match('/'))
      if (shell) return shell
      return new Response(OFFLINE_PAGE, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Never serve a stale sync response — the outbox handles retries itself.
  if (url.pathname.startsWith('/api/')) return
  // Never touch this script. A worker that answers for its own URL can block
  // its replacement, leaving a phone stuck on a broken version with no way to
  // recover short of clearing site data by hand.
  if (url.pathname === '/sw.js') return

  event.respondWith(respond(request, request.mode === 'navigate'))
})

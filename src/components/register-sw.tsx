'use client'

import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // updateViaCache: 'none' keeps the browser from serving sw.js out of its
    // HTTP cache. Combined with the worker never intercepting its own script,
    // this guarantees a bad worker can always be replaced by the next deploy —
    // otherwise a phone can get stuck on a broken one with no way back.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // A failed registration only costs offline support, so there's nothing
      // useful to show the volunteer here.
    })
  }, [])

  return null
}

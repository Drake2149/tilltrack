'use client'

/**
 * Clears the service worker's cached pages before signing out, so the next
 * volunteer to borrow the phone can't page back through someone else's shift.
 */
export function SignOutButton() {
  const clearCachedPages = () => {
    navigator.serviceWorker?.controller?.postMessage('clear-cache')
  }

  return (
    <button
      type="submit"
      onClick={clearCachedPages}
      className="text-sm text-muted underline hover:text-ink"
    >
      Sign out
    </button>
  )
}

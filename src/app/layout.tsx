import type { Metadata, Viewport } from 'next'
import { RegisterServiceWorker } from '@/components/register-sw'
import './globals.css'

export const metadata: Metadata = {
  title: 'TillTrack',
  description: 'Cash accountability and inventory for volunteer-run concession stands.',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}

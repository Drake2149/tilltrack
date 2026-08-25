import Link from 'next/link'
import type { Role } from '@prisma/client'
import { logout } from '@/app/login/actions'
import { SignOutButton } from './sign-out-button'

type NavItem = { href: string; label: string; roles: Role[] }

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['ADMIN', 'VIEWER'] },
  { href: '/shifts', label: 'My shifts', roles: ['ADMIN', 'VOLUNTEER'] },
  { href: '/events', label: 'Events', roles: ['ADMIN'] },
  { href: '/stands', label: 'Stands', roles: ['ADMIN'] },
  { href: '/inventory', label: 'Inventory', roles: ['ADMIN', 'VOLUNTEER'] },
  { href: '/reports', label: 'Reports', roles: ['ADMIN', 'VIEWER'] },
  { href: '/people', label: 'People', roles: ['ADMIN'] },
]

export function AppShell({
  role,
  userName,
  orgName,
  children,
}: {
  role: Role
  userName: string
  orgName: string
  children: React.ReactNode
}) {
  const items = NAV.filter((item) => item.roles.includes(role))

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-brand">
            TillTrack
          </Link>
          <span className="text-sm text-muted">{orgName}</span>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{userName}</span>
            <form action={logout}>
              <SignOutButton />
            </form>
          </div>
        </div>

        <nav className="mx-auto max-w-6xl overflow-x-auto px-5">
          <ul className="flex gap-1 pb-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium text-muted hover:bg-canvas hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  )
}

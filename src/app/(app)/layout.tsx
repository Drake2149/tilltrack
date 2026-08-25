import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const org = await db.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
    select: { name: true },
  })

  return (
    <AppShell role={user.role} userName={user.name} orgName={org.name}>
      {children}
    </AppShell>
  )
}

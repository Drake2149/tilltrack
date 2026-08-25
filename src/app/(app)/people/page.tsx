import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge, Card, Field, Input, PageHeader, Select } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { createUser, setUserActive } from './actions'

const ROLE_LABEL = {
  ADMIN: 'Treasurer / admin',
  VOLUNTEER: 'Volunteer',
  VIEWER: 'Read-only',
} as const

export default async function PeoplePage() {
  const admin = await requireAdmin()

  const users = await db.user.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Volunteers rotate constantly — add them here and they can sign in on their own phone."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <ul className="divide-y divide-line">
            {users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium">
                    {user.name}
                    {user.id === admin.id ? <span className="text-muted"> (you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                </div>

                <div className="flex items-center gap-3">
                  <Badge tone={user.role === 'ADMIN' ? 'brand' : 'muted'}>
                    {ROLE_LABEL[user.role]}
                  </Badge>

                  {user.id === admin.id ? null : (
                    <form action={setUserActive}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="active" value={user.active ? 'false' : 'true'} />
                      <button type="submit" className="text-xs text-muted underline hover:text-ink">
                        {user.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </form>
                  )}

                  {!user.active ? <Badge tone="flag">Inactive</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Add a person</h2>
          <ActionForm action={createUser} submitLabel="Add person">
            <div className="space-y-3">
              <Field label="Name">
                <Input name="name" placeholder="Sam Okafor" required />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" placeholder="sam@example.com" required />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="VOLUNTEER">
                  <option value="VOLUNTEER">Volunteer — only their own shifts</option>
                  <option value="ADMIN">Treasurer / admin — full access</option>
                  <option value="VIEWER">Read-only — reports only</option>
                </Select>
              </Field>
              <Field label="Temporary password" hint="Share it with them; at least 8 characters.">
                <Input name="password" type="text" minLength={8} required />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}

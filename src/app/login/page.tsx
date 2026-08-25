import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Card } from '@/components/ui'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect(user.role === 'VOLUNTEER' ? '/shifts' : '/dashboard')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-brand">TillTrack</h1>
        <p className="mt-2 text-sm text-muted">
          Cash accountability for volunteer-run concession stands.
        </p>
      </div>

      <Card>
        <LoginForm />
      </Card>

      <p className="mt-6 text-center text-xs text-muted">
        Trouble signing in? Ask your booster club treasurer to reset your account.
      </p>
    </main>
  )
}

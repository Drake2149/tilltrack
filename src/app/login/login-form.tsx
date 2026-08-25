'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'
import { Alert, Button, Field, Input } from '@/components/ui'

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {})

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Field label="Email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          placeholder="you@school.org"
        />
      </Field>

      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  )
}

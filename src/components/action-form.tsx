'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Alert, Button } from '@/components/ui'

type ActionState = { error?: string; notice?: string }

/**
 * Wraps a server action in a form that surfaces validation errors and clears
 * itself on success, which is the behaviour every "add a row" form here wants.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = '',
  resetOnSuccess = true,
  onSuccess,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children: React.ReactNode
  className?: string
  /** Edit forms keep what was typed; "add a row" forms clear for the next one. */
  resetOnSuccess?: boolean
  onSuccess?: () => void
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})
  const ref = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)
  const onSuccessRef = useRef(onSuccess)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      if (resetOnSuccess) ref.current?.reset()
      onSuccessRef.current?.()
    }
    wasPending.current = pending
  }, [pending, state.error, resetOnSuccess])

  return (
    <form ref={ref} action={formAction} className={className}>
      {state.error ? (
        <div className="mb-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      {state.notice ? (
        <div className="mb-3">
          <Alert tone="ok">{state.notice}</Alert>
        </div>
      ) : null}
      {children}
      <Button type="submit" disabled={pending} className="mt-3">
        {pending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  )
}

import { ButtonLink, Card } from '@/components/ui'

export default function DeniedPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
      <Card>
        <h1 className="text-xl font-semibold">You don&apos;t have access to that page</h1>
        <p className="mt-2 text-sm text-muted">
          Your account doesn&apos;t have permission for this area. If that seems wrong, ask your
          treasurer to update your role.
        </p>
        <ButtonLink href="/" className="mt-5">
          Back to my pages
        </ButtonLink>
      </Card>
    </main>
  )
}

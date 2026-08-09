import { LoginForm } from "@/features/auth/components/login-form"

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-b from-primary/[0.05] via-background to-orange-500/[0.06] p-6 dark:from-primary/15 dark:via-background dark:to-orange-500/10 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}

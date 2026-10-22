import { SignUp } from "@clerk/nextjs"
import Link from "next/link"
import { Octopus } from "@/components/oh/octopus"
import { MonamiLogo } from "@/components/oh/monami-brand"

export default function SignUpPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2" aria-label="MonAmi">
        <Octopus className="w-16" label="" />
        <MonamiLogo className="text-[40px]" />
      </Link>
      <p className="text-muted-foreground text-center max-w-sm -mt-2">Create your workspace: your own remote desktop, your shops, your agent.</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm -mt-3">Free trial, no card: 30 minutes of remote desktop. Email + password, then the 6-digit code we send you.</p>
      <SignUp />
    </div>
  )
}

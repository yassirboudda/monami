import { SignIn } from "@clerk/nextjs"
import Link from "next/link"
import { Octopus } from "@/components/oh/octopus"
import { MonamiLogo } from "@/components/oh/monami-brand"

export default function SignInPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2" aria-label="MonAmi">
        <Octopus className="w-16" label="" />
        <MonamiLogo className="text-[40px]" />
      </Link>
      <p className="text-muted-foreground text-center max-w-sm -mt-2">Your marketplace assistant: it watches your shops, drafts your replies and acts on your remote desktop.</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm -mt-3">Email, then password. On a new device we email you a 6-digit code — check spam if it takes a minute.</p>
      <SignIn />
    </div>
  )
}

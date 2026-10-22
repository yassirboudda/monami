import { SignIn } from "@clerk/nextjs"
import Link from "next/link"
import { Octopus } from "@/components/oh/octopus"
import { clerkAppearance } from "@/components/oh/clerk-appearance"

export default function SignInPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2" aria-label="OctoHandy">
        <Octopus className="w-16" label="" />
        <span className="font-heading text-3xl text-foreground">OctoHandy</span>
      </Link>
      <p className="text-muted-foreground text-center max-w-sm -mt-2">Your marketplace assistant: it watches your shops, drafts your replies and acts on your remote desktop.</p>
      <SignIn appearance={clerkAppearance} />
    </div>
  )
}

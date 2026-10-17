import Link from "next/link"
import { SignIn } from "@clerk/nextjs"
import { clerkAppearance } from "@/components/oh/clerk-appearance"
import { Octopus } from "@/components/oh/octopus"

export default function SignInPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2" aria-label="OctoHandy">
        <Octopus className="w-16" label="" />
        <span className="font-heading text-3xl text-foreground">OctoHandy</span>
      </Link>
      <p className="text-muted-foreground text-center max-w-sm -mt-2">
        Ton assistant marketplace : il surveille tes boutiques, prépare tes réponses et agit sur ton bureau distant.
      </p>
      <SignIn
        appearance={clerkAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  )
}

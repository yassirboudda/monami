import Link from "next/link"
import { SignUp } from "@clerk/nextjs"
import { clerkAppearance } from "@/components/oh/clerk-appearance"
import { Octopus } from "@/components/oh/octopus"

export default function SignUpPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2" aria-label="OctoHandy">
        <Octopus className="w-16" label="" />
        <span className="font-heading text-3xl text-foreground">OctoHandy</span>
      </Link>
      <p className="text-muted-foreground text-center max-w-sm -mt-2">
        Crée ton espace : l&apos;octopus surveillera tes marketplaces pour toi.
      </p>
      <SignUp
        appearance={clerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  )
}

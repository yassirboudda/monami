import { SignIn } from "@clerk/nextjs"
import { AuthShell } from "@/components/oh/auth-shell"

export default function SignInPage() {
  return (
    <AuthShell mode="signin">
      <SignIn />
    </AuthShell>
  )
}

import { SignUp } from "@clerk/nextjs"
import { AuthShell } from "@/components/oh/auth-shell"

export default function SignUpPage() {
  return (
    <AuthShell mode="signup">
      <SignUp />
    </AuthShell>
  )
}

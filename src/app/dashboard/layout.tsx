import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { signedIn } from "@/lib/session"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  if (!signedIn((name) => jar.get(name)?.value)) redirect("/sign-in")
  return <DashboardShell>{children}</DashboardShell>
}

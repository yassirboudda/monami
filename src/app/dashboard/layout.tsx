import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { SESSION_COOKIE, tokenLooksValid } from "@/lib/session"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  if (!tokenLooksValid(jar.get(SESSION_COOKIE)?.value)) redirect("/sign-in")
  return <DashboardShell>{children}</DashboardShell>
}

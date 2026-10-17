import { redirect } from "next/navigation"

// Chat-first: the dashboard home is the agent chat.
export default function DashboardHome() {
  redirect("/dashboard/chat")
}

import { redirect } from "next/navigation"

// app.try-ami.com/ is the login page; the public landing lives on try-ami.com.
// proxy.ts already sends signed-in visitors from "/" to /dashboard.
export default function Home() {
  redirect("/sign-in")
}

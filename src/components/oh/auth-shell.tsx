import { Check, MonitorSmartphone, Sparkles, Store } from "lucide-react"
import Link from "next/link"
import { Octopus } from "@/components/oh/octopus"
import { MonamiLogo } from "@/components/oh/monami-brand"

const POINTS = [
  { icon: Store, t: "The agent runs your shop", d: "Market price on every listing, drafts for buyers, publishing — you approve what matters." },
  { icon: MonitorSmartphone, t: "A remote desktop for any agent", d: "Yours or ours: a real cloud computer, browser + terminal, isolated per account, via MCP or API." },
  { icon: Sparkles, t: "Free to start", d: "30 minutes of remote desktop and 100k AI tokens. No card. Starter $20 · Pro $100 · Unlimited $200 a month." },
]

/* Sign-in / sign-up frame: what you get on the left, the (single-field) Clerk form on the right. */
export function AuthShell({ mode, children }: { mode: "signin" | "signup"; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden lg:block">
          <a href="https://try-ami.com" className="inline-flex items-center gap-2" aria-label="MonAmi">
            <Octopus className="w-14" label="" />
            <MonamiLogo className="text-[36px]" />
          </a>
          <h1 className="oh-serif mt-6 text-3xl font-semibold leading-tight">Your friend in the second-hand market.</h1>
          <ul className="mt-6 space-y-4">
            {POINTS.map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="w-4 h-4" /></span>
                <div>
                  <div className="font-medium">{t}</div>
                  <p className="text-sm text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">Data on Aiven (PostgreSQL, Kafka, Valkey, ClickHouse), kept 90 days · payments by Stripe.</p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <a href="https://try-ami.com" className="flex items-center gap-2 lg:hidden" aria-label="MonAmi">
            <Octopus className="w-12" label="" />
            <MonamiLogo className="text-[32px]" />
          </a>
          <div className="w-full max-w-sm space-y-2 text-center">
            <p className="text-sm text-muted-foreground">{mode === "signin" ? "Welcome back." : "Create your workspace in a minute."}</p>
            <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {["Email", "Password", "6-digit code by email"].map((s, i) => (
                <li key={s} className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-primary" />{i + 1}. {s}</li>
              ))}
            </ul>
          </div>
          {children}
          <p className="max-w-sm text-center text-[11px] text-muted-foreground">The code arrives within a minute — check spam. {mode === "signin" ? <Link href="/sign-up" className="underline underline-offset-2">No account yet? Start free.</Link> : <Link href="/sign-in" className="underline underline-offset-2">Already have an account? Sign in.</Link>}</p>
        </div>
      </div>
    </div>
  )
}

"use client"

import { ArrowRight, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useEffect, useState } from "react"
import { Octopus } from "@/components/oh/octopus"
import { Button, Card } from "@/components/ui"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"

type InviteInfo = { orgId: string; orgName: string; expiresAt: string }

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: inviteToken } = use(params)
  const { getToken } = useAuth()
  const router = useRouter()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const authToken = await getToken()
        if (!authToken) throw new Error("Sign in to view this invitation.")
        const result = await apiFetch<InviteInfo>(`/v1/invites/${encodeURIComponent(inviteToken)}`, { token: authToken })
        if (!cancelled) setInvite(result)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : ""
        if (!cancelled) setError(/410|expir/i.test(message) ? "This invitation link has expired. Ask the team for a new one." : /404|introuvable/i.test(message) ? "This invitation link is invalid or could not be found." : message || "Could not load the invitation.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [getToken, inviteToken])

  const accept = async () => {
    setAccepting(true)
    try {
      const authToken = await getToken()
      if (!authToken) throw new Error("Sign in to join the team.")
      await apiFetch(`/v1/invites/${encodeURIComponent(inviteToken)}/accept`, { method: "POST", token: authToken })
      router.push("/dashboard")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this team.")
    } finally {
      setAccepting(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4">
      <Octopus className="w-16" label="" />
      <Card className="w-full max-w-lg rounded-2xl p-8 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-butter text-foreground">
          <Users className="size-6" />
        </span>
        <h1 className="font-heading text-2xl text-foreground">Invitation MonAmi</h1>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading the invitation…</p>
        ) : error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>
        ) : invite ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You are invited to join <strong className="text-foreground">{invite.orgName}</strong>: shared stock, shops and workflows.
            </p>
            <Button className="mt-6" loading={accepting} onClick={() => void accept()}>
              Join the team <ArrowRight className="w-4 h-4" />
            </Button>
          </>
        ) : null}
      </Card>
    </main>
  )
}

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
        if (!authToken) throw new Error("Connecte-toi avec le mot de passe d'accès pour consulter cette invitation.")
        const result = await apiFetch<InviteInfo>(`/v1/invites/${encodeURIComponent(inviteToken)}`, { token: authToken })
        if (!cancelled) setInvite(result)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : ""
        if (!cancelled) setError(/410|expir/i.test(message) ? "Ce lien d'invitation a expiré. Demande un nouveau lien à l'équipe." : /404|introuvable/i.test(message) ? "Ce lien d'invitation est introuvable ou invalide." : message || "Impossible de charger l'invitation.")
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
      if (!authToken) throw new Error("Connecte-toi pour rejoindre l'équipe.")
      await apiFetch(`/v1/invites/${encodeURIComponent(inviteToken)}/accept`, { method: "POST", token: authToken })
      router.push("/dashboard")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de rejoindre cette équipe.")
    } finally {
      setAccepting(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-4 bg-background">
      <Octopus className="w-16" label="" />
      <Card className="max-w-lg w-full p-8 text-center">
        <Users className="w-8 h-8 mx-auto text-foreground mb-4" />
        <h1 className="font-heading text-2xl">Invitation OctoHandy</h1>
        {loading ? (
          <p className="text-sm text-muted-foreground mt-3">Chargement de l&apos;invitation…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive mt-4">{error}</p>
        ) : invite ? (
          <>
            <p className="text-muted-foreground mt-3">
              Tu es invité·e à rejoindre <strong className="text-foreground">{invite.orgName}</strong> : stock, boutiques et workflows partagés.
            </p>
            <Button className="mt-6" loading={accepting} onClick={() => void accept()}>
              Rejoindre l&apos;équipe <ArrowRight className="w-4 h-4" />
            </Button>
          </>
        ) : null}
      </Card>
    </main>
  )
}

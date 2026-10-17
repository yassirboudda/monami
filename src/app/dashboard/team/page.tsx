"use client"

import { useAuth, useOrganization } from "@clerk/nextjs"
import { Copy, Link2, Users } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, PageHeader } from "@/components/ui"
import { apiFetch } from "@/lib/api"

export default function TeamPage() {
  const { orgId, isLoaded, getToken } = useAuth()
  const { organization, memberships } = useOrganization({ memberships: { infinite: true } })
  const [inviteUrl, setInviteUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const members = memberships?.data ?? []

  const createInvite = async () => {
    setCreating(true)
    try {
      const token = await getToken()
      if (!token) throw new Error("Session Clerk introuvable")
      const result = await apiFetch<{ path: string }>("/v1/org/invite-links", { method: "POST", token })
      setInviteUrl(`${window.location.origin}${result.path}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible de créer le lien")
    } finally {
      setCreating(false)
    }
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    toast.success("Lien copié")
  }

  if (!isLoaded) return <Card className="p-5 text-sm text-muted-foreground">Chargement de l&apos;équipe…</Card>

  if (!orgId) {
    return (
      <div>
        <PageHeader label="Espace de travail" title="Équipe" />
        <Card className="p-5">
          <p className="font-semibold">Aucune organisation sélectionnée</p>
          <p className="text-sm text-muted-foreground mt-2">
            Utilise le sélecteur d&apos;organisation en haut de la page pour créer une organisation ou en rejoindre une.
            Ton espace personnel reste disponible séparément.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        label="Espace partagé"
        title={organization?.name || "Équipe"}
        subtitle="Les membres de cette organisation partagent les boutiques, annonces, stock et workflows."
        actions={
          <Button loading={creating} onClick={() => void createInvite()}>
            <Link2 className="w-4 h-4" /> Créer un lien d&apos;invitation
          </Button>
        }
      />
      {inviteUrl && (
        <Card className="p-4 mb-5 space-y-2">
          <p className="text-sm font-medium">Lien valable 7 jours</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-muted/50 p-2 text-xs">{inviteUrl}</code>
            <Button variant="secondary" size="sm" onClick={() => void copyInvite()}>
              <Copy className="w-3.5 h-3.5" /> Copier
            </Button>
          </div>
        </Card>
      )}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-secondary" />
          <h2 className="font-semibold">Membres</h2>
          <Badge tone="blue">{members.length}</Badge>
        </div>
        {!members.length ? (
          <p className="text-sm text-muted-foreground">Chargement des membres…</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {members.map((membership) => {
              const publicUser = membership.publicUserData
              const name = [publicUser?.firstName, publicUser?.lastName].filter(Boolean).join(" ")
              return (
                <li key={membership.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{name || publicUser?.identifier || "Membre"}</p>
                    {publicUser?.identifier && <p className="text-caption truncate">{publicUser.identifier}</p>}
                  </div>
                  <Badge>{membership.roleName}</Badge>
                </li>
              )
            })}
          </ul>
        )}
        {memberships?.hasNextPage && (
          <Button className="mt-4" variant="secondary" size="sm" onClick={() => void memberships.fetchNext()}>
            Charger plus de membres
          </Button>
        )}
      </Card>
    </div>
  )
}

"use client"

import { useAuth, useOrganization } from "@clerk/nextjs"
import { Copy, Link2, Users } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, Input, PageHeader, Textarea, Alert, Table, THead, TBody, TR, TH, TD } from "@/components/ui"
import { apiFetch } from "@/lib/api"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

type AgentProfile = {
  displayName: string
  preferences: Record<string, unknown>
}

function AgentProfileCard() {
  const { data, error, isLoading, request, mutate } = useWorkspaceResource<{ profile: AgentProfile }>("/v1/me/profile")
  const [nameDraft, setNameDraft] = useState<string | undefined>()
  const [notesDraft, setNotesDraft] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const profile = data?.profile
  const displayName = nameDraft ?? profile?.displayName ?? ""
  const savedNotes = typeof profile?.preferences?.notes === "string" ? profile.preferences.notes : ""
  const notes = notesDraft ?? savedNotes

  const saveProfile = async () => {
    setSaving(true)
    try {
      await request("/v1/me/profile", {
        method: "PUT",
        body: { displayName, preferences: { notes } },
      })
      await mutate()
      setNameDraft(undefined)
      setNotesDraft(undefined)
      toast.success("Profil enregistré")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible d'enregistrer le profil")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5 mb-5">
      <h2 className="font-semibold">Mon profil (lu par l&apos;agent)</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">Ton profil reste personnel, même dans une organisation.</p>
      {error && <Alert variant="destructive" className="mb-3">Impossible de charger le profil : {error.message}</Alert>}
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Nom affiché</span>
          <Input
            value={displayName}
            onChange={(event) => setNameDraft(event.target.value)}
            disabled={isLoading || saving}
            placeholder="Ton nom"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Préférences pour l&apos;agent</span>
          <Textarea
            value={notes}
            onChange={(event) => setNotesDraft(event.target.value)}
            disabled={isLoading || saving}
            placeholder="Ton, signature, habitudes…"
          />
        </label>
        <Button size="sm" loading={saving} disabled={isLoading} onClick={() => void saveProfile()}>
          Enregistrer le profil
        </Button>
      </div>
    </Card>
  )
}

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
        <AgentProfileCard />
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
        actions={
          <Button loading={creating} onClick={() => void createInvite()}>
            <Link2 className="w-4 h-4" /> Créer un lien d&apos;invitation
          </Button>
        }
      />
      <AgentProfileCard />
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
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Membre</TH>
                <TH>Email</TH>
                <TH className="text-right">Rôle</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((membership) => {
                const publicUser = membership.publicUserData
                const name = [publicUser?.firstName, publicUser?.lastName].filter(Boolean).join(" ")
                return (
                  <TR key={membership.id}>
                    <TD className="font-medium">{name || publicUser?.identifier || "Membre"}</TD>
                    <TD className="text-muted-foreground">{publicUser?.identifier || "—"}</TD>
                    <TD className="text-right"><Badge>{membership.roleName}</Badge></TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
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

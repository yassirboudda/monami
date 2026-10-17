"use client"

import { Check, Copy, Link2, Users } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, Badge, Button, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui"
import { useUser } from "@/lib/auth"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

export default function TeamPage() {
  const { user } = useUser()
  const { request } = useWorkspaceResource<{ shops: unknown[] }>("/v1/shops")
  const [inviteUrl, setInviteUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  const createInvite = async () => {
    setCreating(true)
    try {
      const result = (await request("/v1/org/invite-links", { method: "POST", body: {} })) as { path: string }
      setInviteUrl(`${window.location.origin}${result.path}`)
      setCopied(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de créer le lien")
    } finally {
      setCreating(false)
    }
  }
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast.success("Lien d'invitation copié")
  }
  return (
    <div>
      <PageHeader
        label="Espace de travail"
        title="Équipe"
        actions={
          <Button loading={creating} onClick={() => void createInvite()}>
            <Link2 className="w-4 h-4" /> Générer un lien d&apos;invitation
          </Button>
        }
      />
      {inviteUrl && (
        <Card className="p-4 mb-4">
          <p className="text-sm font-medium mb-2">Lien d&apos;invitation (valable 7 jours) — la personne se connecte avec le mot de passe d&apos;accès et partage ton stock, tes boutiques et tes workflows.</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-muted px-3 py-2 text-xs">{inviteUrl}</code>
            <Button variant="secondary" size="sm" onClick={() => void copyInvite()}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copié" : "Copier le lien"}
            </Button>
          </div>
        </Card>
      )}
      <Alert variant="info" className="mb-4">
        <span className="inline-flex items-center gap-2"><Users className="w-4 h-4" /> Démo mono-utilisateur : un seul espace, partagé via le mot de passe d&apos;accès. Les invitations et organisations arrivent après le PoC.</span>
      </Alert>
      <Card className="p-0 overflow-hidden">
        <Table className="border-0 rounded-none">
          <THead>
            <TR className="hover:bg-transparent"><TH>Membre</TH><TH>Email</TH><TH className="text-right">Rôle</TH></TR>
          </THead>
          <TBody>
            <TR>
              <TD className="font-medium">{user?.firstName || "Vendeur"}</TD>
              <TD className="text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</TD>
              <TD className="text-right"><Badge>propriétaire</Badge></TD>
            </TR>
          </TBody>
        </Table>
      </Card>
    </div>
  )
}

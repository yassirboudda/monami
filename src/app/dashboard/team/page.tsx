"use client"

import { Check, Copy, Link2, Users } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, PageHeader } from "@/components/ui"
import { useUser } from "@/lib/auth"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

export default function TeamPage() {
  const { user } = useUser()
  const { request } = useWorkspaceResource<{ shops: unknown[] }>("/v1/shops")
  const [inviteUrl, setInviteUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const name = user?.firstName || "Vendeur"
  const email = user?.primaryEmailAddress?.emailAddress || "—"

  const createInvite = async () => {
    setCreating(true)
    try {
      const result = await request<{ path: string }>("/v1/org/invite-links", { method: "POST", body: {} })
      setInviteUrl(`${window.location.origin}${result.path}`)
      setCopied(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not create the link")
    } finally {
      setCreating(false)
    }
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast.success("Invitation link copied")
  }

  return (
    <div>
      <PageHeader
        label="Workspace"
        title="Team"
        actions={
          <Button loading={creating} onClick={() => void createInvite()}>
            <Link2 className="size-4" /> Generate an invitation link
          </Button>
        }
      />
      {inviteUrl && (
        <Card className="mb-4 rounded-2xl p-5">
          <p className="mb-3 text-sm font-medium">Invitation link (valid 7 days) — the person signs in with the access password and shares your stock, shops and workflows.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 text-xs">{inviteUrl}</code>
            <Button variant="secondary" size="sm" onClick={() => void copyInvite()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </Card>
      )}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-sky/70 bg-sky/30 p-4 text-sm">
        <Users className="mt-0.5 size-4 shrink-0" />
        <p>A shared workspace: invited people sign in with the access password and share your stock, shops and workflows.</p>
      </div>
      <Card className="overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-butter text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
          <Badge>owner</Badge>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="text-label mb-1">Membre</p>
            <p className="text-sm font-medium">{name}</p>
          </div>
          <div>
            <p className="text-label mb-1">Role</p>
            <p className="text-sm font-medium">Workspace owner</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

"use client"

import { Users } from "lucide-react"
import { Badge, Card, PageHeader } from "@/components/ui"
import { useUser } from "@/lib/auth"

export default function TeamPage() {
  const { user } = useUser()
  const name = user?.firstName || "Vendeur"
  const email = user?.primaryEmailAddress?.emailAddress || "—"

  return (
    <div>
      <PageHeader label="Espace de travail" title="Équipe" />
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-sky/70 bg-sky/30 p-4 text-sm">
        <Users className="mt-0.5 size-4 shrink-0" />
        <p>Un espace partagé : les personnes invitées se connectent avec le mot de passe d&apos;accès et partagent ton stock, tes boutiques et tes workflows.</p>
      </div>
      <Card className="overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-butter text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
          <Badge>propriétaire</Badge>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="text-label mb-1">Membre</p>
            <p className="text-sm font-medium">{name}</p>
          </div>
          <div>
            <p className="text-label mb-1">Rôle</p>
            <p className="text-sm font-medium">Propriétaire de l&apos;espace</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

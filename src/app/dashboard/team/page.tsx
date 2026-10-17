"use client"

import { Users } from "lucide-react"
import { Alert, Card, PageHeader, Table, TBody, TD, TH, THead, TR, Badge } from "@/components/ui"
import { useUser } from "@/lib/auth"

export default function TeamPage() {
  const { user } = useUser()
  return (
    <div>
      <PageHeader label="Espace de travail" title="Équipe" />
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

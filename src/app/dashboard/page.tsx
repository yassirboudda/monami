import Link from "next/link"
import { MessageSquareText, Package, Puzzle, Store, Users, Workflow } from "lucide-react"
import { Card, PageHeader } from "@/components/ui"

const cards = [
  { href: "/dashboard/chat", title: "Chat agent", text: "Échange avec l'agent OctoHandy, partage des images et obtiens des conseils pour tes marketplaces.", icon: MessageSquareText },
  { href: "/dashboard/shops", title: "Boutique", text: "Boutiques + annonces. Clic boutique → ses annonces.", icon: Store },
  { href: "/dashboard/extension", title: "Extension", text: "Chrome companion pour cookies Vinted / Leboncoin.", icon: Puzzle },
  { href: "/dashboard/stock", title: "Stock", text: "Inventaire partagé dans l'organisation active.", icon: Package },
  { href: "/dashboard/team", title: "Équipe", text: "Membres de l'organisation et liens d'invitation.", icon: Users },
  { href: "/dashboard/workflows", title: "Workflows", text: "Templates par marketplace (ex. favoris Vinted → offre).", icon: Workflow },
]

export default function DashboardHome() {
  return (
    <div>
      <PageHeader
        label="Dashboard"
        title="Vue d'ensemble"
        subtitle="Retrouve tes boutiques, annonces, stock et workflows marketplace au même endroit."
      />
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card interactive className="p-5 h-full">
              <c.icon className="w-5 h-5 text-secondary mb-3" />
              <p className="font-semibold">{c.title}</p>
              <p className="text-caption mt-1">{c.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

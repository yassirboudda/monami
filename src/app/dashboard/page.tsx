import Link from "next/link"
import { MessageSquareText, MonitorSmartphone, Package, Store, Users, Workflow } from "lucide-react"
import { Card, PageHeader } from "@/components/ui"

const cards = [
  { href: "/dashboard/chat", title: "Chat agent", text: "Échange avec l'agent OctoHandy, partage des images et obtiens des conseils pour tes marketplaces.", icon: MessageSquareText },
  { href: "/dashboard/shops", title: "Boutique", text: "Connecte Vinted, eBay, Vestiaire… en un clic dans le bureau distant. Boutiques + annonces.", icon: Store },
  { href: "/dashboard/desktop", title: "Bureau OctoHandy", text: "Ton Chrome distant (GPU Brev, IP résidentielle) avec Screenpipe et l'agent Hermes : statut, écran, journal.", icon: MonitorSmartphone },
  { href: "/dashboard/stock", title: "Stock", text: "Inventaire partagé dans l'organisation active.", icon: Package },
  { href: "/dashboard/team", title: "Équipe", text: "Membres de l'organisation et liens d'invitation.", icon: Users },
  { href: "/dashboard/workflows", title: "Workflows", text: "Templates, apprentissage en le faisant (Screenpipe) et exécution par l'agent avec approbation.", icon: Workflow },
]

export default function DashboardHome() {
  return (
    <div>
      <PageHeader
        label="Dashboard"
        title="Vue d'ensemble"
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

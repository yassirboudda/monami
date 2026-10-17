"use client"

import { ExternalLink, Puzzle, RefreshCw, Store, Tags } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, EmptyState, MarketplaceLogo, PageHeader, StatusDot } from "@/components/ui"
import type { Shop } from "@/lib/store"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

const mpUrl = { leboncoin: "https://www.leboncoin.fr", vinted: "https://www.vinted.fr" }

export default function ShopsPage() {
  const router = useRouter()
  const { data, error, isLoading, request, mutate } = useWorkspaceResource<{ shops: Shop[] }>("/v1/shops")
  const shops = data?.shops ?? []

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || typeof e.data !== "object") return
      if (e.data.type === "STOCKFLOW_SHOP_CONNECTED") {
        void mutate()
        toast.success(`${e.data.marketplace} connecté via extension`)
      }
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [mutate])

  const refresh = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await request(`/v1/shops/${id}`, { method: "PATCH", body: { status: "connected" } })
      await mutate()
      toast.success("Session marquée valide")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible de vérifier la session")
    }
  }

  const openShop = (id: string) => router.push(`/dashboard/shops/${id}`)

  return (
    <div>
      <PageHeader
        label="Marketplace"
        title="Boutique"
        subtitle="Boutiques + annonces au même endroit. Clique une boutique pour voir ses annonces."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/shops/all">
              <Button variant="secondary">
                <Tags className="w-4 h-4" /> Voir toutes les annonces
              </Button>
            </Link>
            <Link href="/dashboard/extension">
              <Button>
                <Puzzle className="w-4 h-4" /> Extension cookies
              </Button>
            </Link>
          </div>
        }
      />

      {error ? (
        <Card className="p-4 text-sm text-red-700">Impossible de charger les boutiques : {error.message}</Card>
      ) : isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground">Chargement des boutiques…</Card>
      ) : !shops.length ? (
        <Card>
          <EmptyState
            icon={<Store className="w-6 h-6" />}
            title="Aucune boutique"
            text="Installe l&apos;extension Stockflow pour connecter Vinted / Leboncoin, ou recharge pour les mocks."
            action={
              <Link href="/dashboard/extension">
                <Button>
                  <Puzzle className="w-4 h-4" /> Installer l&apos;extension
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {shops.map((s) => {
            const ok = s.status === "connected"
            return (
              <Card
                key={s.id}
                interactive
                className="p-5"
                onClick={() => openShop(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    openShop(s.id)
                  }
                }}
                role="link"
                tabIndex={0}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <MarketplaceLogo marketplace={s.marketplace} size={48} />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-white p-[3px] shadow">
                      <StatusDot tone={ok ? "green" : "red"} live={ok} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{s.displayName}</p>
                      <Badge tone={s.marketplace === "vinted" ? "teal" : "amber"}>{s.marketplace}</Badge>
                    </div>
                    <p className={`text-xs mt-1.5 font-medium ${ok ? "text-emerald-700" : "text-red-600"}`}>
                      {ok ? "Session valide" : "Session expirée"}
                    </p>
                    <p className="text-caption mt-1">{s.listingCount} annonces · clic pour ouvrir</p>
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation()
                      openShop(s.id)
                    }}
                  >
                    <Tags className="w-3.5 h-3.5" /> Voir les annonces
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                  <Button variant="secondary" size="sm" onClick={(e) => void refresh(s.id, e)}>
                    <RefreshCw className="w-3.5 h-3.5" /> Vérifier
                  </Button>
                  <a href={mpUrl[s.marketplace]} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="w-3.5 h-3.5" /> Ouvrir
                    </Button>
                  </a>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

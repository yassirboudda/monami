"use client"

import { ArrowLeft, RefreshCw, Store, Tags } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { ListingsGrid } from "@/components/listings-grid"
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatusDot } from "@/components/ui"
import type { Listing, Shop } from "@/lib/store"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

export default function ShopDetailPage() {
  const params = useParams<{ id: string }>()
  const shopId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : ""
  const shopsResource = useWorkspaceResource<{ shops: Shop[] }>("/v1/shops")
  const listingsResource = useWorkspaceResource<{ listings: Listing[] }>(`/v1/shops/${encodeURIComponent(shopId)}/listings`)
  const shop = shopsResource.data?.shops.find((entry) => entry.id === shopId) ?? null
  const listings = listingsResource.data?.listings ?? []
  const isLoading = shopsResource.isLoading || listingsResource.isLoading
  const title = shop?.displayName || "Shop"
  const [refreshing, setRefreshing] = useState(false)

  const refreshListings = async () => {
    if (!shop) return
    setRefreshing(true)
    try {
      const r = (await listingsResource.request("/v1/shops/sync", { method: "POST", body: { marketplaces: [shop.marketplace] } })) as {
        report: { marketplace: string; ok: boolean; loggedIn?: boolean; listings?: number; error?: string }[]
      }
      const entry = r.report[0]
      if (!entry?.ok) toast.error(entry?.error || "Could not read the desktop")
      else if (!entry.loggedIn) toast.message(`Not logged in to ${shop.marketplace} on the desktop`)
      else toast.success(`${entry.listings ?? 0} listings read from ${shop.marketplace}`)
      await Promise.all([listingsResource.mutate(), shopsResource.mutate()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }

  if (!shopId) return null

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    )
  }

  if (!shop) {
    return (
      <Card>
        <EmptyState
          icon={<Store className="w-6 h-6" />}
          title="Shop not found"
          text="This shop does not exist in this workspace. Go back to Shops."
          action={
            <Button size="sm" asChild>
              <Link href="/dashboard/shops">Retour boutiques</Link>
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        label="Shop"
        title={title}
        subtitle={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <Badge tone={shop.marketplace === "vinted" ? "teal" : "amber"}>{shop.marketplace}</Badge>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <StatusDot tone={shop.status === "connected" ? "green" : "red"} live={shop.status === "connected"} />
              {shop.status === "connected" ? "Session valid" : "Session expired"}
            </span>
            <span className="text-sm text-muted-foreground">· {listings.length} listings</span>
          </span>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/shops">
                <ArrowLeft className="w-3.5 h-3.5" /> Shops
              </Link>
            </Button>
            <Button variant="secondary" size="sm" loading={refreshing} onClick={refreshListings}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh listings
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dashboard/shops/all">
                <Tags className="w-3.5 h-3.5" /> View all listings
              </Link>
            </Button>
          </>
        }
      />
      <ListingsGrid listings={listings} emptyText="This shop has no listings yet." />
    </div>
  )
}

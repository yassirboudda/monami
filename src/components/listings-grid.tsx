"use client"

import { useUser } from "@/lib/auth"
import { ExternalLink, Tag } from "lucide-react"
import { Badge, Card, EmptyState } from "@/components/ui"
import type { Listing } from "@/lib/store"

const statusTone = {
  active: "green" as const,
  reserved: "amber" as const,
  sold: "slate" as const,
}

const statusLabel = {
  active: "Live",
  reserved: "Reserved",
  sold: "Sold",
}

export function ListingsGrid({ listings, emptyText }: { listings: Listing[]; emptyText?: string }) {
  const { user } = useUser()
  if (!listings.length) {
    return (
      <Card>
        <EmptyState icon={<Tag className="w-6 h-6" />} title="No listings" text={emptyText || "No listings in this shop yet."} />
      </Card>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {listings.map((l) => (
        <Card key={l.id} className="p-4 flex flex-col gap-3 min-w-0 overflow-hidden">
          {l.imageUrl && (
            <div className="-mx-4 -mt-4 mb-1 aspect-[4/3] overflow-hidden rounded-t-xl bg-muted">
              <img src={l.imageUrl.startsWith("/v1/") ? `/backend${l.imageUrl}` : l.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{l.title}</p>
              <p className="text-caption mt-0.5 capitalize">{l.marketplace}</p>
            </div>
            <Badge tone={statusTone[l.status]}>{statusLabel[l.status]}</Badge>
          </div>
          <p className="text-xl font-semibold tracking-tight tabular-nums">{l.price.toFixed(0)} €</p>
          <div className="flex items-center gap-3 text-caption tabular-nums">
            <span>{l.views ?? 0} views</span>
            <span>{l.favorites ?? 0} favourites</span>
          </div>
          {l.createdBy && (
            <p className="text-caption">
              Created by {l.createdBy === user?.id ? "you" : l.creatorName || "a team member"}
            </p>
          )}
          {l.url ? (
            <a href={l.url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1.5 border-t pt-3 text-sm font-medium text-foreground hover:underline underline-offset-4">
              <ExternalLink className="w-3.5 h-3.5" /> Open on {l.marketplace}
            </a>
          ) : null}
        </Card>
      ))}
    </div>
  )
}

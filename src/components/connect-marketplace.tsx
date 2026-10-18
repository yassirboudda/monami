"use client"

import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, MarketplaceLogo } from "@/components/ui"
import { ModalOrCard } from "@/components/chat-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import type { Shop } from "@/lib/store"

export const CONNECTABLE_MARKETPLACES = [
  { id: "vinted", name: "Vinted" },
  { id: "ebay", name: "eBay" },
  { id: "etsy", name: "Etsy" },
  { id: "depop", name: "Depop" },
  { id: "vestiaire", name: "Vestiaire Collective" },
  { id: "wallapop", name: "Wallapop" },
  { id: "facebook_marketplace", name: "Facebook Marketplace" },
]

type MarketplaceOption = { id: string; name: string }
type MarketplaceRecord = { marketplace_id?: string; id?: string; name?: string }

export type DesktopSession = {
  url: string
  expiresAt: string
  marketplace: string | null
  purpose: "connect" | "teach" | "browse"
  startUrl: string | null
  opened: boolean
}

type Requester = <R>(path: string, options?: { method?: string; body?: unknown }) => Promise<R>

export function useMarketplaceOptions(request: Requester, enabled: boolean): MarketplaceOption[] {
  const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>(CONNECTABLE_MARKETPLACES)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    request<MarketplaceRecord[] | { marketplaces?: MarketplaceRecord[] }>("/v1/marketplaces")
      .then((payload) => {
        const records = Array.isArray(payload) ? payload : payload.marketplaces ?? []
        if (!records.length || cancelled) return
        const known = new Map(CONNECTABLE_MARKETPLACES.map((marketplace) => [marketplace.id, marketplace.name]))
        const options = records.flatMap((record) => {
          const id = record.marketplace_id ?? record.id
          // The backend catalog also documents marketplaces we don't connect to; only offer the handled ones.
          if (!id || !known.has(id)) return []
          return [{ id, name: known.get(id) ?? record.name ?? id }]
        })
        if (options.length) setMarketplaces(options)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, request])
  return marketplaces
}

export function marketplaceName(id: string, options: MarketplaceOption[] = CONNECTABLE_MARKETPLACES) {
  return options.find((marketplace) => marketplace.id === id)?.name ?? id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function ConnectMarketplaceModal({
  open,
  onClose,
  request,
  initialMarketplace,
  onConnected,
  inline = false,
}: {
  open: boolean
  onClose: () => void
  request: Requester
  initialMarketplace?: string | null
  onConnected?: (shop: Shop) => void
  /** Render as a card in the chat instead of a modal. */
  inline?: boolean
}) {
  const [marketplace, setMarketplace] = useState<string | null>(initialMarketplace ?? null)
  const [session, setSession] = useState<DesktopSession | null>(null)
  const [loading, setLoading] = useState(Boolean(initialMarketplace))
  const [confirming, setConfirming] = useState(false)
  const marketplaces = useMarketplaceOptions(request, open)

  const start = useCallback(
    async (mp: string) => {
      setMarketplace(mp)
      setLoading(true)
      try {
        const next = await request<DesktopSession>("/v1/desktop/sessions", {
          method: "POST",
          body: { marketplace: mp, purpose: "connect" },
        })
        setSession(next)
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Remote desktop unavailable")
      } finally {
        setLoading(false)
      }
    },
    [request]
  )

  // The parent remounts this modal (key) on every open, so state starts clean here.
  useEffect(() => {
    if (!open || !initialMarketplace) return
    let cancelled = false
    request<DesktopSession>("/v1/desktop/sessions", {
      method: "POST",
      body: { marketplace: initialMarketplace, purpose: "connect" },
    })
      .then((next) => {
        if (!cancelled) setSession(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(cause instanceof Error ? cause.message : "Remote desktop unavailable")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, initialMarketplace, request])

  const confirm = async () => {
    if (!marketplace) return
    setConfirming(true)
    try {
      const { shop } = await request<{ shop: Shop }>("/v1/desktop/connected", {
        method: "POST",
        body: { marketplace },
      })
      toast.success(`${marketplaceName(marketplace, marketplaces)} connected on the OctoHandy desktop`)
      onConnected?.(shop)
      await request("/v1/desktop/release", { method: "POST" }).catch(() => undefined)
      onClose()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the connection")
    } finally {
      setConfirming(false)
    }
  }

  const close = async () => {
    await request("/v1/desktop/release", { method: "POST" }).catch(() => undefined)
    onClose()
  }

  const name = marketplace ? marketplaceName(marketplace, marketplaces) : null
  const expires = session ? new Date(session.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null

  return (
    <ModalOrCard inline={inline} open={open} onClose={() => void close()} title={name ? `Connect ${name}` : "Connect a marketplace"}>
      {!session ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pick a marketplace. You log in yourself in Chrome on the OctoHandy desktop.
            Your credentials and cookies stay on that desktop, never on your PC, and
            the Hermes agent then works in that same session.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {marketplaces.map((m) => (
              <Button
                key={m.id}
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => void start(m.id)}
                className="h-auto flex-col gap-2 p-4 whitespace-normal"
              >
                {loading && marketplace === m.id ? <Loader2 className="w-9 h-9 animate-spin text-muted-foreground" /> : <MarketplaceLogo marketplace={m.id} size={36} />}
                {m.name}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Encrypted connection, temporary token, one member at a time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {!session.opened && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertDescription className="text-amber-900">The page could not be opened automatically. Open the login page in the desktop browser.</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Log in to <strong>{name}</strong> in the window below
            {session.opened ? " (the login page just opened in Chrome)" : ""}. Once your shop
            is showing, click “Connected”.
          </p>
          <div className="rounded-lg overflow-hidden border bg-black aspect-video">
            <iframe
              src={session.url}
              title="OctoHandy remote desktop"
              className="w-full h-full"
              allow="clipboard-read; clipboard-write"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Session valid until {expires}.</span>
            <div className="flex flex-wrap gap-2">
              <a href={session.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink className="w-4 h-4" /> Full screen
              </a>
              <Button variant="secondary" size="sm" onClick={() => marketplace && void start(marketplace)} loading={loading}>
                <RefreshCw className="w-4 h-4" /> New session
              </Button>
              <Button size="sm" onClick={() => void confirm()} loading={confirming}>
                <CheckCircle2 className="w-4 h-4" /> Connected
              </Button>
            </div>
          </div>
        </div>
      )}
    </ModalOrCard>
  )
}

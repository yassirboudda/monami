"use client"

import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, MarketplaceLogo, Modal } from "@/components/ui"
import type { Shop } from "@/lib/store"

export const CONNECTABLE_MARKETPLACES = [
  { id: "vinted", name: "Vinted" },
  { id: "leboncoin", name: "Leboncoin" },
  { id: "ebay", name: "eBay" },
  { id: "etsy", name: "Etsy" },
  { id: "depop", name: "Depop" },
  { id: "vestiaire", name: "Vestiaire Collective" },
  { id: "wallapop", name: "Wallapop" },
  { id: "facebook_marketplace", name: "Facebook Marketplace" },
]

export type DesktopSession = {
  url: string
  expiresAt: string
  marketplace: string | null
  purpose: "connect" | "teach" | "browse"
  startUrl: string | null
  opened: boolean
}

type Requester = <R>(path: string, options?: { method?: string; body?: unknown }) => Promise<R>

export function marketplaceName(id: string) {
  return CONNECTABLE_MARKETPLACES.find((m) => m.id === id)?.name ?? id
}

export function ConnectMarketplaceModal({
  open,
  onClose,
  request,
  initialMarketplace,
  onConnected,
}: {
  open: boolean
  onClose: () => void
  request: Requester
  initialMarketplace?: string | null
  onConnected?: (shop: Shop) => void
}) {
  const [marketplace, setMarketplace] = useState<string | null>(initialMarketplace ?? null)
  const [session, setSession] = useState<DesktopSession | null>(null)
  const [loading, setLoading] = useState(Boolean(initialMarketplace))
  const [confirming, setConfirming] = useState(false)

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
        toast.error(cause instanceof Error ? cause.message : "Bureau distant indisponible")
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
        if (!cancelled) toast.error(cause instanceof Error ? cause.message : "Bureau distant indisponible")
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
      toast.success(`${marketplaceName(marketplace)} connecté sur le bureau OctoHandy`)
      onConnected?.(shop)
      onClose()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible d'enregistrer la connexion")
    } finally {
      setConfirming(false)
    }
  }

  const name = marketplace ? marketplaceName(marketplace) : null
  const expires = session ? new Date(session.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null

  return (
    <Modal open={open} onClose={onClose} title={name ? `Connecter ${name}` : "Connecter une marketplace"} wide>
      {!session ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choisis la marketplace. Tu te connectes toi-même dans un vrai Chrome hébergé sur le bureau OctoHandy
            (IP résidentielle française). Tes identifiants et cookies restent sur ce bureau, jamais sur ton PC, et
            l&apos;agent Hermes travaille ensuite dans cette même session.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CONNECTABLE_MARKETPLACES.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={loading}
                onClick={() => void start(m.id)}
                className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-sm font-medium hover:border-primary hover:shadow-sm transition disabled:opacity-50"
              >
                {loading && marketplace === m.id ? <Loader2 className="w-9 h-9 animate-spin text-muted-foreground" /> : <MarketplaceLogo marketplace={m.id} size={36} />}
                {m.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Accès chiffré, jeton temporaire, bureau privé mono-utilisateur (PoC).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connecte-toi à <strong>{name}</strong> dans la fenêtre ci-dessous
            {session.opened ? " (la page de connexion vient de s'ouvrir dans Chrome)" : ""}. Quand ta boutique
            s&apos;affiche, clique « C&apos;est connecté ».
          </p>
          <div className="rounded-xl overflow-hidden border bg-black aspect-video">
            <iframe
              src={session.url}
              title="Bureau distant OctoHandy"
              className="w-full h-full"
              allow="clipboard-read; clipboard-write"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Session valable jusqu&apos;à {expires}.</span>
            <div className="flex flex-wrap gap-2">
              <a href={session.url} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <ExternalLink className="w-4 h-4" /> Plein écran
                </Button>
              </a>
              <Button variant="secondary" size="sm" onClick={() => marketplace && void start(marketplace)} loading={loading}>
                <RefreshCw className="w-4 h-4" /> Nouvelle session
              </Button>
              <Button size="sm" onClick={() => void confirm()} loading={confirming}>
                <CheckCircle2 className="w-4 h-4" /> C&apos;est connecté
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

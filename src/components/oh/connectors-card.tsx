"use client"

import { Link2, Unlink } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

type Provider = {
  id: string
  name: string
  description: string
  scopes: string[]
  connected: boolean
  email: string | null
  connectedAt: string | null
}
type Connectors = { configured: boolean; providers: Provider[] }

function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export function ConnectorsCard() {
  const { data, isLoading, mutate, request } = useWorkspaceResource<{ connectors: Connectors }>("/v1/connectors")
  const [busy, setBusy] = useState<string | null>(null)
  const connectors = data?.connectors

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get("google")
    if (!flag) return
    if (flag === "connected") toast.success("Google connected — the agent can now read your Gmail and Calendar.")
    if (flag === "error") toast.error(`Google connection failed${params.get("reason") ? `: ${params.get("reason")}` : "."}`)
    window.history.replaceState({}, "", window.location.pathname)
    void mutate()
  }, [mutate])

  async function connect(id: string) {
    setBusy(id)
    try {
      const { url } = await request<{ url: string }>(`/v1/connectors/${id}/start`, { method: "POST" })
      window.location.assign(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connector unavailable right now.")
      setBusy(null)
    }
  }

  async function disconnect(id: string) {
    setBusy(id)
    try {
      await request(`/v1/connectors/${id}`, { method: "DELETE" })
      toast("Google disconnected. Stored tokens were revoked.")
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-5 space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Link2 className="w-5 h-5 mt-0.5 text-muted-foreground" />
        <div className="flex-1">
          <h2 className="font-medium">Connectors</h2>
          <p className="text-sm text-muted-foreground">
            Give the agent access to the tools you already use. Each connector is linked to your own account and can be
            removed at any time; actions that send or publish something still wait for your approval.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {(connectors?.providers ?? []).map((p) => (
          <div key={p.id} className="rounded-lg border p-4 flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="shrink-0 mt-0.5">{p.id === "google" ? <GoogleIcon className="w-7 h-7" /> : <Link2 className="w-6 h-6" />}</div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{p.name}</span>
                {p.connected ? (
                  <Badge tone="green">Connected{p.email ? ` · ${p.email}` : ""}</Badge>
                ) : (
                  <Badge tone="slate">Not connected</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{p.description}</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {p.scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="shrink-0">
              {p.connected ? (
                <Button variant="secondary" size="sm" onClick={() => void disconnect(p.id)} loading={busy === p.id}>
                  <Unlink className="w-4 h-4" /> Disconnect
                </Button>
              ) : connectors?.configured ? (
                <Button size="sm" onClick={() => void connect(p.id)} loading={busy === p.id} disabled={isLoading}>
                  Connect {p.name}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled title="The Google OAuth client is not configured on the server yet.">
                  Coming soon
                </Button>
              )}
            </div>
          </div>
        ))}
        {!isLoading && !connectors?.providers?.length && (
          <p className="text-sm text-muted-foreground">No connectors available.</p>
        )}
      </div>
    </Card>
  )
}

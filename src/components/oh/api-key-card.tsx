"use client"

import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

type ApiKey = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

/** Settings → API key: lets the seller plug MonAmi into their own agent (Claude, Cursor…) through MCP. */
export function ApiKeyCard() {
  const { data, mutate, request } = useWorkspaceResource<{ keys: ApiKey[]; mcpUrl: string }>("/v1/api-keys")
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const mcpUrl = data?.mcpUrl ?? `${typeof window !== "undefined" ? window.location.origin : ""}/backend/v1/mcp`

  async function create() {
    setBusy("create")
    try {
      const out = await request<{ key: string }>("/v1/api-keys", { method: "POST", body: { name: "default" } })
      setFresh(out.key)
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the key.")
    } finally {
      setBusy(null)
    }
  }

  async function revoke(id: string) {
    setBusy(id)
    try {
      await request(`/v1/api-keys/${id}`, { method: "DELETE" })
      await mutate()
      toast.success("Key revoked.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke the key.")
    } finally {
      setBusy(null)
    }
  }

  const snippet = JSON.stringify({ mcpServers: { monami: { url: mcpUrl, headers: { Authorization: `Bearer ${fresh ?? "oh_live_…"}` } } } }, null, 2)

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <KeyRound className="w-5 h-5 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <h2 className="font-medium">API key &amp; MCP</h2>
          <p className="text-caption mt-1">Drive monami from your own agent (Claude, Cursor, n8n…): shops, listings, market prices, price alerts, the chat and the full remote desktop (open a session, navigate, read, click, type, record, clipboard) are exposed as MCP tools. Your plan&apos;s desktop minutes and approvals apply.</p>
        </div>
        <Button size="sm" onClick={() => void create()} loading={busy === "create"}>
          <Plus className="w-3.5 h-3.5" /> New key
        </Button>
      </div>

      {fresh && (
        <div className="rounded-xl border border-[var(--horizon)] bg-[var(--horizon)]/10 p-3 text-sm">
          <p className="font-medium">Copy your key now — it will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-2 py-1.5 font-mono text-xs">{fresh}</code>
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(fresh); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
            </Button>
          </div>
        </div>
      )}

      {data && (
        <ul className="divide-y rounded-xl border">
          {data.keys.length === 0 && <li className="p-3 text-sm text-muted-foreground">No key yet.</li>}
          {data.keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 p-3 text-sm">
              <code className="font-mono text-xs">{k.prefix}…</code>
              <span className="text-muted-foreground">{k.name}</span>
              <Badge tone={k.lastUsedAt ? "green" : "slate"} className="ml-auto">{k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}` : "never used"}</Badge>
              <Button size="sm" variant="ghost" aria-label="Revoke" loading={busy === k.id} onClick={() => void revoke(k.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">How to connect (MCP, streamable HTTP)</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs">{snippet}</pre>
      </details>
    </Card>
  )
}

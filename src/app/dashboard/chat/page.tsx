"use client"

import { useAuth, useUser } from "@/lib/auth"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp, Check, ImagePlus, Loader2, ShieldAlert, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, cn, MarketplaceLogo, PageHeader } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { apiConfigured, apiFetch } from "@/lib/api"
import { store, type ChatMsg } from "@/lib/store"
import { Octopus } from "@/components/oh/octopus"

function FanAttachments({
  items,
  onRemove,
}: {
  items: { id: string; preview: string; name: string }[]
  onRemove?: (id: string) => void
}) {
  if (!items.length) return null
  const mid = (items.length - 1) / 2
  return (
    <div className="flex justify-center px-2 pt-2 pb-1" style={{ minHeight: items.length > 1 ? 72 : 56 }}>
      <div className="relative flex items-end justify-center" style={{ width: Math.max(56, items.length * 28 + 40), height: 64 }}>
        {items.map((a, i) => {
          const rot = (i - mid) * 10
          const x = (i - mid) * 22
          return (
            <motion.span
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, rotate: rot }}
              className="absolute bottom-0"
              style={{ left: "50%", marginLeft: -28 + x, zIndex: i + 1 }}
            >
              <span className="relative block">
                <img src={a.preview} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/80 shadow-md" />
                {onRemove && (
                  <button
                    type="button"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#0f172a] text-white text-[10px] flex items-center justify-center"
                    onClick={() => onRemove(a.id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            </motion.span>
          )
        })}
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  "Qu'est-ce qu'il y a sur mon bureau en ce moment ?",
  "Quel compte Vinted est connecté ?",
  "Liste mes workflows",
  "Prépare une réponse à mon dernier acheteur",
]

const VIDEO_URL = /https?:\/\/\S+\.mp4\b/g

function renderContent(content: string) {
  const videos = Array.from(new Set(content.match(VIDEO_URL) ?? []))
  if (!videos.length) return content
  const text = content.replace(VIDEO_URL, "").replace(/[ \t]+\n/g, "\n").trim()
  return (
    <>
      {text}
      {videos.map((src) => (
        <video key={src} src={src} controls preload="metadata" className="mt-2 w-full max-w-[520px] rounded-lg border border-border bg-black" />
      ))}
    </>
  )
}

type AgentMessage = {
  id: string
  kind: "info" | "approval" | "sent"
  marketplace: string | null
  title: string
  body: string
  status: "pending" | "approved" | "rejected" | "seen"
  created_at: string
  decided_at: string | null
}

type TimelineItem = { at: string; chat?: ChatMsg; agent?: AgentMessage }

function AgentCard({ m, onDecide, busy }: { m: AgentMessage; onDecide: (id: string, decision: "approved" | "rejected") => void; busy: boolean }) {
  const pending = m.kind === "approval" && m.status === "pending"
  return (
    <div className="flex justify-start">
      <div className={cn("max-w-[85%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm space-y-2", pending ? "border-amber-300 bg-amber-50" : "bg-muted border-border")}>
        <div className="flex items-center gap-2">
          {m.marketplace ? <MarketplaceLogo marketplace={m.marketplace} size={20} /> : <ShieldAlert className="w-4 h-4 text-amber-600" />}
          <span className="font-medium">{m.title}</span>
          {m.kind === "sent" && <Badge tone="teal">Envoyé</Badge>}
          {m.kind === "approval" && m.status === "approved" && <Badge tone="teal">Approuvé</Badge>}
          {m.kind === "approval" && m.status === "rejected" && <Badge tone="red">Refusé</Badge>}
          {pending && <Badge tone="amber">Ton accord ?</Badge>}
        </div>
        {m.body && <p className="whitespace-pre-wrap text-foreground/90">{m.body}</p>}
        {pending && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" loading={busy} onClick={() => onDecide(m.id, "approved")}>
              <Check className="w-3.5 h-3.5" /> Approuver et envoyer
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(m.id, "rejected")}>
              Refuser
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { user } = useUser()
  const { getToken, userId, orgId } = useAuth()
  const activeOrgId = orgId ?? null
  const msgs = useSyncExternalStore(
    (onChange) => store.subscribeChat(userId ?? "", activeOrgId, onChange),
    () => store.getChat(userId ?? "", activeOrgId),
    () => store.getChat("", activeOrgId)
  )
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState<{ id: string; preview: string; name: string; file: File }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const hasApi = apiConfigured()
  const agentFeed = useWorkspaceResource<{ messages: AgentMessage[] }>("/v1/agent/messages?limit=40")
  const [deciding, setDeciding] = useState<string | null>(null)
  useEffect(() => {
    if (!hasApi) return
    const id = setInterval(() => void agentFeed.mutate(), 15000)
    return () => clearInterval(id)
  }, [hasApi, agentFeed])
  const decide = async (id: string, decision: "approved" | "rejected") => {
    setDeciding(id)
    try {
      await agentFeed.request(`/v1/agent/messages/${id}/decide`, { method: "POST", body: { decision } })
      await agentFeed.mutate()
      toast.success(decision === "approved" ? "L'agent envoie la réponse sur le bureau." : "Refusé — rien ne sera envoyé.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Décision impossible")
    } finally {
      setDeciding(null)
    }
  }
  const timeline: TimelineItem[] = [
    ...msgs.map((m) => ({ at: m.at, chat: m })),
    ...(agentFeed.data?.messages ?? []).map((a) => ({ at: a.created_at, agent: a })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs, busy, agentFeed.data])

  const persist = (next: ChatMsg[]) => {
    store.setChat(next, userId ?? "", activeOrgId)
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const next = [...attachments]
    for (const file of Array.from(files).slice(0, 6 - attachments.length)) {
      if (!file.type.startsWith("image/")) {
        toast.error("Ajoute uniquement des images.")
        continue
      }
      const preview = URL.createObjectURL(file)
      next.push({ id: crypto.randomUUID(), preview, name: file.name, file })
    }
    setAttachments(next)
  }

  const send = async () => {
    const text = draft.trim()
    if (!text && !attachments.length) return
    setBusy(true)
    const images = attachments.map((a) => a.preview)
    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || "(image)",
      images: images.length ? images : undefined,
      at: new Date().toISOString(),
    }
    const withUser = [...msgs, userMsg]
    persist(withUser)
    setDraft("")
    setAttachments([])

    try {
      let content: string
      if (hasApi) {
        const token = await getToken()
        const data = await apiFetch<{ content: string; model?: string }>("/v1/chat", {
          method: "POST",
          token,
          body: { message: text || "(image)", images },
        })
        content = data.content
      } else {
        await new Promise((r) => setTimeout(r, 700))
        content = images.length
          ? `J'ai reçu ${images.length} image${images.length > 1 ? "s" : ""}${text ? ` et ton message : « ${text} »` : ""}. Le service de chat n'est pas configuré ; cette réponse est simulée.`
          : `Réponse simulée : le service de chat n'est pas configuré.\n\nTu as dit : « ${text} ».`
      }
      const reply: ChatMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        at: new Date().toISOString(),
      }
      persist([...withUser, reply])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur chat")
      const reply: ChatMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Le backend n'a pas répondu. Réessaie dans un instant.",
        at: new Date().toISOString(),
      }
      persist([...withUser, reply])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-7rem)]">
      <PageHeader
        label="Agent"
        title="Chat"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              persist([])
              toast.success("Conversation effacée")
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Vider
          </Button>
        }
      />

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!timeline.length && (
            <div className="flex flex-col items-center justify-center text-center py-10 sm:py-16">
              <Octopus still className="w-16" label="" />
              <h2 className="mt-5 font-heading text-3xl sm:text-[2.5rem] leading-[1.1] text-foreground">
                Bonjour {user?.firstName || ""}
              </h2>
              <p className="mt-2 text-[17px] text-muted-foreground">Que veux-tu confier à OctoHandy ?</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl">
                {SUGGESTIONS.map((sg) => (
                  <button key={sg} type="button" onClick={() => setDraft(sg)} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground hover:bg-accent transition-colors">
                    {sg}
                  </button>
                ))}
              </div>
            </div>
          )}
          {timeline.map((item) =>
            item.agent ? (
              <AgentCard key={item.agent.id} m={item.agent} onDecide={(id, d) => void decide(id, d)} busy={deciding === item.agent.id} />
            ) : null
          )}
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted border border-border rounded-bl-md"
                )}
              >
                {m.images?.length ? (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {m.images.map((src) => (
                      <img key={src} src={src} alt="" className="w-20 h-20 rounded-lg object-cover" />
                    ))}
                  </div>
                ) : null}
                {renderContent(m.content)}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> L&apos;agent réfléchit…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border p-3 bg-card">
          <AnimatePresence>{attachments.length > 0 && <FanAttachments items={attachments} onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))} />}</AnimatePresence>
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="w-4 h-4" />
            </Button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"))
                if (!files.length) return
                e.preventDefault()
                const dt = new DataTransfer()
                files.forEach((f) => dt.items.add(f))
                void onFiles(dt.files)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="Écris un message…"
              className="flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            <Button onClick={() => void send()} disabled={busy || (!draft.trim() && !attachments.length)} className="shrink-0">
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

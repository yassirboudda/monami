"use client"

import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart } from "ai"
import { AnimatePresence, motion, MotionConfig } from "framer-motion"
import { ArrowUp, Check, ChevronRight, GraduationCap, ImagePlus, Play, ShieldAlert, Sparkles, Square, SquarePen } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { Octopus } from "@/components/oh/octopus"
import { EmbeddedPage, RAISED } from "@/components/chat-card"
import { ConnectMarketplaceModal } from "@/components/connect-marketplace"
import { TeachWorkflowModal } from "@/components/teach-workflow"
import { Badge, Button, cn, MarketplaceLogo } from "@/components/ui"
import { apiFetch } from "@/lib/api"
import { useAuth, useUser } from "@/lib/auth"
import { missionPrompt } from "@/lib/missions"
import { chatKey, store } from "@/lib/store"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import styles from "./chat.module.css"
import { EMBEDDED_PAGES, RunWorkflowCard } from "./tool-cards"

const VIDEO_URL = /https?:\/\/\S+\.mp4\b/g

// What a seller can start with, phrased as the action they want; the prompt is what gets sent.
const STARTERS = [
  { icon: GraduationCap, tint: "bg-butter", label: "Teach OctoHandy a task", prompt: "I want OctoHandy to learn a task" },
  { icon: Play, tint: "bg-sky", label: "Run one of my workflows", prompt: "Run one of my workflows" },
  { icon: Sparkles, tint: "bg-secondary", label: "What can I ask you?", prompt: "What can you do?" },
]

const noopSubscribe = () => () => {}

// One tap opens the photo picker; the AI Elements menu item stays open after picking and steals Enter.
function AddPhotoButton() {
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton aria-label="Add photos" title="Add photos" className="rounded-full" onClick={() => attachments.openFileDialog()}>
      <ImagePlus className="size-[18px]" />
    </PromptInputButton>
  )
}

// Phone photos weigh several MB: Vercel rejects request bodies over 4.5 MB and the model doesn't need full size.
async function shrinkPhoto(part: FileUIPart, maxSide = 1600): Promise<FileUIPart> {
  if (!part.mediaType.startsWith("image/")) return part
  try {
    const img = new Image()
    img.src = part.url
    await img.decode()
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return part
    ctx.fillStyle = "#fff" // JPEG has no transparency; white beats black behind transparent PNGs
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { ...part, mediaType: "image/jpeg", url: canvas.toDataURL("image/jpeg", 0.85) }
  } catch {
    return part // formats the browser can't decode (e.g. HEIC) are sent as-is
  }
}

type RecordingOutput = { saved: true; title: string; steps: string[] } | { saved: false }
type ConnectOutput = { connected: true; shop: string } | { connected: false }

const note = "text-[13px] text-muted-foreground"
const interrupted = <p className={note}>Session interrupted. Ask me again if you want to resume.</p>

// Messages posted by the inbox autopilot (A4000): approvals to decide, replies it sent.
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

function AgentCard({ m, onDecide, busy }: { m: AgentMessage; onDecide: (id: string, decision: "approved" | "rejected") => void; busy: boolean }) {
  const pending = m.kind === "approval" && m.status === "pending"
  return (
    <div className="flex justify-start">
      <div className={cn("max-w-[85%] sm:max-w-[85%] min-w-0 rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm space-y-2", pending ? "border-amber-300 bg-amber-50" : "bg-muted border-border")}>
        <div className="flex items-center gap-2 flex-wrap">
          {m.marketplace ? <MarketplaceLogo marketplace={m.marketplace} size={20} /> : <ShieldAlert className="w-4 h-4 text-amber-600" />}
          <span className="font-medium break-words min-w-0">{m.title}</span>
          {m.kind === "sent" && <Badge tone="green">Sent</Badge>}
          {m.kind === "approval" && m.status === "approved" && <Badge tone="green">Approved</Badge>}
          {m.kind === "approval" && m.status === "rejected" && <Badge tone="red">Declined</Badge>}
          {pending && <Badge tone="amber">Your call</Badge>}
        </div>
        {m.body && <p className="whitespace-pre-wrap text-foreground/90">{m.body}</p>}
        {pending && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" loading={busy} onClick={() => onDecide(m.id, "approved")}>
              <Check className="w-3.5 h-3.5" /> Approve and send
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(m.id, "rejected")}>
              Decline
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
  // localStorage only exists after hydration; reading it during SSR would mismatch the markup.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const storeUser = hydrated ? userId ?? "" : ""

  const request = useCallback(
    async <R,>(path: string, options: { method?: string; body?: unknown } = {}) => {
      const token = await getToken()
      if (!token) throw new Error("OctoHandy session not found")
      return apiFetch<R>(path, { ...options, token })
    },
    [getToken]
  )

  const agentFeed = useWorkspaceResource<{ messages: AgentMessage[] }>("/v1/agent/messages?limit=40")
  const [deciding, setDeciding] = useState<string | null>(null)
  useEffect(() => {
    const id = setInterval(() => void agentFeed.mutate(), 15000)
    return () => clearInterval(id)
  }, [agentFeed])
  const decide = async (id: string, decision: "approved" | "rejected") => {
    setDeciding(id)
    try {
      await agentFeed.request(`/v1/agent/messages/${id}/decide`, { method: "POST", body: { decision } })
      await agentFeed.mutate()
      toast.success(decision === "approved" ? "The agent is sending the reply on the desktop." : "Declined — nothing will be sent.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your decision")
    } finally {
      setDeciding(null)
    }
  }
  const agentMessages = [...(agentFeed.data?.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))

  // The default transport posts to /api/chat with the OctoHandy session cookie.
  const { messages, sendMessage, setMessages, addToolOutput, status, error, stop } = useChat({
    // A new id (user/org switch) makes useChat start a fresh Chat seeded with that workspace's history.
    id: chatKey(storeUser, activeOrgId),
    messages: store.getChat(storeUser, activeOrgId),
    // When the seller finishes the recording card, hand the result back to the assistant.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ messages }) => store.setChat(messages, storeUser, activeOrgId),
    onError: (e) => toast.error(e.message || "Erreur chat"),
  })
  const busy = status === "submitted" || status === "streaming"

  // Onboarding links to ?mission=…&mp=…: only those fixed prompts are sent (never free text from a link), once.
  const sentInitial = useRef(false)
  useEffect(() => {
    if (!storeUser || sentInitial.current) return
    const q = missionPrompt(new URLSearchParams(window.location.search))
    if (!q) return
    sentInitial.current = true
    window.history.replaceState(null, "", window.location.pathname)
    void sendMessage({ text: q })
  }, [storeUser, sendMessage])

  // Cards call their success callback and then onClose; only the first outcome is sent to the assistant.
  const answered = useRef(new Set<string>())
  const finishTool = (tool: string, toolCallId: string, output: unknown) => {
    if (answered.current.has(toolCallId)) return
    answered.current.add(toolCallId)
    void addToolOutput({ tool, toolCallId, output })
  }

  // Interactive cards restored from history must not restart: a run card would launch a new run on every reload.
  const restored = useMemo(
    () => new Set(store.getChat(storeUser, activeOrgId).flatMap((m) => m.parts.flatMap((p) => ("toolCallId" in p ? [p.toolCallId] : [])))),
    [storeUser, activeOrgId]
  )

  const submit = async (message: PromptInputMessage) => {
    if (busy || (!message.text.trim() && !message.files.length)) return
    const files = await Promise.all(message.files.map((f) => shrinkPhoto(f)))
    void sendMessage({ text: message.text.trim() || "Here is a photo", files })
  }

  const last = messages.at(-1)
  const waiting = busy && !(last?.role === "assistant" && last.parts.some((p) => p.type !== "step-start"))

  const newConversation = () => {
    stop()
    setMessages([])
    store.setChat([], storeUser, activeOrgId)
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-[calc(100dvh-8rem)] flex-col lg:h-[calc(100dvh-7rem)]">
        {messages.length > 0 && (
          <button
            type="button"
            onClick={newConversation}
            aria-label="New conversation"
            title="New conversation"
            className="absolute right-0 top-0 z-10 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <SquarePen className="size-[18px]" />
          </button>
        )}

        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="mx-auto w-full max-w-[44rem] gap-7 px-1 pb-44 pt-12">
            {!messages.length && !agentMessages.length && (
              <div className="flex min-h-[calc(100dvh-22rem)] flex-col items-center justify-center text-center">
                <Octopus still className="size-16" />
                <h1 className="mt-5 font-heading text-[2.5rem] leading-[1.1] text-foreground">
                  {user?.firstName ? `Hello ${user.firstName}.` : "Hello."}
                </h1>
                <p className="mt-2 text-[17px] text-muted-foreground">What would you like OctoHandy to handle?</p>
                <ul className={cn("mt-9 w-full max-w-[26rem] overflow-hidden rounded-2xl bg-card text-left", RAISED)}>
                  {STARTERS.map(({ icon: Icon, tint, label, prompt }) => (
                    <li key={label} className="[&+li>button]:before:absolute [&+li>button]:before:left-[3.75rem] [&+li>button]:before:right-0 [&+li>button]:before:top-0 [&+li>button]:before:h-px [&+li>button]:before:bg-border">
                      <button
                        type="button"
                        onClick={() => void sendMessage({ text: prompt })}
                        className="relative flex w-full items-center gap-3.5 px-4 py-3 text-left text-[15px] text-foreground transition-colors hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-none"
                      >
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-[8px] text-foreground", tint)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="flex-1">{label}</span>
                        <ChevronRight className="size-4 text-muted-foreground/70" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  style={{ transformOrigin: m.role === "user" ? "bottom right" : "bottom left" }}
                >
                  <Message from={m.role} className="max-w-full">
                    <MessageContent
                      className={cn(
                        m.role === "user"
                          ? "max-w-[78%] group-[.is-user]:rounded-[20px] group-[.is-user]:bg-primary group-[.is-user]:px-4 group-[.is-user]:py-2.5 group-[.is-user]:text-[15px] group-[.is-user]:leading-[1.4] group-[.is-user]:text-primary-foreground"
                          : "w-full text-[15.5px] leading-[1.6]"
                      )}
                    >
                      {m.parts.map((part, i) => {
                        const key = `${m.id}-${i}`
                        switch (part.type) {
                          case "text": {
                            const videos = Array.from(new Set(part.text.match(VIDEO_URL) ?? []))
                            return (
                              <div key={key} className="max-w-[65ch] space-y-3">
                                <MessageResponse>{part.text.replace(VIDEO_URL, "").trim()}</MessageResponse>
                                {videos.map((src) => (
                                  <video key={src} src={src} controls preload="metadata" className={cn("w-full max-w-[34rem] rounded-2xl bg-black", RAISED)} />
                                ))}
                              </div>
                            )
                          }
                          case "file":
                            return part.mediaType.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={key} src={part.url} alt="" className="size-28 rounded-[14px] object-cover" />
                            ) : null
                          case "tool-showRecordingSession": {
                            if (part.state === "input-streaming") return null
                            if (part.state === "output-available") {
                              const out = part.output as RecordingOutput
                              return (
                                <p key={key} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                  {out.saved && <Check className="size-3.5 text-success" />}
                                  {out.saved ? `Workflow “${out.title}” saved` : "Recording cancelled"}
                                </p>
                              )
                            }
                            if (part.state !== "input-available") return null
                            if (restored.has(part.toolCallId)) return <div key={key}>{interrupted}</div>
                            return (
                              <div key={key} className="w-full">
                                <TeachWorkflowModal
                                  inline
                                  open
                                  request={request}
                                  marketplace={(part.input as { marketplace?: string }).marketplace}
                                  onSaved={(w) => finishTool("showRecordingSession", part.toolCallId, { saved: true, ...w })}
                                  onClose={() => finishTool("showRecordingSession", part.toolCallId, { saved: false })}
                                />
                              </div>
                            )
                          }
                          case "tool-runWorkflow": {
                            if (part.state === "output-available") return <p key={key} className={note}>Workflow run finished</p>
                            if (part.state !== "input-available") return null
                            if (restored.has(part.toolCallId)) return <div key={key}>{interrupted}</div>
                            return (
                              <div key={key} className="w-full">
                                <RunWorkflowCard
                                  workflowId={(part.input as { workflowId: string }).workflowId}
                                  onClose={() => finishTool("runWorkflow", part.toolCallId, { closed: true })}
                                />
                              </div>
                            )
                          }
                          case "tool-connectMarketplace": {
                            if (part.state === "output-available") {
                              const out = part.output as ConnectOutput
                              return (
                                <p key={key} className={cn(note, "inline-flex items-center gap-1.5")}>
                                  {out.connected && <Check className="size-3.5 text-success" />}
                                  {out.connected ? `${out.shop} connected` : "Connection cancelled"}
                                </p>
                              )
                            }
                            if (part.state !== "input-available") return null
                            if (restored.has(part.toolCallId)) return <div key={key}>{interrupted}</div>
                            return (
                              <div key={key} className="w-full">
                                <ConnectMarketplaceModal
                                  inline
                                  open
                                  request={request}
                                  initialMarketplace={(part.input as { marketplace?: string }).marketplace?.toLowerCase() ?? null}
                                  onConnected={(shop) => finishTool("connectMarketplace", part.toolCallId, { connected: true, shop: shop.displayName })}
                                  onClose={() => finishTool("connectMarketplace", part.toolCallId, { connected: false })}
                                />
                              </div>
                            )
                          }
                          case "tool-askDesktopAgent":
                            return (
                              <Tool key={key} className={cn("mb-0 max-w-[34rem] rounded-2xl border-0 bg-card", RAISED)}>
                                <ToolHeader title="OctoHandy desktop" type={part.type} state={part.state} />
                                <ToolContent>
                                  <ToolInput input={part.input} />
                                  <ToolOutput output={part.output} errorText={part.errorText} />
                                </ToolContent>
                              </Tool>
                            )
                          default: {
                            const embed = EMBEDDED_PAGES[part.type]
                            if (!embed || !("state" in part)) return null
                            if (part.state === "output-error") return <p key={key} className={note}>Could not display {embed.label}: {part.errorText}</p>
                            if (part.state !== "output-available") return <p key={key} className={cn("text-[13px]", styles.shimmer)}>J&apos;ouvre {embed.label}…</p>
                            return (
                              <EmbeddedPage key={key}>
                                <embed.Page />
                              </EmbeddedPage>
                            )
                          }
                        }
                      })}
                    </MessageContent>
                  </Message>
                </motion.div>
              ))}
            </AnimatePresence>

            {agentMessages.length > 0 && (
              <div className="space-y-3">
                {agentMessages.map((a) => (
                  <AgentCard key={a.id} m={a} onDecide={(id, d) => void decide(id, d)} busy={deciding === a.id} />
                ))}
              </div>
            )}

            {waiting && (
              <p className={cn("text-[15px]", styles.shimmer)} role="status">
                OctoHandy is thinking…
              </p>
            )}
            {error && !busy && (
              <p className="text-[15px] text-muted-foreground" role="alert">
                OctoHandy could not reply. Send your message again to retry.
              </p>
            )}
          </ConversationContent>
          <ConversationScrollButton className="bottom-36 bg-card/90 backdrop-blur" />
        </Conversation>

        {/* Content scrolls under the composer; the fade keeps the last line readable behind the glass. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent pb-1 pt-12">
          <div className="pointer-events-auto mx-auto w-full max-w-[44rem]">
            <PromptInput
              onSubmit={submit}
              accept="image/*"
              multiple
              maxFiles={4}
              className={cn(
                "rounded-[26px] bg-card/75 ring-1 ring-border backdrop-blur-2xl backdrop-saturate-150 transition-shadow focus-within:ring-2 focus-within:ring-foreground/15",
                RAISED,
                "[&_[data-slot=input-group]]:rounded-[26px] [&_[data-slot=input-group]]:!border-0 [&_[data-slot=input-group]]:bg-transparent [&_[data-slot=input-group]]:shadow-none [&_[data-slot=input-group]]:!ring-0"
              )}
            >
              <PromptInputAttachments>{(file) => <PromptInputAttachment data={file} />}</PromptInputAttachments>
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="Message OctoHandy…"
                  className="min-h-12 px-5 pt-4 text-[15px] placeholder:text-muted-foreground/80"
                />
              </PromptInputBody>
              <PromptInputFooter className="px-3 pb-3">
                <PromptInputTools>
                  <AddPhotoButton />
                </PromptInputTools>
                {/* While streaming the button becomes Stop: Hermes turns can take minutes. */}
                <PromptInputSubmit
                  status={status}
                  disabled={status === "submitted"}
                  aria-label={status === "streaming" ? "Stop" : "Send"}
                  className="size-8 rounded-full"
                  onClick={(e) => {
                    if (status !== "streaming") return
                    e.preventDefault()
                    void stop()
                  }}
                >
                  {status === "streaming" ? <Square className="size-3 fill-current" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}

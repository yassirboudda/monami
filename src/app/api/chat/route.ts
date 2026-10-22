import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai"
import { SESSION_COOKIE, tokenLooksValid } from "@/lib/session"

export const maxDuration = 300

const API_UPSTREAM = (process.env.API_UPSTREAM_URL || "http://178.104.100.35").replace(/\/$/, "")

const CONNECTABLE_MARKETPLACES = [
  { id: "vinted", name: "Vinted" },
  { id: "ebay", name: "eBay" },
  { id: "etsy", name: "Etsy" },
  { id: "depop", name: "Depop" },
  { id: "vestiaire", name: "Vestiaire Collective" },
  { id: "wallapop", name: "Wallapop" },
  { id: "facebook_marketplace", name: "Facebook Marketplace" },
] as const

type DisplayTool = "showWorkflows" | "showShops" | "showStock" | "showDesktop" | "showTeam"

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’‘]/g, "'").trim()
}

function displayToolFor(text: string): { tool: DisplayTool; reply: string } | undefined {
  const normalized = normalizeText(text)
  if (normalized === "lance un de mes workflows" || normalized === "run one of my workflows") {
    return { tool: "showWorkflows", reply: "Here are your workflows: enable them, run them or teach a new one." }
  }

  const request = normalized.match(/\b(?:montre|affiche|liste|voir|vois|show|display|list|open)\b[\s\S]*/)?.[0]
  if (!request) return
  if (/\bworkflows?\b/.test(request)) {
    return { tool: "showWorkflows", reply: "Here are your workflows: enable them, run them or teach a new one." }
  }
  if (/\b(?:boutiques?|shops?)\b/.test(request)) return { tool: "showShops", reply: "Here are your shops." }
  if (/\b(?:stock|inventory)\b/.test(request)) return { tool: "showStock", reply: "Here is your stock." }
  if (/\b(?:bureau|desktop)\b/.test(request)) return { tool: "showDesktop", reply: "Here is the OctoHandy desktop." }
  if (/\b(?:equipe|team)\b/.test(request)) return { tool: "showTeam", reply: "Here is your team." }
}

function recordingInputFor(text: string) {
  const normalized = normalizeText(text)
  if (
    normalized !== "je veux qu'octohandy apprenne une tache" &&
    !normalized.startsWith("je veux apprendre a octohandy") &&
    normalized !== "i want octohandy to learn a task" &&
    !normalized.startsWith("i want to teach octohandy") &&
    !normalized.startsWith("teach octohandy")
  ) {
    return undefined
  }
  const normalizedText = normalized
  const marketplace = CONNECTABLE_MARKETPLACES.find(({ name }) => normalizedText.includes(normalizeText(name)))?.id
  return { task: text, ...(marketplace ? { marketplace } : {}) }
}

function writeText(writer: UIMessageStreamWriter<UIMessage>, text: string) {
  // Own step: useChat auto-resends while the last step holds completed tool calls, so text must follow in a new step.
  const id = randomUUID()
  writer.write({ type: "start-step" })
  writer.write({ type: "text-start", id })
  writer.write({ type: "text-delta", id, delta: text })
  writer.write({ type: "text-end", id })
  writer.write({ type: "finish-step" })
}

function noReply(status: number) {
  return `The OctoHandy desktop did not answer (HTTP ${status}). Try again in a moment.`
}

export async function POST(req: Request) {
  // The chat page sends a fresh Clerk JWT as Bearer; the short-lived __session cookie is the fallback.
  const auth = req.headers.get("authorization") || ""
  const jar = await cookies()
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : jar.get(SESSION_COOKIE)?.value
  if (!tokenLooksValid(token)) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json()) as { messages?: UIMessage[] }
  const messages = Array.isArray(body.messages) ? body.messages : []
  const last = messages.at(-1)
  let hermesMessage: string | undefined
  let shortcut: { tool: DisplayTool; reply: string } | undefined
  let recordingInput: ReturnType<typeof recordingInputFor> = undefined
  let images: string[] = []

  if (last?.role === "assistant") {
    const result = [...last.parts].reverse().find(
      (part) =>
        part.type.startsWith("tool-") &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part
    )
    if (result && "output" in result) {
      const toolName = result.type.slice("tool-".length)
      const output = JSON.stringify(result.output) ?? "null"
      hermesMessage = `Result of the chat step “${toolName}”: ${output.slice(0, 2000)}. Summarise for the seller, in one or two sentences and in their language, what happened and what they can do next.`
    }
  } else if (last?.role === "user") {
    const text = last.parts.reduce((joined, part) => (part.type === "text" ? joined + part.text : joined), "")
    const task = recordingInputFor(text)
    if (task) {
      recordingInput = task
    } else {
      shortcut = displayToolFor(text)
      if (!shortcut) {
        hermesMessage = text.trim() || "Here is a photo"
        images = last.parts
          .flatMap((part) => (part.type === "file" && part.mediaType.startsWith("image/") ? [part.url] : []))
          .slice(0, 4)
      }
    }
  }

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      if (recordingInput) {
        writer.write({ type: "start-step" })
        writer.write({
          type: "tool-input-available",
          toolCallId: randomUUID(),
          toolName: "showRecordingSession",
          input: recordingInput,
        })
        writer.write({ type: "finish-step" })
        return
      }
      if (shortcut) {
        const toolCallId = randomUUID()
        writer.write({ type: "start-step" })
        writer.write({ type: "tool-input-available", toolCallId, toolName: shortcut.tool, input: {} })
        writer.write({ type: "tool-output-available", toolCallId, output: { shown: true } })
        writer.write({ type: "finish-step" })
        writeText(writer, shortcut.reply)
        return
      }
      if (hermesMessage === undefined) return

      let content: string
      try {
        const response = await fetch(`${API_UPSTREAM}/v1/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: hermesMessage, images }),
        })
        if (!response.ok) {
          content = noReply(response.status)
        } else {
          const data = (await response.json()) as { content?: unknown }
          content = typeof data.content === "string" ? data.content : noReply(502)
        }
      } catch {
        content = noReply(502)
      }
      writeText(writer, content)
    },
  })

  return createUIMessageStreamResponse({ stream })
}

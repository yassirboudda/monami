"use client"

import { useState } from "react"
import { ClipboardCopy, ClipboardPaste, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button, Textarea } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

export function DesktopClipboard({ compact = false }: { compact?: boolean }) {
  const { request, mutate } = useWorkspaceResource<{ text: string }>("/v1/desktop/clipboard")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState<"send" | "read" | null>(null)

  const send = async () => {
    if (!text.trim()) return
    setBusy("send")
    try {
      await request("/v1/desktop/clipboard", { method: "POST", body: { text } })
      toast.success("Copied to the desktop: press Ctrl+V in the remote Chrome.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Desktop unavailable")
    } finally {
      setBusy(null)
    }
  }

  const read = async () => {
    setBusy("read")
    try {
      const data = await mutate()
      setText(data?.text || "")
      if (data?.text) {
        await navigator.clipboard.writeText(data.text).catch(() => null)
        toast.success("Desktop clipboard fetched (and copied to your PC).")
      } else {
        toast.message("The desktop clipboard is empty.")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Desktop unavailable")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <p className="text-xs text-muted-foreground mb-1.5">
        PC ↔ desktop clipboard: Ctrl+V directly in the desktop now pastes what you copied on your PC (allow clipboard access if Chrome asks). Otherwise use “Paste from my PC”, or paste a text here then “Send to desktop”; “Fetch from desktop” brings back what you copied in the desktop.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 3} placeholder="Text to transfer…" className="flex-1" />
        <div className="flex flex-wrap sm:flex-col gap-2 sm:shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button type="button" variant="secondary" size="sm" onClick={() => void send()} disabled={busy !== null || !text.trim()}>
            {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />} Send to desktop
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText()
                if (!t) return toast.message("Your PC clipboard is empty.")
                setText(t)
                await request("/v1/desktop/clipboard", { method: "POST", body: { text: t } })
                toast.success("PC clipboard sent to the desktop: press Ctrl+V there.")
              } catch {
                toast.error("Allow clipboard access in your browser, or paste the text in the field.")
              }
            }}
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste from my PC
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void read()} disabled={busy !== null}>
            {busy === "read" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCopy className="w-3.5 h-3.5" />} Fetch from desktop
          </Button>
        </div>
      </div>
    </div>
  )
}

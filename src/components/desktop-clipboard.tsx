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
      toast.success("Copié dans le bureau : fais Ctrl+V dans le Chrome distant.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bureau indisponible")
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
        toast.success("Presse-papiers du bureau récupéré (et copié sur ton PC).")
      } else {
        toast.message("Le presse-papiers du bureau est vide.")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bureau indisponible")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <p className="text-xs text-muted-foreground mb-1.5">
        Presse-papiers PC ↔ bureau : Ctrl+V directement dans le bureau colle maintenant ce que tu as copié sur ton PC (autorise le presse-papiers si Chrome le demande). Sinon : « Coller depuis mon PC », ou colle un texte ici puis « Envoyer au bureau » ; « Récupérer » ramène ce que tu as copié dans le bureau.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 3} placeholder="Texte à transférer…" className="flex-1" />
        <div className="flex sm:flex-col gap-2 shrink-0">
          <Button type="button" variant="secondary" size="sm" onClick={() => void send()} disabled={busy !== null || !text.trim()}>
            {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />} Envoyer au bureau
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText()
                if (!t) return toast.message("Ton presse-papiers PC est vide.")
                setText(t)
                await request("/v1/desktop/clipboard", { method: "POST", body: { text: t } })
                toast.success("Presse-papiers PC envoyé au bureau : fais Ctrl+V là-bas.")
              } catch {
                toast.error("Autorise l'accès au presse-papiers dans ton navigateur, ou colle le texte dans le champ.")
              }
            }}
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> Coller depuis mon PC
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void read()} disabled={busy !== null}>
            {busy === "read" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCopy className="w-3.5 h-3.5" />} Récupérer du bureau
          </Button>
        </div>
      </div>
    </div>
  )
}

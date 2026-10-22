import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ChevronUp, ImagePlus, X } from "lucide-react";
import { copy } from "@/lib/copy";
import { Mascot } from "./Mascot";
import { cn } from "@/lib/utils";

export type Msg = { id: number; role: "user" | "agent"; text: string; photo?: string | undefined };

export function ChatDock({ messages, typing, onSend }: { messages: Msg[]; typing: boolean; onSend: (text: string, photo?: string) => void }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = open ? messages : messages.slice(-3);

  const submit = (t = text) => {
    if (!t.trim() && !photo) return;
    onSend(t.trim() || "Je veux vendre ça", photo);
    setText("");
    setPhoto(undefined);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:pb-5">
      {messages.length > 0 && (
        <div className="mb-2">
          {messages.length > 3 && (
            <button onClick={() => setOpen(!open)} className="mx-auto mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronUp className={cn("size-3 transition", open && "rotate-180")} />
              {open ? copy.showLess : copy.showMore}
            </button>
          )}
          <div className={cn("space-y-1.5 overflow-y-auto", open ? "max-h-64" : "max-h-36")}>
            <AnimatePresence initial={false}>
              {shown.map((m) => (
                <motion.div key={m.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-end gap-2", m.role === "user" && "justify-end")}>
                  {m.role === "agent" && <Mascot className="mb-1 w-5 shrink-0 text-ink" />}
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-1.5 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card shadow-sm")}>
                    {m.photo && <img src={m.photo} alt="" className="mb-1 h-14 rounded-lg object-cover" />}
                    {m.text}
                  </div>
                </motion.div>
              ))}
              {typing && (
                <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mascot float className="w-5 text-primary" />
                  {copy.thinking}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {copy.chips.map((c) => (
          <button key={c} onClick={() => submit(c)} className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
            {c}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="surface flex items-center gap-2 rounded-full p-1.5 pl-2"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") setPhoto(reader.result); }; reader.readAsDataURL(f); }
            e.target.value = "";
          }}
        />
        <button type="button" aria-label={copy.upload} onClick={() => fileRef.current?.click()} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary">
          <ImagePlus className="size-5" />
        </button>
        {photo && (
          <div className="relative shrink-0">
            <img src={photo} alt="" className="size-9 rounded-lg object-cover" />
            <button type="button" onClick={() => setPhoto(undefined)} className="absolute -right-1 -top-1 rounded-full bg-foreground p-0.5 text-background">
              <X className="size-2.5" />
            </button>
          </div>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <button type="submit" aria-label="Envoyer" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground shadow-md transition hover:scale-105 disabled:opacity-40" disabled={!text.trim() && !photo}>
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}

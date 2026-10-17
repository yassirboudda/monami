"use client"

export type Shop = {
  id: string
  marketplace: string
  displayName: string
  status: "connected" | "expired"
  listingCount: number
}

export type Listing = {
  id: string
  shopId: string
  marketplace: "vinted" | "leboncoin"
  title: string
  price: number
  status: "active" | "sold" | "reserved"
  imageUrl?: string
  url?: string
  views?: number
  favorites?: number
  updatedAt: string
  createdBy?: string
  creatorName?: string | null
}

export type StockItem = {
  id: string
  title: string
  sku?: string
  qty: number
  price?: number
  marketplace?: string
  ownerLabel: string
  createdBy?: string
  creatorName?: string | null
}

export type ChatMsg = {
  id: string
  role: "user" | "assistant"
  content: string
  images?: string[]
  at: string
}

const EMPTY_CHAT: ChatMsg[] = []
const chatCache = new Map<string, ChatMsg[]>()

function chatKey(userId: string, orgId: string | null) {
  return `octohandy.chat.${userId}.${orgId ?? "personal"}`
}

export const store = {
  getChat(userId: string, orgId: string | null): ChatMsg[] {
    if (!userId || typeof window === "undefined") return EMPTY_CHAT
    const key = chatKey(userId, orgId)
    const cached = chatCache.get(key)
    if (cached) return cached
    try {
      const messages = JSON.parse(localStorage.getItem(key) || "[]") as ChatMsg[]
      chatCache.set(key, messages)
      return messages
    } catch {
      chatCache.set(key, EMPTY_CHAT)
      return EMPTY_CHAT
    }
  },
  setChat(msgs: ChatMsg[], userId: string, orgId: string | null) {
    if (typeof window === "undefined" || !userId) return
    const key = chatKey(userId, orgId)
    localStorage.setItem(key, JSON.stringify(msgs))
    chatCache.set(key, msgs)
    window.dispatchEvent(new CustomEvent("stockflow:chat", { detail: { key } }))
  },
  subscribeChat(userId: string, orgId: string | null, onChange: () => void) {
    if (typeof window === "undefined" || !userId) return () => {}
    const key = chatKey(userId, orgId)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return
      chatCache.delete(key)
      onChange()
    }
    const onChat = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail?.key === key) onChange()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("stockflow:chat", onChat)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("stockflow:chat", onChat)
    }
  },
}

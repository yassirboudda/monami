import { z } from "zod";
import type { Profile } from "@/components/monami/Onboarding";

export const DEMO_KEY = "monami-demo-profile-v1";
const nicheSchema = z.object({ id: z.string(), name: z.string(), emoji: z.string(), study: z.object({ demandScore: z.number(), searches: z.number(), sales: z.number(), sellThroughDays: z.number(), median: z.number(), trend: z.number(), bestPlatform: z.string(), note: z.string() }) });
const profileSchema = z.object({ hasAccount: z.boolean(), niche: nicheSchema, intent: z.enum(["buy", "sell"]), item: z.string().min(1), photos: z.array(z.string()) });
const productSchema = z.object({ id: z.string(), name: z.string(), image: z.string(), family: z.string(), market: z.string(), listedPrice: z.number(), marketPrice: z.number(), status: z.enum(["listed", "messages", "sold"]) });
const savedSchema = z.object({ profile: profileSchema, items: z.array(productSchema), savedOffers: z.array(productSchema), favorites: z.array(z.string()) });
export function restoreDemo(raw: string | null) {
  if (!raw) return undefined;
  try { const result = savedSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : undefined; } catch { return undefined; }
}
export function chatRequest(text: string): { intent: Profile["intent"] | undefined; item: string } {
  const intent = /acheter|cherche|buy|comprar/i.test(text) ? "buy" : /vendre|ajouter|sell|vender/i.test(text) ? "sell" : undefined;
  const item = text.replace(/^(?:je\s+)?(?:veux\s+|souhaite\s+)?(?:acheter|vendre|cherche|ajouter|buy|sell|comprar|vender)\s*(?:un\s+|une\s+|des\s+)?/i, "").trim();
  return { intent, item };
}
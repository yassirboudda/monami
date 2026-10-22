// Mock data — shaped so it can be swapped for a real API later.
export type Range = "1M" | "6M" | "1Y";
export type Status = "listed" | "sold" | "messages";
export type Point = { t: string; value: number; min?: number; max?: number; volume?: number };

export type Product = {
  id: string;
  name: string;
  image: string;
  family: string;
  market: string;
  listedPrice: number;
  marketPrice: number;
  status: Status;
};

export const marketplaces: Record<string, { name: string; color: string }> = {
  ebay: { name: "eBay", color: "oklch(0.6 0.2 25)" },
  vinted: { name: "Vinted", color: "oklch(0.6 0.1 195)" },
  leboncoin: { name: "Leboncoin", color: "oklch(0.68 0.18 45)" },
  backmarket: { name: "Back Market", color: "oklch(0.35 0.03 265)" },
  stockx: { name: "StockX", color: "oklch(0.55 0.15 150)" },
  cardmarket: { name: "Cardmarket", color: "oklch(0.5 0.15 262)" },
};

export const families: Record<string, { name: string; emoji: string }> = {
  cards: { name: "Cartes à collectionner", emoji: "🃏" },
  sneakers: { name: "Sneakers", emoji: "👟" },
  phones: { name: "Smartphones & objets connectés", emoji: "📱" },
  clothing: { name: "Vêtements", emoji: "🧥" },
  electronics: { name: "Électronique", emoji: "🎧" },
};

const img = (q: string) => `https://images.unsplash.com/${q}?w=300&h=300&fit=crop&auto=format`;

export const products: Product[] = [
  { id: "p1", name: "Dracaufeu Holo 1ère éd.", image: img("photo-1613771404721-1f92d799e49f"), family: "cards", market: "cardmarket", listedPrice: 420, marketPrice: 395, status: "listed" },
  { id: "p2", name: "Pikachu Illustrator (repro)", image: img("photo-1647892591717-f2e2a2f6b2d1"), family: "cards", market: "ebay", listedPrice: 38, marketPrice: 45, status: "messages" },
  { id: "p3", name: "Display Écarlate & Violet", image: img("photo-1606503153255-59d8b8b82176"), family: "cards", market: "cardmarket", listedPrice: 165, marketPrice: 158, status: "sold" },
  { id: "p4", name: "Mewtwo GX Rainbow", image: img("photo-1627856013091-fed6e4e30025"), family: "cards", market: "vinted", listedPrice: 52, marketPrice: 44, status: "listed" },
  { id: "p5", name: "Nike Dunk Low Panda 42", image: img("photo-1600269452121-4f2416e55c28"), family: "sneakers", market: "stockx", listedPrice: 135, marketPrice: 118, status: "listed" },
  { id: "p6", name: "Jordan 1 Mid Chicago 43", image: img("photo-1597045566677-8cf032ed6634"), family: "sneakers", market: "vinted", listedPrice: 160, marketPrice: 172, status: "messages" },
  { id: "p7", name: "New Balance 550 White 41", image: img("photo-1539185441755-769473a23570"), family: "sneakers", market: "leboncoin", listedPrice: 95, marketPrice: 90, status: "sold" },
  { id: "p8", name: "iPhone 13 128 Go — bon état", image: img("photo-1632661674596-df8be070a5c5"), family: "phones", market: "backmarket", listedPrice: 389, marketPrice: 362, status: "listed" },
  { id: "p9", name: "Apple Watch SE 44 mm", image: img("photo-1546868871-7041f2a55e12"), family: "phones", market: "leboncoin", listedPrice: 140, marketPrice: 148, status: "messages" },
  { id: "p10", name: "Veste Carhartt Detroit M", image: img("photo-1551028719-00167b16eac5"), family: "clothing", market: "vinted", listedPrice: 89, marketPrice: 76, status: "listed" },
  { id: "p11", name: "Doudoune The North Face L", image: img("photo-1544923246-77307dd654cb"), family: "clothing", market: "vinted", listedPrice: 120, marketPrice: 128, status: "sold" },
  { id: "p12", name: "AirPods Pro 2", image: img("photo-1600294037681-c80b4cb5b434"), family: "electronics", market: "ebay", listedPrice: 165, marketPrice: 158, status: "listed" },
  { id: "p13", name: "Nintendo Switch OLED", image: img("photo-1578303512597-81e6cc155b3e"), family: "electronics", market: "leboncoin", listedPrice: 250, marketPrice: 262, status: "listed" },
];

// Deterministic pseudo-random so SSR and client agree.
function rng(seed: number) {
  let s = seed % 2147483647;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const hash = (str: string) => [...str].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;

const RANGE_POINTS: Record<Range, { n: number; label: (i: number, n: number) => string }> = {
  "1M": { n: 30, label: (i, n) => `J-${n - 1 - i}` },
  "6M": { n: 26, label: (i, n) => `S-${n - 1 - i}` },
  "1Y": { n: 12, label: (i) => ["Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct"][i]! },
};

export function series(key: string, base: number, range: Range, drift = 0.1): Point[] {
  const r = rng(hash(key + range) + 1);
  const { n, label } = RANGE_POINTS[range];
  const vol = range === "1M" ? 0.03 : range === "6M" ? 0.06 : 0.1;
  let v = base * (1 - drift);
  return Array.from({ length: n }, (_, i) => {
    v = v + (base - v) * 0.12 + (r() - 0.5) * base * vol;
    const spread = base * (0.12 + r() * 0.08);
    return {
      t: label(i, n),
      value: Math.round(v),
      min: Math.round(v - spread),
      max: Math.round(v + spread * 1.2),
      volume: Math.round(5 + r() * 25),
    };
  });
}

export type BoxGroup = { id: string; label: string; icon: string; accent?: string | undefined; items: Product[]; value: number; trend: number };

export function groupBoxes(list: Product[], mode: "family" | "market"): BoxGroup[] {
  const keys = mode === "family" ? Object.keys(families) : Object.keys(marketplaces);
  return keys
    .map((k) => {
      const items = list.filter((p) => (mode === "family" ? p.family : p.market) === k);
      const r = rng(hash(k) + 3);
      return {
        id: k,
        label: mode === "family" ? families[k]!.name : marketplaces[k]!.name,
        icon: mode === "family" ? families[k]!.emoji : marketplaces[k]!.name[0]!,
        accent: mode === "market" ? marketplaces[k]!.color : undefined,
        items,
        value: items.reduce((a, p) => a + p.marketPrice, 0),
        trend: Math.round((r() - 0.35) * 240) / 10,
      };
    })
    .filter((b) => b.items.length > 0);
}

export function priceHint(p: Product) {
  const diff = Math.round(((p.listedPrice - p.marketPrice) / p.marketPrice) * 100);
  if (diff > 8) return { tone: "warn" as const, text: `Ton prix est ${diff}% au-dessus de la médiane du marché, pense à baisser à ${Math.round(p.marketPrice * 1.05)} €.` };
  if (diff < -8) return { tone: "good" as const, text: `Ton prix est ${Math.abs(diff)}% sous le marché : tu peux monter à ${Math.round(p.marketPrice * 0.98)} €.` };
  return { tone: "ok" as const, text: "Ton prix est aligné avec le marché." };
}

// Analysis for a newly added product
export const analysis = {
  name: "Nike Air Max 90 — taille 42",
  image: img("photo-1542291026-7eec264c27ff"),
  userPrice: 52,
  demandScore: 82,
  searches: 4820,
  sales: 312,
  sellThroughDays: 6,
  range: [45, 50] as [number, number],
  bounds: [28, 78] as [number, number],
  conditions: [
    { label: "Neuf", price: 74 },
    { label: "Très bon état", price: 52 },
    { label: "Bon état", price: 41 },
    { label: "Avec défauts", price: 29 },
  ],
  supply: { count: 1284, buckets: [
    { b: "20-30", n: 64 }, { b: "30-40", n: 182 }, { b: "40-50", n: 341 }, { b: "50-60", n: 298 },
    { b: "60-70", n: 205 }, { b: "70-80", n: 121 }, { b: "80+", n: 73 },
  ] },
  platforms: [
    { id: "vinted", count: 612, median: 46, speed: "5 j" },
    { id: "ebay", count: 304, median: 51, speed: "3 j" },
    { id: "leboncoin", count: 241, median: 44, speed: "8 j" },
    { id: "stockx", count: 127, median: 58, speed: "4 j" },
  ],
  family: "sneakers",
  market: "ebay",
};

export const alerts = [
  { id: "a1", kind: "deal" as const, item: "Jordan 4 Bred 43 — Leboncoin", price: 140, market: 225, ago: "il y a 2 min" },
  { id: "a2", kind: "scam" as const, item: "PS5 neuve scellée — Vinted", price: 180, market: 449, ago: "il y a 9 min" },
  { id: "a3", kind: "deal" as const, item: "Lot 40 cartes Pokémon EX — eBay", price: 35, market: 70, ago: "il y a 21 min" },
];

export const agentReplies = {
  bestSeller: "Tes sneakers tournent le plus vite : 3 ventes ce mois, +12 %. Touche une fiche pour voir le détail.",
  deals: "2 bonnes affaires et 1 arnaque probable détectées aujourd'hui. Je te les affiche.",
  analysis: "Forte demande. Je recommande 45–50 €, eBay vend le plus vite.",
  added: "C'est rangé ! Ta paire est dans ton inventaire, famille Sneakers.",
  askPhoto: "Envoie-moi une photo et l'état de l'objet, je m'occupe du reste.",
  fallback: "Compris. Voici ton inventaire mis à jour.",
};

// Onboarding niches — each carries a small market study shown by the mascot.
export type NicheStudy = {
  demandScore: number;
  searches: number;
  sales: number;
  sellThroughDays: number;
  median: number;
  trend: number;
  bestPlatform: string;
  note: string;
};

export type Niche = { id: string; name: string; emoji: string; study: NicheStudy };

export const niches: Niche[] = [
  {
    id: "pokemon",
    name: "Cartes Pokémon",
    emoji: "🃏",
    study: {
      demandScore: 88,
      searches: 12400,
      sales: 860,
      sellThroughDays: 4,
      median: 35,
      trend: 14,
      bestPlatform: "ebay",
      note: "Les holos et les displays scellés partent en quelques jours, surtout sur eBay et Cardmarket.",
    },
  },
  {
    id: "gpu",
    name: "GPU & CPU",
    emoji: "🖥️",
    study: {
      demandScore: 74,
      searches: 6300,
      sales: 410,
      sellThroughDays: 9,
      median: 220,
      trend: 6,
      bestPlatform: "ebay",
      note: "Le prix suit les nouvelles générations : bien daté, un GPU d'occasion se vend vite.",
    },
  },
  {
    id: "sneakers",
    name: "Sneakers",
    emoji: "👟",
    study: {
      demandScore: 82,
      searches: 9800,
      sales: 640,
      sellThroughDays: 6,
      median: 120,
      trend: 9,
      bestPlatform: "vinted",
      note: "Les paires en bon état avec boîte d'origine se vendent ~15 % plus cher.",
    },
  },
];

// Deterministic study for a custom niche typed by the user.
export function customNiche(name: string): Niche {
  const r = rng(hash(name.toLowerCase()) + 11);
  return {
    id: "custom",
    name,
    emoji: "✨",
    study: {
      demandScore: Math.round(55 + r() * 35),
      searches: Math.round(800 + r() * 6000),
      sales: Math.round(60 + r() * 500),
      sellThroughDays: Math.round(3 + r() * 12),
      median: Math.round(20 + r() * 180),
      trend: Math.round(r() * 16),
      bestPlatform: ["vinted", "ebay", "leboncoin"][Math.floor(r() * 3)]!,
      note: "Je suivrai ce marché pour toi et je t'alerterai dès qu'une occasion se présente.",
    },
  };
}

// Platforms suggested for selling — eBay is always first for the demo.
const NICHE_PLATFORMS: Record<string, string[]> = {
  pokemon: ["cardmarket", "vinted"],
  gpu: ["backmarket", "leboncoin"],
  sneakers: ["stockx", "vinted"],
  custom: ["vinted", "leboncoin"],
};
export function platformsFor(niche: Niche): { id: string; name: string; color: string; fit: number }[] {
  const ids = ["ebay", ...(NICHE_PLATFORMS[niche.id] ?? NICHE_PLATFORMS["custom"]!)];
  return ids.map((id, i) => ({ id, ...marketplaces[id]!, fit: [96, 84, 71][i] ?? 60 }));
}

export type Offer = { id: string; title: string; price: number; market: string; delta: number; kind: "deal" | "fair" | "scam" };
export function offersFor(query: string, niche: Niche): Offer[] {
  const r = rng(hash(query.toLowerCase() + niche.id) + 3);
  const base = niche.study.median;
  const markets = ["ebay", ...(NICHE_PLATFORMS[niche.id] ?? NICHE_PLATFORMS["custom"]!), "leboncoin"];
  const kinds: Offer["kind"][] = ["deal", "fair", "deal", "scam", "fair"];
  return kinds.map((kind, i) => {
    const delta = kind === "deal" ? -Math.round(12 + r() * 15) : kind === "scam" ? -Math.round(55 + r() * 15) : Math.round(r() * 8 - 3);
    return { id: `o${i}`, title: query, price: Math.max(1, Math.round(base * (1 + delta / 100))), market: markets[i % markets.length]!, delta, kind };
  });
}

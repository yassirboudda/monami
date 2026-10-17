// Données de démo pour les pages publiques (accueil, chercher, inventaire).
// À remplacer par l'API (/backend) quand les connecteurs marketplaces existent.

export type MarketplaceId = "vinted" | "leboncoin" | "vestiaire" | "zalando" | "farfetch" | "amazon" | "ebay" | "depop"

export type Marketplace = {
  id: MarketplaceId
  name: string
  kind: string
}

export const MARKETPLACES: Marketplace[] = [
  { id: "vinted", name: "Vinted", kind: "Seconde main" },
  { id: "leboncoin", name: "Leboncoin", kind: "Petites annonces" },
  { id: "vestiaire", name: "Vestiaire Collective", kind: "Luxe d'occasion" },
  { id: "zalando", name: "Zalando", kind: "Neuf et outlet" },
  { id: "farfetch", name: "Farfetch", kind: "Luxe neuf" },
  { id: "amazon", name: "Amazon", kind: "Neuf" },
  { id: "ebay", name: "eBay", kind: "Enchères et occasion" },
  { id: "depop", name: "Depop", kind: "Vintage" },
]

export const marketplaceName = (id: MarketplaceId) => MARKETPLACES.find((m) => m.id === id)?.name ?? id

export type Condition = "neuf" | "très bon état" | "bon état" | "avec défaut"
export type Category = "chaussures" | "sacs" | "vestes" | "montres" | "deco"

export type Offer = {
  id: string
  marketplace: MarketplaceId
  title: string
  brand: string
  category: Category
  price: number
  retailPrice?: number
  condition: Condition
  color: string
  material: string
  size?: string
  note?: string
  postedDaysAgo: number
}

let n = 0
const o = (x: Omit<Offer, "id">): Offer => ({ id: `o${++n}`, ...x })

export const OFFERS: Offer[] = [
  // Louboutin So Kate : l'exemple de la démo
  o({ marketplace: "vinted", title: "Louboutin So Kate 120 vernis noir", brand: "Christian Louboutin", category: "chaussures", price: 289, retailPrice: 795, condition: "bon état", color: "noir", material: "cuir verni", size: "38", note: "Semelles rouges usées à 30 %", postedDaysAgo: 2 }),
  o({ marketplace: "vestiaire", title: "So Kate 120 cuir verni noir", brand: "Christian Louboutin", category: "chaussures", price: 420, retailPrice: 795, condition: "très bon état", color: "noir", material: "cuir verni", size: "38", note: "Authentifié par Vestiaire", postedDaysAgo: 5 }),
  o({ marketplace: "farfetch", title: "Escarpins So Kate 120 mm", brand: "Christian Louboutin", category: "chaussures", price: 795, retailPrice: 795, condition: "neuf", color: "noir", material: "cuir verni", size: "38", postedDaysAgo: 0 }),
  o({ marketplace: "zalando", title: "So Kate 120 nude", brand: "Christian Louboutin", category: "chaussures", price: 636, retailPrice: 795, condition: "neuf", color: "nude", material: "cuir", size: "38", note: "Outlet -20 %", postedDaysAgo: 1 }),
  o({ marketplace: "ebay", title: "Louboutin So Kate noir pointure 38.5", brand: "Christian Louboutin", category: "chaussures", price: 210, retailPrice: 795, condition: "avec défaut", color: "noir", material: "cuir verni", size: "38.5", note: "Petite éraflure au talon gauche", postedDaysAgo: 9 }),
  o({ marketplace: "leboncoin", title: "Escarpins Louboutin So Kate portés 2 fois", brand: "Christian Louboutin", category: "chaussures", price: 350, retailPrice: 795, condition: "très bon état", color: "noir", material: "cuir verni", size: "38", note: "Remise en main propre, Paris 11e", postedDaysAgo: 3 }),
  o({ marketplace: "vinted", title: "Louboutin So Kate daim rouge", brand: "Christian Louboutin", category: "chaussures", price: 265, retailPrice: 745, condition: "bon état", color: "rouge", material: "daim", size: "37", postedDaysAgo: 12 }),
  o({ marketplace: "depop", title: "Vintage Louboutin So Kate patent", brand: "Christian Louboutin", category: "chaussures", price: 240, retailPrice: 795, condition: "bon état", color: "noir", material: "cuir verni", size: "39", note: "Boîte d'origine incluse", postedDaysAgo: 20 }),
  o({ marketplace: "amazon", title: "Christian Louboutin So Kate 120 Black", brand: "Christian Louboutin", category: "chaussures", price: 812, retailPrice: 795, condition: "neuf", color: "noir", material: "cuir verni", size: "38", postedDaysAgo: 4 }),
  o({ marketplace: "vestiaire", title: "So Kate 100 cuir nude", brand: "Christian Louboutin", category: "chaussures", price: 380, retailPrice: 745, condition: "très bon état", color: "nude", material: "cuir", size: "38", postedDaysAgo: 7 }),

  // Autres recherches possibles
  o({ marketplace: "vinted", title: "Sac Le Pliage long champ marine", brand: "Longchamp", category: "sacs", price: 45, retailPrice: 125, condition: "bon état", color: "bleu", material: "nylon", postedDaysAgo: 1 }),
  o({ marketplace: "zalando", title: "Le Pliage Original M", brand: "Longchamp", category: "sacs", price: 125, retailPrice: 125, condition: "neuf", color: "bleu", material: "nylon", postedDaysAgo: 0 }),
  o({ marketplace: "vestiaire", title: "Sac Jodie petit modèle", brand: "Bottega Veneta", category: "sacs", price: 1450, retailPrice: 2800, condition: "très bon état", color: "vert", material: "cuir", postedDaysAgo: 6 }),
  o({ marketplace: "leboncoin", title: "Sac Speedy 30 monogram", brand: "Louis Vuitton", category: "sacs", price: 520, retailPrice: 1450, condition: "avec défaut", color: "marron", material: "toile", note: "Poignées patinées", postedDaysAgo: 15 }),
  o({ marketplace: "ebay", title: "Speedy 30 monogram avec facture", brand: "Louis Vuitton", category: "sacs", price: 690, retailPrice: 1450, condition: "bon état", color: "marron", material: "toile", postedDaysAgo: 4 }),
  o({ marketplace: "vinted", title: "Veste en jean Levi's Trucker vintage", brand: "Levi's", category: "vestes", price: 35, retailPrice: 110, condition: "bon état", color: "bleu", material: "denim", size: "M", postedDaysAgo: 2 }),
  o({ marketplace: "depop", title: "Levi's Trucker 90s délavée", brand: "Levi's", category: "vestes", price: 48, retailPrice: 110, condition: "très bon état", color: "bleu", material: "denim", size: "L", postedDaysAgo: 8 }),
  o({ marketplace: "amazon", title: "Levi's The Trucker Jacket", brand: "Levi's", category: "vestes", price: 99, retailPrice: 110, condition: "neuf", color: "bleu", material: "denim", size: "M", postedDaysAgo: 0 }),
  o({ marketplace: "farfetch", title: "Trench Kensington long", brand: "Burberry", category: "vestes", price: 2190, retailPrice: 2190, condition: "neuf", color: "beige", material: "coton", size: "38", postedDaysAgo: 3 }),
  o({ marketplace: "vestiaire", title: "Trench Burberry Kensington", brand: "Burberry", category: "vestes", price: 890, retailPrice: 2190, condition: "très bon état", color: "beige", material: "coton", size: "38", postedDaysAgo: 11 }),
  o({ marketplace: "ebay", title: "Montre Seiko 5 automatique", brand: "Seiko", category: "montres", price: 140, retailPrice: 260, condition: "bon état", color: "argent", material: "acier", postedDaysAgo: 5 }),
  o({ marketplace: "leboncoin", title: "Lampe Panthella Louis Poulsen", brand: "Louis Poulsen", category: "deco", price: 260, retailPrice: 545, condition: "très bon état", color: "blanc", material: "métal", postedDaysAgo: 2 }),
]

export const COLORS = ["noir", "nude", "rouge", "bleu", "marron", "beige"]
export const MATERIALS = ["cuir verni", "cuir", "daim", "toile", "nylon", "denim"]
export const CONDITIONS: Condition[] = ["neuf", "très bon état", "bon état", "avec défaut"]

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

export type SearchFilters = {
  colors: string[]
  materials: string[]
  conditions: Condition[]
  maxPrice?: number
}

export function searchOffers(query: string, f: SearchFilters): Offer[] {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 1)
  return OFFERS.filter((x) => {
    const hay = norm(`${x.title} ${x.brand} ${x.category} ${x.color} ${x.material}`)
    if (words.length && !words.every((w) => hay.includes(w))) return false
    if (f.colors.length && !f.colors.includes(x.color)) return false
    if (f.materials.length && !f.materials.includes(x.material)) return false
    if (f.conditions.length && !f.conditions.includes(x.condition)) return false
    if (f.maxPrice && x.price > f.maxPrice) return false
    return true
  }).sort((a, b) => a.price - b.price)
}

// ---------- Mémoire écran (screenpipe) ----------

export type ScreenMemory = {
  id: string
  query: string
  seenOn: string
  when: string
  excerpt: string
}

export const DEMO_MEMORIES: ScreenMemory[] = [
  { id: "m1", query: "Louboutin So Kate", seenOn: "Instagram", when: "hier, 21:14", excerpt: "« les So Kate de @lea.prs, je suis amoureuse »" },
  { id: "m2", query: "Longchamp Le Pliage", seenOn: "TikTok", when: "mardi, 08:52", excerpt: "Vidéo « what's in my bag »" },
  { id: "m3", query: "Burberry trench Kensington", seenOn: "Safari, vogue.fr", when: "lundi, 13:30", excerpt: "Article « 10 trenchs pour l'automne »" },
  { id: "m4", query: "Levi's Trucker", seenOn: "Pinterest", when: "dimanche, 18:05", excerpt: "Tableau « Looks d'automne »" },
]

// ---------- Inventaire vendeur ----------

export type StockItem = {
  id: string
  title: string
  price: number
  status: "en ligne" | "réservé" | "vendu" | "à publier"
  on: MarketplaceId[]
  views: number
}

export type StockBox = {
  id: string
  name: string
  hint: string
  items: StockItem[]
}

export const STOCK_BOXES: StockBox[] = [
  {
    id: "b1",
    name: "Chaussures",
    hint: "Étagère du haut",
    items: [
      { id: "s1", title: "Sneakers blanches 40", price: 28, status: "réservé", on: ["vinted"], views: 90 },
      { id: "s2", title: "Bottines Chelsea cuir 39", price: 55, status: "en ligne", on: ["vinted", "leboncoin"], views: 41 },
      { id: "s3", title: "Mocassins vintage 41", price: 32, status: "à publier", on: [], views: 0 },
    ],
  },
  {
    id: "b2",
    name: "Vestes",
    hint: "Penderie de l'entrée",
    items: [
      { id: "s4", title: "Veste jean vintage", price: 35, status: "en ligne", on: ["vinted", "leboncoin"], views: 120 },
      { id: "s5", title: "Pull oversize beige", price: 18, status: "vendu", on: ["vinted"], views: 210 },
      { id: "s6", title: "Doudoune légère M", price: 40, status: "en ligne", on: ["vinted"], views: 37 },
    ],
  },
  {
    id: "b3",
    name: "Sacs",
    hint: "Sous le lit",
    items: [
      { id: "s7", title: "Sac bandoulière cuir", price: 42, status: "en ligne", on: ["vinted"], views: 33 },
      { id: "s8", title: "Tote bag toile écrue", price: 12, status: "à publier", on: [], views: 0 },
    ],
  },
  {
    id: "b4",
    name: "Déco",
    hint: "Cave, à gauche",
    items: [
      { id: "s9", title: "Lampe design scandinave", price: 45, status: "en ligne", on: ["leboncoin"], views: 22 },
      { id: "s10", title: "Lot déco Halloween", price: 25, status: "réservé", on: ["leboncoin"], views: 15 },
      { id: "s11", title: "Fauteuil velours vert", price: 120, status: "en ligne", on: ["leboncoin"], views: 41 },
      { id: "s12", title: "Console TV bois", price: 90, status: "en ligne", on: ["leboncoin"], views: 58 },
    ],
  },
  {
    id: "b5",
    name: "Montres et bijoux",
    hint: "Tiroir du bureau",
    items: [{ id: "s13", title: "Montre minimaliste", price: 55, status: "en ligne", on: ["vinted"], views: 67 }],
  },
  {
    id: "b6",
    name: "Halloween",
    hint: "Grenier",
    items: [
      { id: "s14", title: "Masque Halloween LED", price: 12, status: "en ligne", on: ["vinted"], views: 48 },
      { id: "s15", title: "Masque Halloween LED (x2)", price: 12, status: "à publier", on: [], views: 0 },
    ],
  },
]

export type RepeatedTask = {
  id: string
  what: string
  count: string
  proposal: string
}

export const DEMO_TASKS: RepeatedTask[] = [
  {
    id: "t1",
    what: "Vous avez recopié la même annonce de Vinted vers Leboncoin",
    count: "6 fois cette semaine",
    proposal: "Publier automatiquement chaque nouvel article sur les deux sites",
  },
  {
    id: "t2",
    what: "Vous avez répondu « Oui, toujours disponible ! » à des acheteurs",
    count: "14 fois cette semaine",
    proposal: "Répondre à votre place tant que l'article est en ligne",
  },
  {
    id: "t3",
    what: "Vous avez baissé le prix d'annonces sans vue depuis 10 jours",
    count: "4 fois ce mois-ci",
    proposal: "Baisser de 10 % les annonces dormantes, avec un plancher que vous fixez",
  },
]

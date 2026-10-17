// Demo data for the public OctoHandy pages (home, explore, profile).
// Replace with the /backend API once marketplace connectors return real listings.

export type MarketplaceId =
  | "vinted" | "ebay" | "vestiaire" | "leboncoin" | "zalando" | "amazon" | "farfetch" | "depop" | "zara"

export type Marketplace = { id: MarketplaceId; name: string; search: string }

export const MARKETPLACES: Marketplace[] = [
  { id: "vinted", name: "Vinted", search: "https://www.vinted.fr/catalog?search_text=" },
  { id: "ebay", name: "eBay", search: "https://www.ebay.fr/sch/i.html?_nkw=" },
  { id: "vestiaire", name: "Vestiaire Collective", search: "https://fr.vestiairecollective.com/search/?q=" },
  { id: "zalando", name: "Zalando", search: "https://www.zalando.fr/catalogue/?q=" },
  { id: "amazon", name: "Amazon", search: "https://www.amazon.fr/s?k=" },
  { id: "farfetch", name: "Farfetch", search: "https://www.farfetch.com/fr/shopping/search/items.aspx?q=" },
  { id: "depop", name: "Depop", search: "https://www.depop.com/search/?q=" },
  { id: "zara", name: "Zara", search: "https://www.zara.com/fr/fr/search?searchTerm=" },
]

export const mkName = (id: MarketplaceId) => MARKETPLACES.find((m) => m.id === id)?.name ?? id
export const mkSearchUrl = (id: MarketplaceId, q: string) =>
  (MARKETPLACES.find((m) => m.id === id)?.search ?? "") + encodeURIComponent(q)

export type Condition = "new" | "like_new" | "good" | "fair"
export type Color = "black" | "nude" | "red" | "blue" | "brown" | "beige" | "green" | "silver" | "white"
export type Material = "patent" | "leather" | "suede" | "canvas" | "nylon" | "denim" | "cotton" | "steel" | "metal"

export type Offer = {
  id: string
  marketplace: MarketplaceId
  title: string
  brand: string
  price: number
  retail?: number
  condition: Condition
  color: Color
  material: Material
  size?: string
  daysAgo: number
}

let n = 0
const o = (x: Omit<Offer, "id">): Offer => ({ id: `o${++n}`, ...x })

export const OFFERS: Offer[] = [
  o({ marketplace: "vinted", title: "So Kate 120 patent", brand: "Christian Louboutin", price: 289, retail: 795, condition: "good", color: "black", material: "patent", size: "38", daysAgo: 2 }),
  o({ marketplace: "vinted", title: "So Kate suede", brand: "Christian Louboutin", price: 265, retail: 745, condition: "good", color: "red", material: "suede", size: "37", daysAgo: 12 }),
  o({ marketplace: "vestiaire", title: "So Kate 120 patent leather", brand: "Christian Louboutin", price: 420, retail: 795, condition: "like_new", color: "black", material: "patent", size: "38", daysAgo: 5 }),
  o({ marketplace: "vestiaire", title: "So Kate 100 leather", brand: "Christian Louboutin", price: 380, retail: 745, condition: "like_new", color: "nude", material: "leather", size: "38", daysAgo: 7 }),
  o({ marketplace: "farfetch", title: "So Kate 120 mm pumps", brand: "Christian Louboutin", price: 795, retail: 795, condition: "new", color: "black", material: "patent", size: "38", daysAgo: 0 }),
  o({ marketplace: "zalando", title: "So Kate 120", brand: "Christian Louboutin", price: 636, retail: 795, condition: "new", color: "nude", material: "leather", size: "38", daysAgo: 1 }),
  o({ marketplace: "ebay", title: "So Kate patent, size 38.5", brand: "Christian Louboutin", price: 210, retail: 795, condition: "fair", color: "black", material: "patent", size: "38.5", daysAgo: 9 }),
  o({ marketplace: "leboncoin", title: "So Kate, worn twice", brand: "Christian Louboutin", price: 350, retail: 795, condition: "like_new", color: "black", material: "patent", size: "38", daysAgo: 3 }),
  o({ marketplace: "depop", title: "Vintage So Kate patent", brand: "Christian Louboutin", price: 240, retail: 795, condition: "good", color: "black", material: "patent", size: "39", daysAgo: 20 }),
  o({ marketplace: "amazon", title: "So Kate 120 Black", brand: "Christian Louboutin", price: 812, retail: 795, condition: "new", color: "black", material: "patent", size: "38", daysAgo: 4 }),
  o({ marketplace: "vinted", title: "Le Pliage long handle", brand: "Longchamp", price: 45, retail: 125, condition: "good", color: "blue", material: "nylon", daysAgo: 1 }),
  o({ marketplace: "zalando", title: "Le Pliage Original M", brand: "Longchamp", price: 125, retail: 125, condition: "new", color: "blue", material: "nylon", daysAgo: 0 }),
  o({ marketplace: "zara", title: "Nylon shopper bag", brand: "Zara", price: 35.95, condition: "new", color: "blue", material: "nylon", daysAgo: 0 }),
  o({ marketplace: "vestiaire", title: "Jodie mini", brand: "Bottega Veneta", price: 1450, retail: 2800, condition: "like_new", color: "green", material: "leather", daysAgo: 6 }),
  o({ marketplace: "leboncoin", title: "Speedy 30 monogram", brand: "Louis Vuitton", price: 520, retail: 1450, condition: "fair", color: "brown", material: "canvas", daysAgo: 15 }),
  o({ marketplace: "ebay", title: "Speedy 30 monogram with receipt", brand: "Louis Vuitton", price: 690, retail: 1450, condition: "good", color: "brown", material: "canvas", daysAgo: 4 }),
  o({ marketplace: "vinted", title: "Trucker jacket, vintage", brand: "Levi's", price: 35, retail: 110, condition: "good", color: "blue", material: "denim", size: "M", daysAgo: 2 }),
  o({ marketplace: "depop", title: "90s washed Trucker", brand: "Levi's", price: 48, retail: 110, condition: "like_new", color: "blue", material: "denim", size: "L", daysAgo: 8 }),
  o({ marketplace: "amazon", title: "The Trucker Jacket", brand: "Levi's", price: 99, retail: 110, condition: "new", color: "blue", material: "denim", size: "M", daysAgo: 0 }),
  o({ marketplace: "zara", title: "Denim trucker jacket", brand: "Zara", price: 45.95, condition: "new", color: "blue", material: "denim", size: "M", daysAgo: 0 }),
  o({ marketplace: "farfetch", title: "Kensington long trench", brand: "Burberry", price: 2190, retail: 2190, condition: "new", color: "beige", material: "cotton", size: "38", daysAgo: 3 }),
  o({ marketplace: "vestiaire", title: "Kensington trench", brand: "Burberry", price: 890, retail: 2190, condition: "like_new", color: "beige", material: "cotton", size: "38", daysAgo: 11 }),
  o({ marketplace: "ebay", title: "Seiko 5 automatic", brand: "Seiko", price: 140, retail: 260, condition: "good", color: "silver", material: "steel", daysAgo: 5 }),
  o({ marketplace: "leboncoin", title: "Panthella lamp", brand: "Louis Poulsen", price: 260, retail: 545, condition: "like_new", color: "white", material: "metal", daysAgo: 2 }),
]

export const COLORS: Color[] = ["black", "nude", "red", "blue", "brown", "beige", "green"]
export const MATERIALS: Material[] = ["patent", "leather", "suede", "canvas", "nylon", "denim"]
export const CONDITIONS: Condition[] = ["new", "like_new", "good", "fair"]
export const PRICE_CAPS = [100, 300, 500, 1000]

export type Filters = { colors: Color[]; materials: Material[]; conditions: Condition[]; maxPrice: number | null }
export const NO_FILTERS: Filters = { colors: [], materials: [], conditions: [], maxPrice: null }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

export function searchOffers(query: string, f: Filters): Offer[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  return OFFERS.filter((x) => {
    const hay = norm(`${x.brand} ${x.title} ${x.color} ${x.material}`)
    if (words.length && !words.every((w) => hay.includes(w))) return false
    if (f.colors.length && !f.colors.includes(x.color)) return false
    if (f.materials.length && !f.materials.includes(x.material)) return false
    if (f.conditions.length && !f.conditions.includes(x.condition)) return false
    if (f.maxPrice != null && x.price > f.maxPrice) return false
    return true
  }).sort((a, b) => a.price - b.price)
}

// ---------- seller profile and inventory ----------

export type Family = "shoes" | "jackets" | "bags" | "trousers" | "watches" | "home"
export const FAMILIES: Family[] = ["shoes", "jackets", "bags", "trousers", "watches", "home"]

export type Variant = { size?: string; color?: Color; qty: number; listedOn: MarketplaceId[] }
export type Product = { id: string; family: Family; title: string; brand: string; price: number; variants: Variant[] }

export const PRODUCTS: Product[] = [
  { id: "p1", family: "shoes", title: "So Kate 120", brand: "Christian Louboutin", price: 340, variants: [
    { size: "37", qty: 1, listedOn: ["vinted", "vestiaire"] },
    { size: "38", qty: 2, listedOn: ["vinted", "vestiaire", "ebay"] },
    { size: "39", qty: 1, listedOn: [] },
  ] },
  { id: "p2", family: "shoes", title: "Stan Smith", brand: "adidas", price: 55, variants: [
    { size: "39", qty: 3, listedOn: ["vinted", "leboncoin"] },
    { size: "41", qty: 2, listedOn: ["vinted"] },
  ] },
  { id: "p3", family: "shoes", title: "Chelsea boots", brand: "Dr. Martens", price: 90, variants: [{ size: "40", qty: 1, listedOn: ["vinted"] }] },
  { id: "p4", family: "jackets", title: "Trucker jacket", brand: "Levi's", price: 38, variants: [
    { size: "S", qty: 1, listedOn: ["vinted", "depop"] },
    { size: "M", qty: 3, listedOn: ["vinted", "depop", "ebay"] },
  ] },
  { id: "p5", family: "jackets", title: "Kensington trench", brand: "Burberry", price: 690, variants: [{ size: "38", qty: 1, listedOn: ["vestiaire"] }] },
  { id: "p6", family: "bags", title: "Le Pliage", brand: "Longchamp", price: 55, variants: [
    { color: "blue", qty: 2, listedOn: ["vinted", "leboncoin"] },
    { color: "black", qty: 1, listedOn: ["vinted"] },
  ] },
  { id: "p7", family: "bags", title: "Speedy 30", brand: "Louis Vuitton", price: 560, variants: [{ qty: 1, listedOn: ["vestiaire", "ebay"] }] },
  { id: "p8", family: "trousers", title: "501 Original", brand: "Levi's", price: 30, variants: [
    { size: "W28", qty: 2, listedOn: ["vinted"] },
    { size: "W30", qty: 2, listedOn: ["vinted", "depop"] },
    { size: "W32", qty: 1, listedOn: [] },
  ] },
  { id: "p9", family: "watches", title: "Seiko 5 automatic", brand: "Seiko", price: 150, variants: [{ qty: 1, listedOn: ["ebay"] }] },
  { id: "p10", family: "home", title: "Panthella lamp", brand: "Louis Poulsen", price: 280, variants: [{ qty: 1, listedOn: ["leboncoin"] }] },
]

export const productQty = (p: Product) => p.variants.reduce((s, v) => s + v.qty, 0)
export const familyQty = (f: Family) => PRODUCTS.filter((p) => p.family === f).reduce((s, p) => s + productQty(p), 0)

export const PROFILE = {
  name: "Camille Dupont",
  handle: "camille.dresses",
  city: "Paris",
  rating: 4.9,
  reviews: 128,
  sold: 214,
  followers: 1340,
  marketplaces: ["vinted", "vestiaire", "ebay", "depop"] as MarketplaceId[],
}

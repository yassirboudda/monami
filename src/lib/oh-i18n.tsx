"use client"

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react"
import type { Color, Condition, Family, Material } from "@/lib/oh-data"

export type Lang = "en" | "fr"

const en = {
  nav: { explore: "Explore", shelf: "My shelf", signIn: "Sign in", dashboard: "Dashboard" },
  home: {
    kicker: "Every marketplace, one shelf",
    title1: "Every marketplace.",
    title2: "One shelf.",
    lead: "Find anything across Vinted, eBay, Vestiaire and more. Sell from one place. Just ask the octopus.",
    ctaExplore: "Start exploring",
    ctaShelf: "Open my shelf",
    howTitle: "Three steps, no fuss.",
    how: [
      { t: "Ask", d: "Type what you want, or what you want to sell." },
      { t: "It opens every box", d: "OctoHandy looks inside each marketplace for you." },
      { t: "You choose", d: "Best price first. One tap to buy or publish." },
    ],
    askTitle: "Just ask.",
    askLead: "One chat runs everything: searching, publishing, moving stock.",
    askUser: "Find Louboutin So Kate, size 38, under €400",
    askBot: "Found 7. The cheapest is €289 on Vinted, in good condition.",
    askUser2: "Publish my Levi's jacket on Vinted and Depop",
    askBot2: "Done. It's live on both, and I'll keep the stock in sync.",
    sellTitle: "Your shelf, tidy.",
    sellLead: "Everything you sell, sorted into boxes by family. One stock for every marketplace.",
    footer: "Made at 42 Paris for the screenpipe hackathon.",
  },
  explore: {
    title: "Explore",
    placeholder: "Search a model, a brand…",
    photo: "Search by photo",
    photoDemo: "Photo search is a demo: showing Louboutin So Kate.",
    screen: "Seen on your screen",
    screenLive: "live from screenpipe",
    screenDemo: "example",
    found: (n: number) => (n === 1 ? "1 found" : `${n} found`),
    none: "empty",
    all: "All",
    colour: "Colour",
    material: "Material",
    condition: "Condition",
    budget: "Budget",
    upTo: (p: number) => `Up to €${p}`,
    any: "Any",
    clear: "Clear",
    tap: "Tap a box to look inside.",
    view: (m: string) => `View on ${m}`,
    nothing: "Nothing here for this search.",
    retail: (p: number) => `€${p} new`,
    close: "Close",
    size: "Size",
  },
  profile: {
    rating: (r: number, n: number) => `${r} · ${n} reviews`,
    sold: "sold",
    followers: "followers",
    items: "items",
    bio: "Vintage lover, shoe hoarder. Everything ships within 48h.",
    sellsOn: "Sells on",
    edit: "Edit profile",
    editDemo: "Profile editing is coming soon.",
    shelf: "My shelf",
    shelfLead: "Tap a box to see what's inside.",
    unlisted: "Not listed yet",
    listedOn: "Listed on",
    variants: (n: number) => (n === 1 ? "1 version" : `${n} versions`),
    inStock: (n: number) => `${n} in stock`,
    any: "One size",
  },
  chat: {
    placeholder: "Ask OctoHandy…",
    send: "Send",
    attach: "Add a photo",
    open: "Show conversation",
    hide: "Hide conversation",
    thinking: "Opening the boxes…",
    exploreHints: ["Find Louboutin So Kate under €400", "Longchamp Le Pliage, blue"],
    profileHints: ["Publish my Levi's jacket on Vinted", "Which items aren't listed yet?"],
    demoSearch: (q: string, n: number) => `I looked in every box for "${q}": ${n} result${n === 1 ? "" : "s"}. They're open on the shelf.`,
    demo: "I'm on it. (Demo mode: the agent isn't connected here yet.)",
  },
  colors: { black: "Black", nude: "Nude", red: "Red", blue: "Blue", brown: "Brown", beige: "Beige", green: "Green", silver: "Silver", white: "White" } as Record<Color, string>,
  materials: { patent: "Patent leather", leather: "Leather", suede: "Suede", canvas: "Canvas", nylon: "Nylon", denim: "Denim", cotton: "Cotton", steel: "Steel", metal: "Metal" } as Record<Material, string>,
  conditions: { new: "New", like_new: "Like new", good: "Good", fair: "Fair" } as Record<Condition, string>,
  families: { shoes: "Shoes", jackets: "Jackets", bags: "Bags", trousers: "Trousers", watches: "Watches", home: "Home" } as Record<Family, string>,
}

type Dict = typeof en

const fr: Dict = {
  nav: { explore: "Explorer", shelf: "Mon étagère", signIn: "Se connecter", dashboard: "Tableau de bord" },
  home: {
    kicker: "Toutes les boutiques, une seule étagère",
    title1: "Toutes les boutiques.",
    title2: "Une seule étagère.",
    lead: "Trouvez tout sur Vinted, eBay, Vestiaire et les autres. Vendez depuis un seul endroit. Demandez simplement au poulpe.",
    ctaExplore: "Explorer",
    ctaShelf: "Ouvrir mon étagère",
    howTitle: "Trois étapes, sans prise de tête.",
    how: [
      { t: "Demandez", d: "Écrivez ce que vous cherchez, ou ce que vous vendez." },
      { t: "Il ouvre chaque boîte", d: "OctoHandy regarde dans chaque marketplace pour vous." },
      { t: "Vous choisissez", d: "Le meilleur prix d'abord. Un geste pour acheter ou publier." },
    ],
    askTitle: "Demandez, c'est tout.",
    askLead: "Un seul chat pour tout : chercher, publier, gérer le stock.",
    askUser: "Trouve des Louboutin So Kate en 38 à moins de 400 €",
    askBot: "J'en ai trouvé 7. La moins chère est à 289 € sur Vinted, en bon état.",
    askUser2: "Publie ma veste Levi's sur Vinted et Depop",
    askBot2: "C'est fait. Elle est en ligne sur les deux et je synchronise le stock.",
    sellTitle: "Votre étagère, bien rangée.",
    sellLead: "Tout ce que vous vendez, rangé par famille. Un seul stock pour toutes les marketplaces.",
    footer: "Fait à 42 Paris pour le hackathon screenpipe.",
  },
  explore: {
    title: "Explorer",
    placeholder: "Un modèle, une marque…",
    photo: "Chercher par photo",
    photoDemo: "La recherche par photo est une démo : voici les Louboutin So Kate.",
    screen: "Vu sur votre écran",
    screenLive: "en direct de screenpipe",
    screenDemo: "exemple",
    found: (n: number) => (n === 1 ? "1 trouvé" : `${n} trouvés`),
    none: "vide",
    all: "Tout",
    colour: "Couleur",
    material: "Matière",
    condition: "État",
    budget: "Budget",
    upTo: (p: number) => `Jusqu'à ${p} €`,
    any: "Tous",
    clear: "Effacer",
    tap: "Touchez une boîte pour regarder dedans.",
    view: (m: string) => `Voir sur ${m}`,
    nothing: "Rien ici pour cette recherche.",
    retail: (p: number) => `${p} € neuf`,
    close: "Fermer",
    size: "Taille",
  },
  profile: {
    rating: (r: number, n: number) => `${String(r).replace(".", ",")} · ${n} avis`,
    sold: "vendus",
    followers: "abonnés",
    items: "articles",
    bio: "Fan de vintage, collectionneuse de chaussures. Envoi sous 48 h.",
    sellsOn: "Vend sur",
    edit: "Modifier le profil",
    editDemo: "La modification du profil arrive bientôt.",
    shelf: "Mon étagère",
    shelfLead: "Touchez une boîte pour voir ce qu'il y a dedans.",
    unlisted: "Pas encore publié",
    listedOn: "Publié sur",
    variants: (n: number) => (n === 1 ? "1 version" : `${n} versions`),
    inStock: (n: number) => `${n} en stock`,
    any: "Taille unique",
  },
  chat: {
    placeholder: "Demandez à OctoHandy…",
    send: "Envoyer",
    attach: "Ajouter une photo",
    open: "Voir la conversation",
    hide: "Masquer la conversation",
    thinking: "J'ouvre les boîtes…",
    exploreHints: ["Trouve des Louboutin So Kate à moins de 400 €", "Longchamp Le Pliage bleu"],
    profileHints: ["Publie ma veste Levi's sur Vinted", "Quels articles ne sont pas publiés ?"],
    demoSearch: (q: string, n: number) => `J'ai regardé dans chaque boîte pour « ${q} » : ${n} résultat${n > 1 ? "s" : ""}. Elles sont ouvertes sur l'étagère.`,
    demo: "Je m'en occupe. (Mode démo : l'agent n'est pas encore branché ici.)",
  },
  colors: { black: "Noir", nude: "Nude", red: "Rouge", blue: "Bleu", brown: "Marron", beige: "Beige", green: "Vert", silver: "Argent", white: "Blanc" },
  materials: { patent: "Cuir verni", leather: "Cuir", suede: "Daim", canvas: "Toile", nylon: "Nylon", denim: "Denim", cotton: "Coton", steel: "Acier", metal: "Métal" },
  conditions: { new: "Neuf", like_new: "Très bon état", good: "Bon état", fair: "Avec défaut" },
  families: { shoes: "Chaussures", jackets: "Vestes", bags: "Sacs", trousers: "Pantalons", watches: "Montres", home: "Déco" },
}

const DICTS: Record<Lang, Dict> = { en, fr }
const KEY = "oh-lang"
const listeners = new Set<() => void>()

function readLang(): Lang {
  try {
    return localStorage.getItem(KEY) === "fr" ? "fr" : "en"
  } catch {
    return "en"
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: "en", t: en, setLang: () => {} })

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => "en" as Lang)
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l)
    } catch {}
    document.documentElement.lang = l
    listeners.forEach((f) => f())
  }, [])
  return <Ctx.Provider value={{ lang, t: DICTS[lang], setLang }}>{children}</Ctx.Provider>
}

export const useT = () => useContext(Ctx)

export const money = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)

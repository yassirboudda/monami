import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TopBar, AlertCard } from "@/components/monami/TopBar";
import { ProductGrid } from "@/components/monami/ProductGrid";
import { AnalysisView } from "@/components/monami/AnalysisView";
import { ChatDock, type Msg } from "@/components/monami/ChatDock";
import { Onboarding, type Profile } from "@/components/monami/Onboarding";
import { SellHome, BuyHome } from "@/components/monami/HomeViews";
import { ProfileView } from "@/components/monami/ProfileView";
import { TreeBackground, type TreeStage } from "@/components/monami/tree3d/TreeBackground";
import { agentReplies, alerts, analysis, niches, type Product, type Offer } from "@/data/mock";
import { copy } from "@/lib/copy";
import { DEMO_KEY, restoreDemo, chatRequest } from "@/lib/demo-profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "monami — Ton copain pour la seconde main" },
      { name: "description", content: "monami estime le vrai prix de tes objets, détecte bonnes affaires et arnaques, et t'aide à vendre au bon prix." },
      { property: "og:title", content: "monami — Ton copain pour la seconde main" },
      { property: "og:description", content: "Un compagnon qui connaît tout le marché de la seconde main : prix réel, alertes et ventes en une photo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type View = "home" | "inventory" | "analysis" | "profile";

const TREE_BY_VIEW: Record<View, TreeStage> = {
  home: "full",
  inventory: "full",
  analysis: "fruit",
  profile: "full",
};

function Index() {
  const [profile, setProfile] = useState<Profile>();
  const [view, setView] = useState<View>("home");
  const [items, setItems] = useState<Product[]>([]);
  const [savedOffers, setSavedOffers] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [returning, setReturning] = useState(false);
  const [pending, setPending] = useState<"buy" | "sell">();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [pulse, setPulse] = useState<string>();
  const [toast, setToast] = useState<(typeof alerts)[number]>();
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const idRef = useRef(1);

  useEffect(() => {
    let saved;
    try { saved = restoreDemo(localStorage.getItem(DEMO_KEY)); } catch { /* storage is optional for this demo */ }
    if (saved) {
      setProfile(saved.profile); setItems(saved.items); setFavorites(saved.favorites); setSavedOffers(saved.savedOffers);
      setMessages([{ id: 0, role: "agent", text: copy.chatWelcome }]); setReturning(true);
      idRef.current = saved.items.reduce((max, p) => Math.max(max, Number(p.id.replace("item-", "")) || 0), 0) + 1;
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || !profile) return;
    try { localStorage.setItem(DEMO_KEY, JSON.stringify({ profile, items, savedOffers, favorites })); } catch { /* browser quota / private browsing */ }
  }, [loaded, profile, items, savedOffers, favorites]);

  useEffect(() => {
    if (!profile) return;
    const t1 = setTimeout(() => setToast(alerts[0]), 2500);
    return () => clearTimeout(t1);
  }, [profile]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleFav = (id: string) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const reply = (text: string, after?: () => void) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: idRef.current++, role: "agent", text }]);
      after?.();
    }, 900);
  };

  const onDone = (p: Profile) => {
    setProfile(p);
    if (p.intent === "sell") addSellingItem(p);
    const text =
      p.intent === "sell"
        ? `Voilà comment se porte « ${p.item} » : eBay est ton meilleur pari pour le vendre vite.`
        : `J'ai trouvé quelques offres pour « ${p.item} ». Méfie-toi de celle marquée en rouge !`;
    setMessages([{ id: 0, role: "agent", text }]);
  };

  const addSellingItem = (p: Profile) => {
    const family = p.niche.id === "pokemon" ? "cards" : p.niche.id === "sneakers" ? "sneakers" : "electronics";
    setItems((list) => [...list, { id: `item-${idRef.current++}`, name: p.item, image: p.photos[0] ?? "", family, market: "ebay", listedPrice: p.niche.study.median, marketPrice: p.niche.study.median, status: "listed" }]);
  };

  const onFavorite = (offer: Offer) => {
    if (!profile) return;
    const id = `${profile.niche.id}-${profile.item}-${offer.id}`;
    setSavedOffers((list) => list.some((p) => p.id === id) ? list : [...list, { id, name: offer.title, image: "", family: profile.niche.id === "pokemon" ? "cards" : profile.niche.id === "sneakers" ? "sneakers" : "electronics", market: offer.market, listedPrice: offer.price, marketPrice: profile.niche.study.median, status: "listed" }]);
    toggleFav(id);
  };

  const onSend = (text: string, photo?: string) => {
    if (!profile) return;
    setMessages((m) => [...m, { id: idRef.current++, role: "user", text, photo }]);
    const request = chatRequest(text);
    const intent = photo ? "sell" : request.intent ?? pending;
    if (intent) {
      if (!photo && (!request.item || /^(ça|un produit|un objet)$/i.test(request.item))) {
        setPending(intent); reply(intent === "sell" ? copy.chatSellAsk : copy.chatBuyAsk); return;
      }
      if (intent === "sell" && !photo) { setPending("sell"); setProfile({ ...profile, intent, item: request.item, photos: [] }); reply(copy.chatSellAsk); return; }
      const item = photo && /ça|photo/i.test(request.item) ? profile.item : request.item;
      const nicheId = /rtx|gpu|cpu|ryzen|geforce/i.test(item) ? "gpu" : /jordan|nike|sneaker|dunk/i.test(item) ? "sneakers" : /pokémon|pokemon|dracaufeu|pikachu|display 151/i.test(item) ? "pokemon" : profile.niche.id;
      const p = { ...profile, niche: niches.find((n) => n.id === nicheId) ?? profile.niche, intent, item, photos: photo ? [photo] : [] };
      setProfile(p); setPending(undefined);
      if (intent === "sell") addSellingItem(p);
      reply(intent === "sell" ? copy.chatSellReady(p.item) : copy.chatBuyReady(p.item), () => setView("home"));
    } else if (/inventaire|profil|favoris/i.test(text)) {
      setView("profile");
    } else if (/best|meilleur|vend le plus/i.test(text)) {
      reply(agentReplies.bestSeller, () => setView("inventory"));
    } else if (/plan|deal|affaire|arnaque/i.test(text)) {
      setProfile({ ...profile, intent: "buy" }); reply(agentReplies.deals, () => setView("home"));
    } else reply(copy.chatWelcome);
  };

  const confirm = () => {
    setItems((list) => [
      ...list,
      { id: `n${idRef.current}`, name: analysis.name, image: analysis.image, family: analysis.family, market: analysis.market, listedPrice: 48, marketPrice: 47, status: "listed" },
    ]);
    setView("inventory");
    setPulse(analysis.family);
    setTimeout(() => setPulse(undefined), 4500);
    reply(agentReplies.added);
  };

  if (!loaded) return <div className="relative h-dvh"><TreeBackground stage="full" /></div>;
  if (!profile) return <Onboarding onDone={onDone} />;

  return (
    <motion.div
      className="relative flex h-dvh flex-col overflow-hidden"
      initial={returning ? false : { scale: 1.25, filter: "blur(24px)", opacity: 0 }}
      animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
      transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <TreeBackground stage={TREE_BY_VIEW[view]} bloom={profile.intent === "sell" ? "leaves" : "fruits"} />
      <TopBar onProfile={() => setView("profile")} />
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pt-2 sm:px-6">
        <div className="mx-auto h-full max-w-6xl">
          <AnimatePresence mode="wait">
            {view === "home" ? (
              profile.intent === "sell" ? (
                <SellHome key="home" niche={profile.niche} item={profile.item} photo={profile.photos[0]} />
              ) : (
                <BuyHome key="home" niche={profile.niche} item={profile.item} favorites={savedOffers.filter((p) => favorites.includes(p.id) && p.name === profile.item).map((p) => p.id.split("-").at(-1) ?? "")} onFavorite={onFavorite} />
              )
            ) : view === "inventory" ? (
              <ProductGrid key="inv" items={items} pulseId={pulse} favorites={favorites} onToggleFav={toggleFav} />
            ) : view === "analysis" ? (
              <AnalysisView key="ana" onConfirm={confirm} onCancel={() => setView("inventory")} />
            ) : (
              <ProfileView key="prof" items={items} savedOffers={savedOffers} favorites={favorites} onToggleFav={toggleFav} onBack={() => setView("home")} />
            )}
          </AnimatePresence>
        </div>
      </main>
      <div className="relative z-20">
        <ChatDock messages={messages} typing={typing} onSend={onSend} />
      </div>
      <div className="pointer-events-none fixed bottom-36 right-4 z-40 w-[min(22rem,calc(100vw-2rem))]">
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} className="pointer-events-auto rounded-2xl bg-card shadow-xl">
              <AlertCard a={toast} onClose={() => setToast(undefined)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

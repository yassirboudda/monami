import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/monami/Landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "monami — ton copain IA pour la seconde main" },
      { name: "description", content: "Le vrai prix du marché en direct, un agent avec son propre bureau distant qui publie et répond pour toi, détecteur d'arnaques et bonnes affaires. Essai gratuit." },
      { property: "og:title", content: "monami — ton copain IA pour la seconde main" },
      { property: "og:description", content: "Prix réel, bureau distant pour ton agent, arnaques et bonnes affaires repérées — sur eBay, Vinted, Leboncoin, Etsy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

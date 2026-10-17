import type { Metadata, Viewport } from "next"
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"
import "./oh.css"

// Variable Fraunces with its SOFT/WONK axes: the rounded "soft" cut echoes the octopus drawing.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
})

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://octohandy.amirelay.com"),
  title: "OctoHandy — Gestion marketplace",
  description: "Gère tes boutiques, annonces et stock partagé avec l'agent OctoHandy.",
  applicationName: "OctoHandy",
  openGraph: {
    title: "OctoHandy — Ton assistant marketplace",
    description: "La pieuvre qui surveille tes boutiques Vinted, eBay, Vestiaire, Depop et agit sur ton bureau distant.",
    siteName: "OctoHandy",
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#C1DBE8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${jetbrainsMono.variable} ${fraunces.variable} ${hanken.variable}`}>
      <body className="antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}

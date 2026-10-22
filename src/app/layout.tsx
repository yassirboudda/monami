import type { Metadata, Viewport } from "next"
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "@/components/ui/sonner"
import { clerkAppearance } from "@/components/oh/clerk-appearance"
import { CLERK_PUBLISHABLE_KEY } from "@/lib/session"
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
  description: "Manage your shops, listings and shared stock with the OctoHandy agent.",
  applicationName: "OctoHandy",
  openGraph: {
    title: "OctoHandy — Ton assistant marketplace",
    description: "The octopus that watches your Vinted, eBay, Vestiaire and Depop shops and acts on your remote desktop.",
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
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/onboarding"
      afterSignOutUrl="/"
    >
      <html lang="en" className={`${jetbrainsMono.variable} ${fraunces.variable} ${hanken.variable}`}>
        <body className="antialiased">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  )
}

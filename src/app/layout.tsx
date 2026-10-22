import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"
import { headers } from "next/headers"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "@/components/ui/sonner"
import { clerkAppearance } from "@/components/oh/clerk-appearance"
import { clerkPublishableKeyFor } from "@/lib/session"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"
import "./oh.css"

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://octohandy.amirelay.com"),
  title: "MonAmi — Gestion marketplace",
  description: "Manage your shops, listings and shared stock with the MonAmi agent.",
  applicationName: "MonAmi",
  openGraph: {
    title: "MonAmi — Ton assistant marketplace",
    description: "The octopus that watches your Vinted, eBay, Vestiaire and Depop shops and acts on your remote desktop.",
    siteName: "MonAmi",
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host")
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKeyFor(host)}
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/onboarding"
      afterSignOutUrl="/"
    >
      <html lang="en" className={jetbrainsMono.variable}>
        <head>
          <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=chillax@300,400,500,600,700&display=swap" />
        </head>
        <body className="antialiased">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  )
}

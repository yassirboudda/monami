import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"
import { headers } from "next/headers"
import { ClerkProvider } from "@clerk/nextjs"
import { Toaster } from "@/components/ui/sonner"
import { clerkAppearanceFor } from "@/components/oh/clerk-appearance"
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://app.try-ami.com"),
  title: { default: "monami — your second-hand buddy", template: "%s · monami" },
  description:
    "monami watches your Vinted, eBay, Leboncoin and Etsy shops on its own desktop, tells you what buyers really pay, answers messages and publishes listings — you approve what matters.",
  applicationName: "monami",
  keywords: ["Vinted", "eBay", "Leboncoin", "Etsy", "seconde main", "revendeur", "assistant IA", "prix du marché", "monami"],
  alternates: { canonical: "https://app.try-ami.com" },
  openGraph: {
    title: "monami — your second-hand buddy",
    description: "Market prices, buyer replies and listings for Vinted, eBay, Leboncoin and Etsy — handled on monami's own desktop, approved by you.",
    siteName: "monami",
    url: "https://app.try-ami.com",
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "monami — your second-hand buddy", description: "Market prices, buyer replies and listings for Vinted, eBay, Leboncoin and Etsy." },
  robots: { index: true, follow: true },
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
      appearance={clerkAppearanceFor(host)}
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

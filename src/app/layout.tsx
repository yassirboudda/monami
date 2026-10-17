import { ClerkProvider } from "@clerk/nextjs"
import { frFR } from "@clerk/localizations"
import type { Metadata, Viewport } from "next"
import { Instrument_Sans, JetBrains_Mono, Plus_Jakarta_Sans, Young_Serif } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"
import "./oh.css"

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
})

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "OctoHandy — Gestion marketplace",
  description: "Gère tes boutiques, annonces et stock partagé avec l'agent OctoHandy.",
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
      localization={frFR}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
      // Clerk prod domain is clerk.amirelay.com. Do NOT set proxyUrl to the FAPI host.
    >
      <html lang="fr" className={`${jakarta.variable} ${jetbrainsMono.variable} ${youngSerif.variable} ${instrument.variable}`}>
        <body className="antialiased">
          {children}
          <Toaster richColors position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  )
}

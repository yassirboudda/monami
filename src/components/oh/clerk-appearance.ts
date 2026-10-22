// Clerk <SignIn>/<SignUp> themed to the warm MonAmi tokens (globals.css).
export const clerkAppearance = {
  variables: {
    colorPrimary: "#43302e",
    colorPrimaryForeground: "#fff1b5",
    colorForeground: "#43302e",
    colorMutedForeground: "#7a6461",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    borderRadius: "0.5rem",
    fontFamily: '"Chillax", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    cardBox: { boxShadow: "0 1px 2px rgba(67, 48, 46, 0.06)", border: "1px solid rgba(67, 48, 46, 0.13)" },
  },
}

/** Hosts whose Clerk instance has no Google OAuth credentials yet: hide the Google button instead of sending people to a Google 400. */
const HOSTS_WITHOUT_GOOGLE = ["try-ami.com"]

export function clerkAppearanceFor(host: string | null | undefined) {
  const h = (host || "").split(":")[0].toLowerCase()
  const noGoogle = HOSTS_WITHOUT_GOOGLE.some((d) => h === d || h.endsWith(`.${d}`))
  if (!noGoogle) return clerkAppearance
  return {
    ...clerkAppearance,
    elements: { ...clerkAppearance.elements, socialButtons: { display: "none" }, dividerRow: { display: "none" } },
  }
}

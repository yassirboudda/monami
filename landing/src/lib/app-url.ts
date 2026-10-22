// Where the real product lives (Clerk sign-in, dashboard) and the API used for live price estimates.
export const APP_URL = (import.meta.env["VITE_APP_URL"] as string | undefined) ?? "https://app.try-ami.com";
export const API_BASE = (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "https://octohandy.amirelay.com/backend";

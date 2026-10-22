import { cn } from "@/lib/utils";
import logo from "@/assets/monami-logo-silver.webp.asset.json";

// The monami silver wordmark supplied by the brand. On hover it gives a little spring bounce (see .monami-logo in styles.css).
export function MonamiLogo({ className }: { className?: string }) {
  return <img src={logo.url} alt="monami" className={cn("monami-logo w-auto object-contain", className)} />;
}

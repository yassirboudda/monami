import { cn } from "@/lib/utils";
import mascot from "@/assets/monami-m-silver.png.asset.json";

// The monami mascot: the silver "m" with its face, supplied by the brand.
export function Mascot({ className, float = false }: { className?: string; float?: boolean }) {
  return (
    <img
      src={mascot.url}
      alt=""
      aria-hidden
      className={cn("h-auto object-contain mascot-shadow", float && "mascot-float", className)}
    />
  );
}

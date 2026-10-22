import Image from "next/image"
import { BOX_SIZES } from "@/lib/oh-box-sizes"

/** A pre-rendered cardboard box from /public/monami/boxes. */
export function BoxImg({ name, alt = "", width, className, preload }: { name: string; alt?: string; width: number; className?: string; preload?: boolean }) {
  const [w, h] = BOX_SIZES[name] ?? [640, 480]
  return (
    <Image
      src={`/monami/boxes/${name}.webp`}
      alt={alt}
      width={width}
      height={Math.round((width * h) / w)}
      className={className}
      draggable={false}
      unoptimized
      preload={preload}
      loading={preload ? "eager" : undefined}
    />
  )
}

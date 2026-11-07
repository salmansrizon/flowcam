import Image from "next/image";

/** A real Studio screenshot (captured by `npm run capture:landing`) in a window frame. */
export function ProductShot({ src, alt, width = 2880, height = 1800, priority = false }: { src: string; alt: string; width?: number; height?: number; priority?: boolean }) {
  return (
    <figure className="tile overflow-hidden p-0 shadow-[0_20px_40px_-12px_rgb(14_27_43/0.25)]">
      <WindowBar />
      <Image src={src} alt={alt} width={width} height={height} sizes="(min-width: 768px) 36rem, 100vw" className="block h-auto w-full" priority={priority} />
    </figure>
  );
}

export function WindowBar() {
  return (
    <div aria-hidden className="flex items-center gap-1.5 border-b border-line bg-sky-50 px-3 py-2">
      <span className="size-2.5 rounded-full bg-[#f87171]" />
      <span className="size-2.5 rounded-full bg-[#fbbf24]" />
      <span className="size-2.5 rounded-full bg-[#34d399]" />
    </div>
  );
}

import Image from "next/image";

export default function Logo() {
  return (
    <a
      href="#top"
      className="group flex items-center gap-2.5"
      aria-label="Black Sheep Field — inicio"
    >
      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-primary/30 bg-black shadow-[0_0_20px_rgba(57,255,20,0.25)] transition-transform duration-300 group-hover:scale-105">
        <Image
          src="/brand/logo-mark.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 object-contain animate-[glow-pulse_2.4s_ease-in-out_infinite]"
          priority
        />
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-white">
        Black&nbsp;Sheep{" "}
        <span className="text-primary">Field</span>
      </span>
    </a>
  );
}

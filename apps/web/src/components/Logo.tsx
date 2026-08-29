import Image from "next/image";

/**
 * Logo real de Black Sheep.
 *
 * Antes había un cuadradito con las letras "BΣ" inventadas y un degradado.
 * El logo verdadero está en `public/logo-mark.svg` desde siempre: no hay
 * razón para dibujar uno falso.
 *
 * Sobre fondo oscuro se usa la versión transparente; el texto va en blanco
 * con "Field" en lima, que es la identidad de la plataforma (el naranja es
 * de KeyFoods, un tenant, y no corresponde acá).
 */
export default function Logo() {
  return (
    <a
      href="#top"
      className="group flex items-center gap-2.5"
      aria-label="Black Sheep Field — inicio"
    >
      <Image
        src="/logo-mark-transparent.svg"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 transition-transform duration-300 group-hover:scale-105"
        priority
      />
      <span className="font-display text-lg font-bold tracking-tight text-white">
        Black&nbsp;Sheep <span className="text-primary">Field</span>
      </span>
    </a>
  );
}

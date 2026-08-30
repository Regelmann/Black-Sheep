import Image from "next/image";

/**
 * Logo de Black Sheep — el archivo REAL.
 *
 * Historial de dos errores acá:
 *  1. Un cuadradito con las letras "BΣ" y un degradado, inventado.
 *  2. `logo-mark-transparent.svg`, que resultó ser un dibujo genérico de
 *     oveja en verde #16a34a — tampoco es el logo.
 *
 * El logo verdadero es la oveja con circuitos en lima fluorescente sobre
 * negro. Vive en `public/logo-mark-512.png`, derivado del master 1024.
 *
 * Se usa el PNG y no un SVG porque el logo tiene degradados y glow: un
 * trazado vectorial no lo reproduce.
 */
export default function Logo() {
  return (
    <a
      href="#top"
      className="group flex items-center gap-2.5"
      aria-label="Black Sheep — inicio"
    >
      <Image
        src="/logo-mark-512.png"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-xl transition-transform duration-300 group-hover:scale-105"
        priority
      />
      <span className="font-display text-lg font-bold tracking-tight text-white">
        Black&nbsp;Sheep <span className="text-primary">Field</span>
      </span>
    </a>
  );
}

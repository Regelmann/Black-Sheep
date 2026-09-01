"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Black Sheep] Error de la aplicación:", error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-soft font-display text-lg font-black text-white shadow-lg shadow-primary/30">
          BΣ
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-black text-white">
            Algo tropezó en el terreno
          </h1>
          <p className="text-sm leading-relaxed text-ink">
            Se produjo un error inesperado al cargar la página. Tu operación
            sigue a salvo — intenta recargar.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-soft active:scale-95"
          >
            <RotateCcw size={15} />
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-xl border border-line/80 bg-card/60 px-6 py-3 text-sm font-semibold text-mist/85 transition hover:bg-panel"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

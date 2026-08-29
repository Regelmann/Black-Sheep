"use client";

import { useEffect } from "react";
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
        <img src="/logo-mark-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-xl" />
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
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-[#0c0a09] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-soft active:scale-95"
          >
            <RotateCcw size={15} />
            Reintentar
          </button>
          <a
            href="/"
            className="rounded-xl border border-line/80 bg-card/60 px-6 py-3 text-sm font-semibold text-mist/85 transition hover:bg-panel"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Command, Search, X } from "lucide-react";
import PageLoader from "@/components/PageLoader";

const COMMANDS = [
  { label: "Ver el producto", href: "#producto", hint: "Explorar", keywords: "producto plataforma" },
  { label: "Cómo funciona", href: "#como-funciona", hint: "Flujo", keywords: "flujo proceso" },
  { label: "Calcular ROI", href: "#roi", hint: "Valor", keywords: "roi retorno valor" },
  { label: "Ver precios", href: "#precios", hint: "Planes", keywords: "precio planes" },
  { label: "Agendar una demo", href: "#demo", hint: "Hablar con nosotros", keywords: "demo contacto ventas" },
] as const;

function CommandLayer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = COMMANDS.filter((item) =>
    `${item.label} ${item.hint} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && filtered[active]) {
      event.preventDefault();
      go(filtered[active].href);
    }
  };

  return (
    <>
      <button type="button" aria-label="Abrir navegación rápida" onClick={() => setOpen(true)} className="fixed bottom-5 left-1/2 z-[80] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#11100f]/90 px-4 py-2.5 text-xs font-semibold text-white/70 shadow-2xl shadow-black/30 backdrop-blur-xl transition hover:border-white/20 hover:text-white sm:flex">
        <Command size={13} aria-hidden="true" />
        Explorar Black Sheep
        <kbd className="ml-1 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/45">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[10vh] backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Navegación rápida" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#151311] shadow-2xl shadow-black/50">
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
              <Search size={18} className="text-white/45" aria-hidden="true" />
              <input ref={inputRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKeyDown} placeholder="¿Qué quieres explorar?" aria-label="Buscar en Black Sheep" className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/35" />
              <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/5 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-2" role="listbox" aria-label="Resultados de navegación">
              {filtered.map((item, index) => (
                <button key={item.href} type="button" role="option" aria-selected={index === active} onMouseEnter={() => setActive(index)} onClick={() => go(item.href)} className={`group flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition ${index === active ? "bg-white/[0.07]" : "hover:bg-white/[0.05]"}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65"><ArrowRight size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{item.label}</span><span className="block text-xs text-white/40">{item.hint}</span></span>
                  <span className="text-xs text-white/25">↵</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-white/40">No encontramos esa acción todavía.</p>}
            </div>
            <div className="border-t border-white/10 px-5 py-3 text-[10px] font-medium tracking-widest text-white/25 uppercase">Black Sheep · experiencia comercial inteligente</div>
          </div>
        </div>
      )}
    </>
  );
}

export default function HomeShell({ children }: { children: ReactNode }) {
  return <PageLoader minMs={650}><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black">Saltar al contenido</a><CommandLayer />{children}</PageLoader>;
}

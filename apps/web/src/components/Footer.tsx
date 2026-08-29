import { Mail, MapPin } from "lucide-react";
import Logo from "@/components/Logo";

function LinkedinIcon(_props: { size?: number }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}

function InstagramIcon(_props: { size?: number }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const COLUMNS = [
  {
    title: "Producto",
    links: [
      { label: "Funciones", href: "#producto" },
      { label: "Cómo funciona", href: "#como-funciona" },
      { label: "Precios", href: "#precios" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Agenda una demo", href: "#demo" },
      { label: "Casos de éxito", href: "#demo" },
      { label: "Contacto", href: "#demo" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Política de privacidad", href: "#" },
      { label: "Términos de servicio", href: "#" },
      { label: "Tratamiento de datos", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative w-full border-t border-line/50 bg-navy-deep">
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-5">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-ink">
              Operación comercial para equipos en terreno. Ruta, precio y
              pedido — sincronizados en el bolsillo.
            </p>
            <p className="flex items-center gap-2 text-xs text-ink/70">
              <MapPin size={13} className="text-primary-soft" />
              Hecho en Santiago de Chile
            </p>
            <div className="flex items-center gap-3 pt-1">
              {[
                { icon: LinkedinIcon, label: "LinkedIn", href: "#" },
                { icon: InstagramIcon, label: "Instagram", href: "#" },
                { icon: Mail, label: "Correo", href: "#demo" },
              ].map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-line/60 text-ink transition-all hover:border-primary/50 hover:text-white"
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="font-display text-[11px] font-black tracking-[0.24em] text-white uppercase">
                {column.title}
              </h3>
              <ul className="mt-5 space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-ink transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-line/40 pt-8 sm:flex-row">
          <p className="text-xs text-ink/60">
            © {new Date().getFullYear()} Black Sheep SpA · Todos los derechos
            reservados.
          </p>
          <p className="font-display text-xs font-bold tracking-widest text-ink/50 uppercase">
            black-sheep.cl
          </p>
        </div>
      </div>
    </footer>
  );
}

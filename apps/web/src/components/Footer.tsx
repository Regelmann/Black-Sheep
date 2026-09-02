export default function Footer() {
  const year = new Date().getFullYear();
  const socials = [
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/black-sheep-field",
      icon: "in",
    },
    {
      label: "Instagram",
      href: "https://www.instagram.com/blacksheep.field",
      icon: "ig",
    },
    {
      label: "WhatsApp",
      href: "https://wa.me/56932188569",
      icon: "wa",
    },
  ];

  return (
    <footer className="border-t border-line bg-black px-6 pt-16 pb-10">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-display text-xl font-black tracking-tight text-white">
            Black Sheep <span className="text-primary">Field</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink">
            La plataforma de operación comercial para vendedores en terreno y
            gerencia. Ruta, precio y pedido — hecha en Chile, para el terreno
            chileno.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line/80 bg-panel/40 px-3.5 text-xs font-bold tracking-wide text-white transition hover:border-primary/50 hover:text-primary"
              >
                <span className="font-display text-[11px] uppercase opacity-70">
                  {s.icon}
                </span>
                {s.label}
              </a>
            ))}
          </div>
          <a
            href="mailto:hola@black-sheep.cl"
            className="mt-4 inline-block text-sm font-semibold text-ink transition hover:text-primary"
          >
            hola@black-sheep.cl
          </a>
        </div>

        <div className="md:col-span-2">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white uppercase">
            Producto
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink">
            <li><a href="#producto" className="hover:text-primary">Cómo funciona</a></li>
            <li><a href="#precios" className="hover:text-primary">Precios</a></li>
            <li><a href="#demo" className="hover:text-primary">Agendar demo</a></li>
            <li>
              <a href="https://app.black-sheep.cl" className="font-semibold text-white hover:text-primary">
                Entrar a la app →
              </a>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white uppercase">
            Empresa
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink">
            <li><a href="#terreno" className="hover:text-primary">Terreno</a></li>
            <li><a href="#gerencia" className="hover:text-primary">Gerencia</a></li>
            <li>
              <a
                href="https://wa.me/56932188569?text=Hola%2C%20quiero%20conocer%20Black%20Sheep%20Field"
                className="hover:text-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contacto
              </a>
            </li>
          </ul>
        </div>

        <div className="md:col-span-3">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white uppercase">
            Legal
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink">
            <li><a href="/privacidad" className="hover:text-primary">Privacidad</a></li>
            <li><a href="/terminos" className="hover:text-primary">Términos</a></li>
            <li><a href="/datos" className="hover:text-primary">Tratamiento de datos</a></li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-ink/80">
            Black Sheep Field es software B2B. Los nombres de locales en las
            demos son ilustrativos.
          </p>
        </div>
      </div>

      <div className="mx-auto mt-14 flex max-w-6xl flex-col gap-3 border-t border-line/60 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink">
          © {year} Black Sheep Field. Todos los derechos reservados.
        </p>
        <p className="text-xs text-ink/70">Hecho en Chile · Offline-first · Multi-tenant</p>
      </div>
    </footer>
  );
}

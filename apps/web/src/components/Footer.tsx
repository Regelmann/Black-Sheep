export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/[0.07] bg-[#030303] px-6 pt-20 pb-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 flex flex-col items-start justify-between gap-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-8 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-2xl font-black text-white">Ordená el terreno en 2 semanas</p>
            <p className="mt-2 max-w-md text-sm text-ink">Demo de 30 minutos. Sin compromiso. Si no encaja con tu operación, lo decimos.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="#demo" className="inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-black text-black shadow-[0_0_30px_rgba(57,255,20,0.3)] transition hover:brightness-110">Agendar demo</a>
            <a href="https://app.black-sheep.cl" className="inline-flex items-center rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-white transition hover:border-primary/40 hover:text-primary">Entrar a la app</a>
          </div>
        </div>
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="font-display text-xl font-black text-white">Black Sheep <span className="text-primary">Field</span></p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink">Software de operación comercial para distribución en Chile. Ruta, precio y pedido en el bolsillo del vendedor — y tablero en vivo para la gerencia.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ["LinkedIn", "https://www.linkedin.com/company/black-sheep-field"],
                ["Instagram", "https://www.instagram.com/blacksheep.field"],
                ["WhatsApp", "https://wa.me/56932188569"],
              ].map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-bold text-white/80 transition hover:border-primary/40 hover:text-primary">{label}</a>
              ))}
            </div>
            <a href="mailto:hola@black-sheep.cl" className="mt-4 inline-block text-sm font-semibold text-ink hover:text-primary">hola@black-sheep.cl</a>
          </div>
          <div className="md:col-span-2">
            <p className="text-[11px] font-bold tracking-[0.2em] text-white/90 uppercase">Producto</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink">
              <li><a href="#producto" className="hover:text-primary">Producto</a></li>
              <li><a href="#por-dentro" className="hover:text-primary">Por dentro</a></li>
              <li><a href="#precios" className="hover:text-primary">Precios</a></li>
              <li><a href="#demo" className="hover:text-primary">Demo</a></li>
              <li><a href="https://app.black-sheep.cl" className="font-semibold text-white hover:text-primary">Entrar →</a></li>
            </ul>
          </div>
          <div className="md:col-span-2">
            <p className="text-[11px] font-bold tracking-[0.2em] text-white/90 uppercase">Empresa</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink">
              <li><a href="#terreno" className="hover:text-primary">Terreno</a></li>
              <li><a href="#gerencia" className="hover:text-primary">Gerencia</a></li>
              <li><a href="https://wa.me/56932188569?text=Hola%20Black%20Sheep" target="_blank" rel="noopener noreferrer" className="hover:text-primary">Contacto</a></li>
            </ul>
          </div>
          <div className="md:col-span-3">
            <p className="text-[11px] font-bold tracking-[0.2em] text-white/90 uppercase">Legal</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink">
              <li><a href="/privacidad" className="hover:text-primary">Privacidad</a></li>
              <li><a href="/terminos" className="hover:text-primary">Términos</a></li>
              <li><a href="/datos" className="hover:text-primary">Datos</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-white/[0.06] pt-8 sm:flex-row sm:justify-between">
          <p className="text-xs text-white/40">© {year} Black Sheep Field. Todos los derechos reservados.</p>
          <p className="text-xs text-white/35">Hecho en Chile · Offline-first · Multi-tenant</p>
        </div>
      </div>
    </footer>
  );
}

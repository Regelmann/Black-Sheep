export default function Footer() {
  return (
    <footer
      /* 🔴 POR QUÉ EL FOOTER NO SE VEÍA
         No tenía fondo NI z-index. `DynamicBackground` es
         `fixed inset-0 z-0` y ocupa toda la ventana: el footer
         quedaba debajo del degradado y se leía como un vacío negro
         al final de la página.
         Con `relative z-10` sube por encima, y el fondo sólido lo
         separa visualmente del resto. */
      className="relative z-10 border-t border-line bg-[#050705] px-6 py-14"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:justify-between">
        <div>
          <p className="font-display text-lg font-bold text-white">
            Black Sheep <span className="text-primary">Field</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-ink">
            Ruta, precio y pedido en terreno. Hecho para el mercado chileno.
          </p>
          <a
            href="https://wa.me/56932188569"
            className="mt-4 inline-block text-sm font-bold text-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp +56 9 3218 8569
          </a>

          {/* Redes sociales. Faltaban por completo: una web B2B sin
              presencia social se lee como un proyecto, no como una
              empresa. Sólo el ícono — el nombre no aporta nada. */}
          <div className="mt-6 flex items-center gap-3">
            {[
              { n: "LinkedIn",  u: "https://www.linkedin.com/company/black-sheep-cl",
                d: "M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.25 8.25h4.5V24h-4.5V8.25zM8.5 8.25h4.3v2.15h.06c.6-1.13 2.06-2.32 4.24-2.32 4.54 0 5.38 2.98 5.38 6.86V24h-4.5v-7.1c0-1.7-.03-3.87-2.36-3.87-2.36 0-2.72 1.85-2.72 3.75V24H8.5V8.25z" },
              { n: "Instagram", u: "https://www.instagram.com/blacksheep.cl",
                d: "M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85C2.38 3.92 3.89 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4zm5.34-7.03a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0z" },
              { n: "YouTube",   u: "https://www.youtube.com/@blacksheep-cl",
                d: "M23.5 6.2a3 3 0 0 0-2.12-2.13C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.52A3 3 0 0 0 .5 6.2C0 8.07 0 12 0 12s0 3.93.5 5.8a3 3 0 0 0 2.12 2.13c1.88.52 9.38.52 9.38.52s7.5 0 9.38-.52a3 3 0 0 0 2.12-2.13C24 15.93 24 12 24 12s0-3.93-.5-5.8zM9.6 15.6V8.4l6.24 3.6-6.24 3.6z" },
            ].map((r) => (
              <a
                key={r.n}
                href={r.u}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={r.n}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/12 text-white/55 transition-colors hover:border-primary/60 hover:text-primary"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
                  <path d={r.d} />
                </svg>
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-10 text-sm">
          <div>
            <p className="font-bold text-white">Producto</p>
            <ul className="mt-3 space-y-2 text-ink">
              <li><a href="#precios" className="hover:text-primary">Precios</a></li>
              <li><a href="#demo" className="hover:text-primary">Demo</a></li>
              <li><a href="https://app.black-sheep.cl" className="hover:text-primary">Entrar a la app</a></li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-white">Legal</p>
            <ul className="mt-3 space-y-2 text-ink">
              <li><a href="/privacidad" className="hover:text-primary">Privacidad</a></li>
              <li><a href="/terminos" className="hover:text-primary">Términos</a></li>
              <li><a href="/datos" className="hover:text-primary">Tratamiento de datos</a></li>
            </ul>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-12 max-w-6xl text-xs text-ink">
        © {new Date().getFullYear()} Black Sheep Field. Todos los derechos reservados.
      </p>
    </footer>
  );
}

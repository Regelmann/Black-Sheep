export default function Footer() {
  return (
    <footer className="border-t border-line px-6 py-14">
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

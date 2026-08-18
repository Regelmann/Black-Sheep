<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KeyFoods · Lista de Precios Oficial</title>
<style>
  :root {
    --bg: #0a0b0d; --surface: #111316; --border: #1e2127; --border2: #2a2d35;
    --lime: #b8f03c; --lime-dim: #8ab82d; --red: #ff4545; --amber: #f59e0b;
    --blue: #60a5fa; --text: #f0f2f5; --muted: #6b7280; --muted2: #9ca3af;
    --brand: #c2410c; --brand-light: #ea580c;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text);
    font-family: Inter, system-ui, -apple-system, sans-serif;
    line-height: 1.5; min-height: 100vh; padding-bottom: 40px;
  }
  .header {
    background: linear-gradient(145deg, #1c1917 0%, #292524 70%, #44403c 100%);
    border-bottom: 3px solid var(--brand);
    padding: 24px 20px; text-align: center;
  }
  .header h1 { font-size: 1.5rem; font-weight: 800; color: #fff; }
  .header p { font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-top: 4px; }
  
  .container { max-width: 1200px; margin: 20px auto; padding: 0 16px; }
  
  .controls {
    display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;
  }
  @media(min-width: 768px) {
    .controls { flex-direction: row; justify-content: space-between; align-items: center; }
  }
  .search-box {
    flex: 1; background: var(--surface); border: 1px solid var(--border2);
    border-radius: 12px; padding: 10px 16px; color: var(--text); font-size: 0.95rem;
    outline: none; transition: border-color 0.2s;
  }
  .search-box:focus { border-color: var(--brand); }

  .filters {
    display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;
  }
  .filter-btn {
    background: var(--surface); border: 1px solid var(--border2); color: var(--muted2);
    padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;
    cursor: pointer; white-space: nowrap; transition: all 0.2s;
  }
  .filter-btn.active, .filter-btn:hover {
    background: var(--brand); border-color: var(--brand); color: #fff;
  }

  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
  }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px; display: flex; flex-direction: column; justify-content: space-between;
    transition: transform 0.2s, border-color 0.2s;
  }
  .card:hover { transform: translateY(-2px); border-color: var(--border2); }
  
  .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .badge {
    background: rgba(194, 65, 12, 0.15); color: #fdba74; font-size: 0.7rem;
    font-weight: 700; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;
  }
  .sku { font-size: 0.750rem; color: var(--muted); font-family: monospace; }

  .title { font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 8px; line-height: 1.3; }
  .brand-name { font-size: 0.8rem; color: var(--muted2); margin-bottom: 12px; }

  .pricing {
    border-top: 1px solid var(--border); padding-top: 10px;
    display: flex; justify-content: space-between; align-items: flex-end;
  }
  .price-main { font-size: 1.15rem; font-weight: 800; color: var(--lime); }
  .price-sub { font-size: 0.75rem; color: var(--muted2); text-align: right; }
  
  .details-row {
    font-size: 0.75rem; color: var(--muted2); display: flex; gap: 8px; margin-bottom: 8px;
  }
  .tag-info { background: var(--border); padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>

<div class="header">
  <h1>Catálogo y Lista de Precios</h1>
  <p>KeyFoods Field · Vigencia Agosto · Selección Profesional Foodservice</p>
</div>

<div class="container">
  <div class="controls">
    <input type="text" id="search" class="search-box" placeholder="Buscar por producto, marca o código SKU..." oninput="filtrarProductos()">
    <div class="filters" id="category-filters">
      <button class="filter-btn active" onclick="setCategory('Todos', this)">Todos</button>
      <button class="filter-btn" onclick="setCategory('Aceite', this)">Aceite</button>
      <button class="filter-btn" onclick="setCategory('Appetizer', this)">Appetizer</button>
      <button class="filter-btn" onclick="setCategory('Carne', this)">Carnes</button>
      <button class="filter-btn" onclick="setCategory('Cerdo', this)">Cerdo</button>
      <button class="filter-btn" onclick="setCategory('Hamburguesa', this)">Hamburguesas</button>
      <button class="filter-btn" onclick="setCategory('Panaderia', this)">Panadería</button>
      <button class="filter-btn" onclick="setCategory('Papas fritas', this)">Papas Fritas</button>
      <button class="filter-btn" onclick="setCategory('Pasteleria', this)">Pastelería</button>
      <button class="filter-btn" onclick="setCategory('Pollo', this)">Pollo</button>
      <button class="filter-btn" onclick="setCategory('Salsas y aderezos', this)">Salsas</button>
    </div>
  </div>

  <div class="grid" id="product-grid">
    </div>
</div>

<script>
  // Base de datos extraída directamente de la Lista de Precios de Agosto
  const productos = [
    { cat: "Aceite", marca: "Bacio", sku: "300917375", nombre: "ACEITE OLIVA EXT VIRGEN 1X5L", venta: "BIDON", caja: "2", kgCaja: "10,00 Kg", pUnit: "—", pCaja: "$81.000" },
    { cat: "Aceite", marca: "Bonanza", sku: "300914992", nombre: "ACEITE 100% MARAVILLA 1X5LT", venta: "BIDON", caja: "4", kgCaja: "20,00 Kg", pUnit: "$10.250", pCaja: "$41.000" },
    { cat: "Aceite", marca: "NEO", sku: "300917520", nombre: "ACEITE NEO PROFRY 1X5L", venta: "BIDON", caja: "4", kgCaja: "20,00 Kg", pUnit: "$9.750", pCaja: "$39.000" },
    { cat: "Appetizer", marca: "Audens", sku: "100914311", nombre: "AROS DE QUESO EMPANADOS 3X1KG", venta: "BOLSA", caja: "3", kgCaja: "3,00 Kg", pUnit: "$8.190", pCaja: "$24.570" },
    { cat: "Appetizer", marca: "Audens", sku: "100916080", nombre: "AROS DE CEBOLLA NAT REBZ 4X1KG", venta: "BOLSA", caja: "4", kgCaja: "4,00 Kg", pUnit: "$5.700", pCaja: "$22.800" },
    { cat: "Appetizer", marca: "Audens", sku: "100915323", nombre: "BITES DE GOUDA 3X1KG", venta: "CAJA", caja: "3", kgCaja: "3,00 Kg", pUnit: "$8.690", pCaja: "$26.070" },
    { cat: "Appetizer", marca: "Audens", sku: "100915733", nombre: "CHICKEN RINGS 1X1KG", venta: "BOLSA", caja: "3", kgCaja: "3,00 Kg", pUnit: "$7.590", pCaja: "$22.770" },
    { cat: "Appetizer", marca: "Audens", sku: "100915322", nombre: "CHILI CHEESE BITES 4X1KG", venta: "CAJA", caja: "4", kgCaja: "4,00 Kg", pUnit: "$7.500", pCaja: "$30.000" },
    { cat: "Appetizer", marca: "Audens", sku: "100915734", nombre: "POLLO ESTILO KENTUCKY 1X1KG", venta: "BOLSA", caja: "3", kgCaja: "3,00 Kg", pUnit: "$9.390", pCaja: "$28.170" },
    { cat: "Appetizer", marca: "McCain", sku: "100912441", nombre: "BASTON DE MOZZARELLA 3X2KG", venta: "UNIDAD", caja: "3", kgCaja: "6,00 Kg", pUnit: "$16.800", pCaja: "$50.400" },
    { cat: "Carne", marca: "JBS", sku: "100915757", nombre: "ENTRAÑA AMERICANA 30KG PROM", venta: "KILO", caja: "30", kgCaja: "30,00 Kg", pUnit: "$23.990", pCaja: "$719.700" },
    { cat: "Carne", marca: "JBS", sku: "100914209", nombre: "ENTRAÑA CHOICE CAB 27KG PROM", venta: "KILO", caja: "1", kgCaja: "25,00 Kg", pUnit: "$27.500", pCaja: "$687.500" },
    { cat: "Carne", marca: "JBS", sku: "100916252", nombre: "ENTRECOT CHOICE 30KG PROM", venta: "KILO", caja: "30", kgCaja: "30,00 Kg", pUnit: "$23.490", pCaja: "$704.700" },
    { cat: "Carne", marca: "JBS", sku: "100916253", nombre: "PUNTA DE GANSO CHOICE 32KG PROM", venta: "KILO", caja: "32", kgCaja: "32,00 Kg", pUnit: "$19.990", pCaja: "$639.680" },
    { cat: "Carne", marca: "La Favorita", sku: "100916260", nombre: "LOMO LISO CONG LF 15KG PROM", venta: "KILO", caja: "15", kgCaja: "15,00 Kg", pUnit: "$12.000", pCaja: "$180.000" },
    { cat: "Carne", marca: "Swift", sku: "100915350", nombre: "ASADO DE TIRA CHOICE 24KG PROM", venta: "KILO", caja: "24", kgCaja: "24,00 Kg", pUnit: "$16.500", pCaja: "$396.000" },
    { cat: "Cerdo", marca: "Sugardale", sku: "100913915", nombre: "TOCINO SUGARDALE REBAN 1X6,8KG", venta: "CAJA", caja: "1", kgCaja: "6,80 Kg", pUnit: "$60.520", pCaja: "$60.520" },
    { cat: "Cerdo", marca: "Swift", sku: "100916236", nombre: "TOCINO SWIFT BRONZE JBS 1x6,8 KG", venta: "CAJA", caja: "1", kgCaja: "6,80 Kg", pUnit: "$53.720", pCaja: "$53.720" },
    { cat: "Cerdo", marca: "Tonnies", sku: "100916137", nombre: "BABY BACK RIBS 20-24OZ", venta: "CAJA", caja: "1", kgCaja: "10,00 Kg", pUnit: "$55.000", pCaja: "$55.000" },
    { cat: "Hamburguesa", marca: "Audens", sku: "100914694", nombre: "CRUJIBURGER DE POLLO 1X1KG", venta: "BOLSA", caja: "3", kgCaja: "3,00 Kg", pUnit: "$7.890", pCaja: "$23.670" },
    { cat: "Hamburguesa", marca: "Karmac", sku: "100916098", nombre: "HAMBURGUESA VACUNO 32X113G KM", venta: "CAJA", caja: "1", kgCaja: "3,62 Kg", pUnit: "$23.468", pCaja: "$23.468" },
    { cat: "Lacteos", marca: "Tonadita", sku: "200912749", nombre: "QUESO CHEDDAR LAM 1X1,92 KG", venta: "DISPLAY", caja: "2", kgCaja: "3,84 Kg", pUnit: "$13.824", pCaja: "$27.648" },
    { cat: "Panaderia", marca: "Street Bakers", sku: "100913120", nombre: "PAN BRIOCHE 12CM C/SÉSA 36UN", venta: "CAJA", caja: "1", kgCaja: "3,60 Kg", pUnit: "$16.200", pCaja: "$16.200" },
    { cat: "Panaderia", marca: "Street Bakers", sku: "100913109", nombre: "PAN DE PAPA 12CM 1X36UN", venta: "CAJA", caja: "1", kgCaja: "3,60 Kg", pUnit: "$19.404", pCaja: "$19.404" },
    { cat: "Papas fritas", marca: "McCain", sku: "100912099", nombre: "P.F. SURECRISP 12MM 1X2,5KG", venta: "BOLSA", caja: "6", kgCaja: "15,00 Kg", pUnit: "$5.500", pCaja: "$33.000" },
    { cat: "Papas fritas", marca: "Onefry", sku: "100913843", nombre: "P.F. ONEFRY 9MM 1X2,5", venta: "BOLSA", caja: "6", kgCaja: "15,00 Kg", pUnit: "$4.000", pCaja: "$24.000" },
    { cat: "Pollo", marca: "Agrosuper", sku: "100915721", nombre: "PECHUGA DESH AGROSUP 10KG PROM", venta: "KILO", caja: "10", kgCaja: "10,00 Kg", pUnit: "$4.190", pCaja: "$41.900" },
    { cat: "Pollo", marca: "KEKRISPY", sku: "100916620", nombre: "CUBOS POLLO ASADO KEKRISPY 2KG", venta: "BOLSA", caja: "4", kgCaja: "8,00 Kg", pUnit: "$11.200", pCaja: "$44.800" },
    { cat: "Salsas y aderezos", marca: "Hanks", sku: "300917321", nombre: "BACON JAM HANKS 1X3,6L", venta: "BIDON", caja: "4", kgCaja: "14,40 Kg", pUnit: "$25.164", pCaja: "$100.656" },
    { cat: "Salsas y aderezos", marca: "Hanks", sku: "300917309", nombre: "COOL MAYO HANKS 1X3,6LT", venta: "BIDON", caja: "4", kgCaja: "14,40 Kg", pUnit: "$14.990", pCaja: "$59.962" },
    { cat: "Salsas y aderezos", marca: "Hanks", sku: "300917307", nombre: "HONEY MUSTARD HANKS 1X3,6L", venta: "BIDON", caja: "4", kgCaja: "14,40 Kg", pUnit: "$10.688", pCaja: "$42.754" },
    { cat: "Salsas y aderezos", marca: "Hanks", sku: "300917320", nombre: "KETCHUP HANKS 1X3,6L", venta: "BIDON", caja: "4", kgCaja: "14,40 Kg", pUnit: "$9.990", pCaja: "$39.960" },
    { cat: "Salsas y aderezos", marca: "Hanks", sku: "300917308", nombre: "SALSA BBQ HANKS 1X3,6LT", venta: "BIDON", caja: "4", kgCaja: "14,40 Kg", pUnit: "$12.989", pCaja: "$51.955" },
    { cat: "Salsas y aderezos", marca: "Hanks", sku: "300917306", nombre: "SALSA CHEDDAR HANKS 1X3,6L", venta: "BIDON", caja: "4", kgCaja: "14,40 Kg", pUnit: "$10.692", pCaja: "$42.768" }
  ];

  let categoriaActual = 'Todos';

  function renderProductos(lista) {
    const grid = document.getElementById('product-grid');
    if (!lista.length) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 40px;">No se encontraron productos con estos criterios.</div>';
      return;
    }

    grid.innerHTML = lista.map(p => `
      <div class="card">
        <div>
          <div class="card-top">
            <span class="badge">${p.cat}</span>
            <span class="sku">${p.sku}</span>
          </div>
          <div class="title">${p.nombre}</div>
          <div class="brand-name">Marca: <strong>${p.marca}</strong></div>
          <div class="details-row">
            <span class="tag-info">Formato: ${p.venta}</span>
            <span class="tag-info">Caja: ${p.kgCaja}</span>
          </div>
        </div>
        <div class="pricing">
          <div>
            <div style="font-size: 0.7rem; color: var(--muted2);">Precio Caja</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">${p.pCaja}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.7rem; color: var(--muted2);">Precio Unidad</div>
            <div class="price-main">${p.pUnit}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function setCategory(cat, btn) {
    categoriaActual = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtrarProductos();
  }

  function filtrarProductos() {
    const query = document.getElementById('search').value.toLowerCase();
    const filtrados = productos.filter(p => {
      const matchCat = (categoriaActual === 'Todos' || p.cat === categoriaActual);
      const matchText = p.nombre.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query) || p.marca.toLowerCase().includes(query);
      return matchCat && matchText;
    });
    renderProductos(filtrados);
  }

  // Inicializar grid al cargar
  renderProductos(productos);
</script>
</body>
</html>

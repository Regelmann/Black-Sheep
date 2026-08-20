<<<<<<< HEAD
# Black Sheep — sitio web (black-sheep.cl)

## Contenido
- `index.html` — landing V2 (producto, pantallas reales, precios UF)
- `login.html` — puerta multi-tenant → app Field
- `dashboard.html` — dashboard gerencial estático (opcional)
- `26879x.jpg` — capturas reales de la app
- `brand/` — logos

## Deploy Vercel (proyecto aparte del Field)

1. Root Directory: `apps/web`
2. Framework: Other
3. Build Command: (vacío)
4. Output Directory: `.`
5. Dominio: black-sheep.cl / www

## Config login → app

En `login.html` buscá:

```js
window.BS_APP_URL = "https://app.black-sheep.cl"
```

Poné la URL real del deploy Field (Vercel).

## Precios en la landing

- Starter UF 6 / Pro UF 15 (por empresa)
- Mensaje fuerte: **precio personalizado del cliente** (lista → histórico → negociado)
=======
# Black Sheep — sitio web (blacksheep.cl)

## Contenido
- `index.html` — landing V2 (producto, pantallas reales, precios UF)
- `login.html` — puerta multi-tenant → app Field
- `dashboard.html` — dashboard gerencial estático (opcional)
- `26879x.jpg` — capturas reales de la app
- `brand/` — logos

## Deploy Vercel (proyecto aparte del Field)

1. Root Directory: `apps/web`
2. Framework: Other
3. Build Command: (vacío)
4. Output Directory: `.`
5. Dominio: blacksheep.cl / www

## Config login → app

En `login.html` buscá:

```js
window.BS_APP_URL = "https://app.black-sheep.cl"
```

Poné la URL real del deploy Field (Vercel).

## Precios en la landing

- Starter UF 6 / Pro UF 15 (por empresa)
- Mensaje fuerte: **precio personalizado del cliente** (lista → histórico → negociado)
>>>>>>> 7fddd20b45eb471aea2ae4a884c5b0a96fe35320

# Deploy hoy — black-sheep.cl + app.black-sheep.cl

```
black-sheep.cl       →  WEB   (apps/web)     landing + login
app.black-sheep.cl   →  FIELD (apps/field)   app de terreno
```

Mismo repo GitHub. Dos proyectos Vercel.

## 1. Git push

```bash
cd ~/Black-Sheep/Black-Sheep
git add -A
git commit -m "Domains: black-sheep.cl + app.black-sheep.cl"
git push origin main
```

## 2. FIELD → app.black-sheep.cl

| Setting | Valor |
|---------|--------|
| Root Directory | `apps/field` |
| Install | `npm install --legacy-peer-deps --no-audit --no-fund` |
| Build | `npm run build` |
| Output | `dist` |
| Domain | **app.black-sheep.cl** |
| Protection | **Off** en Production |

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_BRAND=KEYFOODS`

## 3. WEB → black-sheep.cl

| Setting | Valor |
|---------|--------|
| Root Directory | `apps/web` |
| Build | vacío |
| Output | `.` |
| Domain | **black-sheep.cl** |
| Protection | **Off** |

login.html:
```js
window.BS_APP_URL = 'https://app.black-sheep.cl'
```

## 4. Probar

1. https://black-sheep.cl
2. /login → empresa + email
3. → https://app.black-sheep.cl/?email=...&tenant=keyfoods
4. Password → Hoy

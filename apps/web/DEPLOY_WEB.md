# Deploy web LANDO UX

```bash
cd ~/Black-Sheep/Black-Sheep
unzip -o "/c/Users/svargas/OneDrive - Nazar Corp/Descargas/BLACKSHEEP_WEB_LANDO_FINAL.zip" -d /tmp/bs-final
rm -rf apps/web/*
cp -a /tmp/bs-final/web/. apps/web/
cd apps/web && npm i && npm run build
cd ~/Black-Sheep/Black-Sheep
git add apps/web
git commit -m "Web LANDO final: capítulos, loader, WA, pricing UF"
git push
```

Vercel proyecto web → Root Directory `apps/web` → Production.

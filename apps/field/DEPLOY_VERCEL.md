# Deploy Vercel (arregla npm hang)

El error `Exit handler never called` = npm se colgó ~8 min y Vercel lo mató.
Casi siempre es **caché de build corrupta**.

## 1. Subí este zip a la raíz de Black-Sheep (main)

package.json + src/ + package-lock.json en la raíz (no en subcarpeta).

## 2. En Vercel → Project → Deployments

1. **Redeploy** del último commit
2. **Desmarcá** "Use existing Build Cache" / "Usar caché de build"
3. Deploy

O: Settings → General → **Clear Build Cache** (si existe) y redeploy.

## 3. Node

Settings → Node.js Version → **24.x**

## 4. Root Directory

Vacío (`.`).

## 5. Verificación

Login debe mostrar **v-FORCE-0814** y botón **Entrar** (no "Entrar al terreno").

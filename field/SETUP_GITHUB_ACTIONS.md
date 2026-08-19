# SETUP_GITHUB_ACTIONS.md
# KeyFoods — Ciclo automático con GitHub Actions
# Tiempo estimado de setup: 45 minutos (una sola vez)

## Qué hace esto

Todos los días hábiles a las 06:00 AM Chile, GitHub ejecuta el ciclo automáticamente:
1. Descarga los Excel de tu Google Drive
2. Corre KEYFOODS_CICLO_LIMPIO_v1.17.py
3. Sube los datos procesados a Supabase
4. Si falla → te manda un email de alerta

Sin Colab. Sin intervención manual. Los ejecutivos siempre tienen datos frescos.

---

## PASO 1 — Crear la Service Account de Google (20 min)

La Service Account le permite a GitHub leer tu Google Drive sin que tengas que logearte.

1. Ir a https://console.cloud.google.com
2. Seleccionar el proyecto `keyfoods-intelligence-hub`
3. Menú izquierdo → IAM y administración → Cuentas de servicio
4. Click "Crear cuenta de servicio"
   - Nombre: `keyfoods-github-actions`
   - ID: `keyfoods-github-actions`
   - Click Crear y continuar → Omitir → Listo
5. Click en la cuenta recién creada → pestaña Claves
6. Agregar clave → Crear clave nueva → JSON → Crear
7. Se descarga un archivo `.json`. **Guardarlo en un lugar seguro.**
8. Habilitar Google Drive API:
   - Menú → APIs y servicios → Habilitar APIs
   - Buscar "Google Drive API" → Habilitar

9. Compartir la carpeta de Drive con la Service Account:
   - Abrir Google Drive → ir a la carpeta `00_PRODUCCION_ACTIVA_R2`
   - Click derecho → Compartir
   - Pegar el email de la Service Account (ej: `keyfoods-github-actions@keyfoods-intelligence-hub.iam.gserviceaccount.com`)
   - Permiso: Lector → Enviar
   - **Copiar el ID de la carpeta** desde la URL: drive.google.com/drive/folders/**ESTE_ES_EL_ID**

---

## PASO 2 — Configurar los Secrets en GitHub (15 min)

Ir a tu repo en GitHub → Settings → Secrets and variables → Actions → New repository secret

Agregar estos 6 secrets:

| Nombre del Secret      | Valor                                                          |
|------------------------|----------------------------------------------------------------|
| `GDRIVE_SA_JSON`       | Contenido completo del archivo `.json` descargado (paso 1.7)  |
| `GDRIVE_FOLDER_ID`     | ID de la carpeta de Drive (paso 1.9)                           |
| `SUPABASE_URL`         | `https://ihhnfouwviuyycltgafc.supabase.co`                    |
| `SUPABASE_SERVICE_KEY` | Tu service_role key de Supabase (Settings → API)              |
| `GOOGLE_MAPS_API_KEY`  | Tu API key de Google Maps                                      |
| `MAIL_USER`            | Email Gmail para enviar alertas (ej: `keyfoods.bot@gmail.com`)|
| `MAIL_PASS`            | App Password de Gmail (no la contraseña normal)*              |
| `MAIL_ALERT_TO`        | Tu email donde recibir las alertas                            |

*Para el App Password de Gmail:
- Ir a myaccount.google.com → Seguridad → Verificación en 2 pasos (activar)
- Luego: Contraseñas de aplicaciones → Seleccionar app: Correo → Generar
- Copiar las 16 letras generadas

---

## PASO 3 — Verificar que funciona (10 min)

1. Ir a GitHub → Actions → "KeyFoods · Ciclo Diario"
2. Click "Run workflow" → Run workflow (con dry_run = false)
3. Esperar ~3 minutos
4. Click en el run para ver el log en tiempo real
5. Buscar en el log: `CICLO COMPLETADO` y los conteos de cartera/stock/prospectos

Si todo está verde → el ciclo corre automáticamente desde mañana.
Si falla → el log muestra exactamente en qué línea y por qué.

---

## Cómo correr manualmente cuando necesitás

Desde GitHub → Actions → "KeyFoods · Ciclo Diario" → Run workflow

Opciones disponibles:
- `force_places`: poner `true` una vez al mes para regenerar prospectos
- `dry_run`: poner `true` para testear sin escribir nada en Supabase

---

## Cómo actualizar los Excel

Los Excel los seguís subiendo a Google Drive como siempre.
El script los busca automáticamente por nombre (VENTAS*, STOCK*, MAESTRA*, etc.)
No hay que tocar nada más.

---

## Preguntas frecuentes

**¿Qué pasa si Drive no tiene Excel nuevos?**
El ciclo usa los que encuentre. Si VENTAS no cambió desde ayer, usa el de ayer.

**¿Cómo sé si corrió bien?**
- GitHub → Actions → verde = OK, rojo = falló + te llega email
- En la app: el banner "Datos al DD-MM" muestra la fecha de la última bajada

**¿Cuánto cuesta?**
GitHub Actions: gratis hasta 2000 minutos/mes (cada ciclo usa ~3 min → 60 ciclos/mes = 180 min).
Google Drive API: gratuita para este volumen.
Todo dentro del plan gratuito.

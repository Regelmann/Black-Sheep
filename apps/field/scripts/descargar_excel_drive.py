"""
descargar_excel_drive.py
Descarga los Excel de Keyfoods desde Google Drive a ./data/
Para usar en GitHub Actions con Service Account.
"""
import io, json, os, sys
from pathlib import Path

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
except ImportError:
    print("pip install google-api-python-client google-auth")
    sys.exit(1)

SCOPES     = ['https://www.googleapis.com/auth/drive.readonly']
DATA_DIR   = Path(os.environ.get('KF_DATA_DIR', 'data'))
FOLDER_ID  = os.environ.get('GDRIVE_FOLDER_ID', '').strip()
SA_JSON    = os.environ.get('GDRIVE_SA_JSON', '').strip()

# Palabras clave para identificar archivos relevantes
KEYWORDS = ['VENTAS', 'MAESTRA', 'STOCK', 'PRECIOS', 'CONFIGURACION', 'CONFIG', 'LISTA']

def main():
    if not SA_JSON:
        print("ERROR: GDRIVE_SA_JSON no definida"); sys.exit(1)
    if not FOLDER_ID:
        print("ERROR: GDRIVE_FOLDER_ID no definida"); sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    creds   = service_account.Credentials.from_service_account_info(
        json.loads(SA_JSON), scopes=SCOPES)
    service = build('drive', 'v3', credentials=creds, cache_discovery=False)

    # Listar xlsx en la carpeta
    results, token = [], None
    while True:
        r = service.files().list(
            q=f"'{FOLDER_ID}' in parents and trashed=false"
              f" and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
            fields="nextPageToken, files(id,name,modifiedTime)",
            pageToken=token, pageSize=50
        ).execute()
        results.extend(r.get('files', []))
        token = r.get('nextPageToken')
        if not token:
            break

    print(f"Drive: {len(results)} xlsx en carpeta {FOLDER_ID}")

    ok = 0
    for f in results:
        nombre = f['name']
        upper  = nombre.upper()
        if not any(k in upper for k in KEYWORDS):
            continue
        dest = DATA_DIR / nombre
        req  = service.files().get_media(fileId=f['id'])
        buf  = io.BytesIO()
        dl   = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = dl.next_chunk()
        dest.write_bytes(buf.getvalue())
        print(f"  ✓ {nombre}  ({f.get('modifiedTime','')[:10]})")
        ok += 1

    print(f"\nDescargados: {ok} archivos → {DATA_DIR.resolve()}")
    if ok == 0:
        print("ADVERTENCIA: Sin archivos. Revisá GDRIVE_FOLDER_ID y permisos de la Service Account.")

if __name__ == '__main__':
    main()

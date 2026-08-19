# =============================================================================
# KEYFOODS · PATCH media (fotos/fichas) → stock.imagen_url / ficha_url
# Versión: PATCH_STOCK_MEDIA_v1  ·  V56.16 Production Automated
# =============================================================================
# Convención de nombres (cualquiera de estas):
#   100914311.jpg
#   100914311.png
#   100914311_foto.webp
#   SKU_100914311.jpg
#   1009143110.jpg  (trailing 0 se normaliza igual que precios)
#
# Fuentes:
#   1) Carpeta local / Drive montado: KF_MEDIA_DIR
#   2) Supabase Storage bucket público: KF_MEDIA_BUCKET (default productos)
#   3) Prefijo URL pública: KF_MEDIA_PUBLIC_BASE
#
# Flujo:
#   lista archivos → extrae SKU del nombre → match stock.sku_canon → upsert URL
# =============================================================================
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Optional
from collections import defaultdict

VERSION = "PATCH_STOCK_MEDIA_v1"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
FICHA_EXT = {".pdf"}


def code_to_str(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        try:
            return str(int(round(v)))
        except Exception:
            return str(v).strip() or None
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "null"):
        return None
    if re.fullmatch(r"\d+\.0+", s):
        return s.split(".")[0]
    return s


def normalize_sku(v) -> Optional[str]:
    s = code_to_str(v)
    if not s:
        return None
    s = s.upper().strip()
    s = re.sub(r"C\d{4,}$", "", s)
    s = re.sub(r"[^0-9A-Z]", "", s)
    m = re.search(r"(\d{6,14})", s)
    if m:
        return m.group(1)
    return s or None


def digits_only(s: str) -> str:
    d = re.sub(r"\D", "", str(s or ""))
    return d.lstrip("0") or d


def sku_variants(sk: str) -> set:
    out = set()
    if not sk:
        return out
    s = str(sk).strip()
    out.add(s)
    d = digits_only(s)
    if d:
        out.add(d)
    t = d
    while len(t) > 6 and t.endswith("0"):
        t = t[:-1]
        out.add(t)
    if d and len(d) < 14:
        out.add(d + "0")
    if s.isdigit() and len(s) < 14:
        out.add(s + "0")
    return {x for x in out if x}


def sku_from_filename(name: str) -> Optional[str]:
    base = Path(name).stem
    # patrones comunes
    m = re.search(r"(?:SKU[_-]?)?(\d{6,14})", base, re.I)
    if m:
        return normalize_sku(m.group(1))
    m = re.search(r"(\d{6,14})", base)
    if m:
        return normalize_sku(m.group(1))
    return normalize_sku(base)


def supabase_client():
    url = os.environ.get("SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    try:
        from google.colab import userdata
        url = url or userdata.get("SUPABASE_URL") or ""
        key = key or userdata.get("SUPABASE_SERVICE_KEY") or ""
    except Exception:
        pass
    if not url or not key:
        raise SystemExit("Falta SUPABASE_URL / SUPABASE_SERVICE_KEY")
    from supabase import create_client
    return create_client(url, key)


def fetch_stock_skus(sb):
    rows, start = [], 0
    while True:
        chunk = (
            sb.table("stock")
            .select("sku_canon,imagen_url,ficha_url")
            .range(start, start + 999)
            .execute()
            .data or []
        )
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        start += 1000
    return rows


def build_stock_index(rows):
    """variant → sku_canon canónico en stock"""
    idx = {}
    for r in rows:
        sk = r.get("sku_canon")
        if not sk:
            continue
        for v in sku_variants(normalize_sku(sk) or sk):
            if v not in idx:
                idx[v] = sk
    return idx


def list_local_media(media_dir: Path):
    """Yield (kind, sku_norm, path, filename)"""
    if not media_dir.exists():
        return []
    out = []
    for p in media_dir.rglob("*"):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext in IMAGE_EXT:
            kind = "imagen"
        elif ext in FICHA_EXT:
            kind = "ficha"
        else:
            continue
        sk = sku_from_filename(p.name)
        if not sk:
            continue
        out.append((kind, sk, p, p.name))
    return out


def list_storage_media(sb, bucket: str, prefix: str = ""):
    """Lista objetos en bucket; retorna (kind, sku, path_in_bucket, name)"""
    out = []
    try:
        # list recursively by folders is limited; list root + common subfolders
        folders = [prefix or ""]
        seen = set()
        while folders:
            folder = folders.pop(0)
            if folder in seen:
                continue
            seen.add(folder)
            res = sb.storage.from_(bucket).list(folder or None)
            items = res if isinstance(res, list) else (res or [])
            for it in items:
                name = it.get("name") if isinstance(it, dict) else str(it)
                if not name:
                    continue
                # folder?
                meta = it.get("metadata") if isinstance(it, dict) else None
                id_ = it.get("id") if isinstance(it, dict) else None
                full = f"{folder}/{name}".lstrip("/") if folder else name
                if id_ is None and meta is None and "." not in name:
                    # likely folder
                    folders.append(full)
                    continue
                ext = Path(name).suffix.lower()
                if ext in IMAGE_EXT:
                    kind = "imagen"
                elif ext in FICHA_EXT:
                    kind = "ficha"
                else:
                    continue
                sk = sku_from_filename(name)
                if sk:
                    out.append((kind, sk, full, name))
    except Exception as e:
        print(f"  WARN storage list: {e}")
    return out


def public_url_for(path_or_url: str, base: Optional[str], bucket: Optional[str], sb=None) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    if base:
        return base.rstrip("/") + "/" + path_or_url.lstrip("/")
    if bucket and sb is not None:
        try:
            return sb.storage.from_(bucket).get_public_url(path_or_url)
        except Exception:
            pass
    return path_or_url


def main():
    print("=" * 70)
    print(VERSION)
    dry = os.environ.get("KF_DRY_RUN", "").strip().lower() in ("1", "true", "yes")
    overwrite = os.environ.get("KF_MEDIA_OVERWRITE", "").strip().lower() in ("1", "true", "yes")
    media_dir = os.environ.get("KF_MEDIA_DIR", "").strip()
    bucket = os.environ.get("KF_MEDIA_BUCKET", "").strip() or None
    public_base = os.environ.get("KF_MEDIA_PUBLIC_BASE", "").strip() or None

    if not media_dir and not bucket:
        # defaults útiles
        candidates = [
            Path("/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2/media"),
            Path("/content/drive/MyDrive/Keyfoods/media"),
            Path("/content/drive/MyDrive/Keyfoods/productos"),
        ]
        for c in candidates:
            if c.exists():
                media_dir = str(c)
                break
        if not media_dir and not bucket:
            print("  Sin KF_MEDIA_DIR ni KF_MEDIA_BUCKET.")
            print("  Ejemplo:")
            print('    os.environ["KF_MEDIA_DIR"] = "/content/drive/MyDrive/Keyfoods/media"')
            print('    os.environ["KF_MEDIA_BUCKET"] = "productos"')
            print('    os.environ["KF_MEDIA_PUBLIC_BASE"] = "https://....supabase.co/storage/v1/object/public/productos"')
            raise SystemExit("Configurá fuente de media")

    if dry:
        print("  MODE: DRY-RUN")
    if media_dir:
        print(f"  MEDIA DIR: {media_dir}")
    if bucket:
        print(f"  BUCKET: {bucket}")
    if public_base:
        print(f"  PUBLIC BASE: {public_base}")

    sb = supabase_client()
    stock = fetch_stock_skus(sb)
    print(f"  stock filas: {len(stock)}")
    idx = build_stock_index(stock)
    existing = {r["sku_canon"]: r for r in stock if r.get("sku_canon")}

    files = []
    if media_dir:
        files.extend(list_local_media(Path(media_dir)))
    if bucket:
        files.extend(list_storage_media(sb, bucket))

    print(f"  archivos media: {len(files)}")

    # preferir mejor match: por SKU canónico de stock
    by_sku = defaultdict(dict)  # sku_canon -> {imagen: url, ficha: url}
    unmatched_files = []
    for kind, sk_norm, path, name in files:
        canon = None
        for v in sku_variants(sk_norm):
            if v in idx:
                canon = idx[v]
                break
        if not canon:
            unmatched_files.append(name)
            continue
        if isinstance(path, Path):
            # local: necesita public_base o subir a storage
            if public_base:
                url = public_base.rstrip("/") + "/" + name
            elif bucket:
                # subir a storage
                try:
                    with open(path, "rb") as f:
                        data = f.read()
                    dest = f"{canon}{path.suffix.lower()}"
                    if not dry:
                        sb.storage.from_(bucket).upload(
                            dest, data, {"content-type": "image/jpeg" if kind == "imagen" else "application/pdf", "upsert": "true"}
                        )
                    url = public_url_for(dest, public_base, bucket, sb)
                except Exception as e:
                    print(f"  upload fail {name}: {e}")
                    continue
            else:
                unmatched_files.append(name + " (sin URL pública)")
                continue
        else:
            url = public_url_for(str(path), public_base, bucket, sb)

        by_sku[canon][kind] = url

    updates = []
    skipped_existing = 0
    for sku, media in by_sku.items():
        row = existing.get(sku) or {}
        payload = {"sku_canon": sku}
        changed = False
        if "imagen" in media:
            if overwrite or not (row.get("imagen_url") or "").strip():
                payload["imagen_url"] = media["imagen"]
                changed = True
            else:
                skipped_existing += 1
        if "ficha" in media:
            if overwrite or not (row.get("ficha_url") or "").strip():
                payload["ficha_url"] = media["ficha"]
                changed = True
        if changed:
            updates.append(payload)

    print("-" * 70)
    print(f"  SKUs con media match: {len(by_sku)}")
    print(f"  updates a escribir:   {len(updates)}")
    print(f"  ya tenían URL (skip): {skipped_existing}")
    if unmatched_files[:8]:
        print(f"  ej. archivos sin match SKU: {unmatched_files[:8]}")
    if updates[:5]:
        print("  ejemplos:")
        for u in updates[:5]:
            print(f"    {u.get('sku_canon')}: img={bool(u.get('imagen_url'))} ficha={bool(u.get('ficha_url'))}")

    if dry:
        print(f"  DRY-RUN: se habrían actualizado {len(updates)} filas")
        print("LISTO", VERSION, "(dry)")
        return

    if not updates:
        print("  Nada que actualizar")
        print("LISTO", VERSION)
        return

    ok = 0
    for i in range(0, len(updates), 50):
        batch = updates[i : i + 50]
        try:
            sb.table("stock").upsert(batch, on_conflict="sku_canon").execute()
            ok += len(batch)
        except Exception as e:
            print(f"  batch fail: {e}")
            for row in batch:
                try:
                    sb.table("stock").upsert([row], on_conflict="sku_canon").execute()
                    ok += 1
                except Exception as e2:
                    print(f"    fail {row.get('sku_canon')}: {e2}")
    print(f"  upsert media: {ok}")
    print("LISTO", VERSION)
    print("Verificá: select count(*) filter (where imagen_url is not null and imagen_url <> '') from stock;")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            print(e, file=sys.stderr)
            raise
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        raise

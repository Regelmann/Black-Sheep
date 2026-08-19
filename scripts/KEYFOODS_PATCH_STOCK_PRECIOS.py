# =============================================================================
# KEYFOODS · PATCH precios → stock (sin Places, sin ventas)
# Uso Colab: montá Drive, secrets SUPABASE_*, %run este script
# =============================================================================
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Optional

import pandas as pd

VERSION = "PATCH_STOCK_PRECIOS_v1"

def _s(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "null") else None

def _f(v) -> Optional[float]:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        return f if abs(f) > 1e-12 else None
    s = str(v).strip()
    if not s:
        return None
    s = re.sub(r"[$\s]", "", s)
    if re.search(r"\d\.\d{3},\d", s) or (s.count(".") >= 1 and s.count(",") == 1 and s.rfind(",") > s.rfind(".")):
        s = s.replace(".", "").replace(",", ".")
    elif re.search(r"\d,\d{3}\.\d", s):
        s = s.replace(",", "")
    elif s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    try:
        f = float(re.sub(r"[^\d.\-]", "", s) or 0)
        return f if abs(f) > 1e-12 else None
    except Exception:
        return None

def normalize_sku(v) -> Optional[str]:
    s = _s(v)
    if not s:
        return None
    s = s.upper().strip()
    s = re.sub(r"C\d{4,}$", "", s)
    s = re.sub(r"[^0-9A-Z]", "", s)
    m = re.search(r"(\d{6,12})", s)
    if m:
        return m.group(1)
    return s or None

def digits(s) -> str:
    d = re.sub(r"\D", "", str(s or ""))
    return d.lstrip("0") or d

def find_precios(data_dir: Path) -> Path:
    for pat in ["*PRECIOS*.xlsx", "*precios*.xlsx", "LISTA*.xlsx"]:
        hits = list(data_dir.glob(pat))
        if hits:
            hits.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return hits[0]
    raise SystemExit(f"No encontré lista de precios en {data_dir}")

def main():
    print("=" * 70)
    print(VERSION)
    data_dir = Path(os.environ.get("KF_DATA_DIR") or "/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2")
    path = find_precios(data_dir)
    print(f"  PRECIOS: {path}")

    raw = pd.read_excel(path)
    print(f"  columnas: {list(raw.columns)}")
    cols = {str(c).strip().upper(): c for c in raw.columns}

    def col(*names):
        for n in names:
            for k, orig in cols.items():
                if n in k or k == n:
                    return orig
        return None

    c_sku = col("CÓDIGO", "CODIGO", "SKU", "CODE")
    c_pu = col("PRECIO UNIDAD", "PRECIO UNITARIO")
    c_pc = col("PRECIO CAJA")
    c_pk = col("PRECIO KILO")
    c_desc = col("DESCRIPCION", "DESCRIPCIÓN", "PRODUCTO")
    if not c_sku:
        raise SystemExit(f"Sin columna código. Columnas={list(raw.columns)}")

    price_map = {}
    for _, r in raw.iterrows():
        sk = normalize_sku(r.get(c_sku))
        if not sk:
            continue
        pu = _f(r.get(c_pu)) if c_pu else None
        pc = _f(r.get(c_pc)) if c_pc else None
        pk = _f(r.get(c_pk)) if c_pk else None
        if not pu and not pc and not pk:
            continue
        price_map[sk] = {
            "precio_unidad": pu or pc or pk,
            "precio_caja": pc,
            "precio_kilo": pk,
            "producto_nombre": _s(r.get(c_desc)) if c_desc else None,
        }
    print(f"  precios parseados: {len(price_map)}")
    if not price_map:
        raise SystemExit("Ningún precio parseado — revisá el Excel")

    from supabase import create_client
    url = os.environ.get("SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    # Colab userdata
    try:
        from google.colab import userdata
        url = url or userdata.get("SUPABASE_URL")
        key = key or userdata.get("SUPABASE_SERVICE_KEY")
    except Exception:
        pass
    if not url or not key:
        raise SystemExit("Falta SUPABASE_URL / SUPABASE_SERVICE_KEY")

    sb = create_client(url, key)
    # fetch all stock (paginate)
    stock = []
    start = 0
    while True:
        chunk = sb.table("stock").select("sku_canon,producto_nombre,precio_unidad,precio_caja,precio_kilo").range(start, start + 999).execute().data or []
        stock.extend(chunk)
        if len(chunk) < 1000:
            break
        start += 1000
    print(f"  stock filas: {len(stock)}")

    updates = []
    matched = 0
    for row in stock:
        sk = normalize_sku(row.get("sku_canon")) or str(row.get("sku_canon") or "")
        meta = price_map.get(sk)
        if not meta:
            d = digits(sk)
            for ck, cv in price_map.items():
                if digits(ck) == d and d:
                    meta = cv
                    break
        if not meta:
            continue
        matched += 1
        updates.append({
            "sku_canon": row["sku_canon"],
            "precio_unidad": meta["precio_unidad"],
            "precio_caja": meta.get("precio_caja"),
            "precio_kilo": meta.get("precio_kilo"),
        })

    print(f"  match stock∩precios: {matched}/{len(stock)}")
    if not updates:
        print("  ejemplos stock:", [r.get("sku_canon") for r in stock[:5]])
        print("  ejemplos precios:", list(price_map.keys())[:5])
        raise SystemExit("Cero matches — los códigos SKU no coinciden")

    # upsert por lotes
    ok = 0
    for i in range(0, len(updates), 80):
        batch = updates[i : i + 80]
        sb.table("stock").upsert(batch, on_conflict="sku_canon").execute()
        ok += len(batch)
    print(f"  upsert precios: {ok}")
    print("LISTO", VERSION)
    print("Verificá: select count(*) filter (where coalesce(precio_unidad,0)>0) from stock;")

if __name__ == "__main__":
    main()

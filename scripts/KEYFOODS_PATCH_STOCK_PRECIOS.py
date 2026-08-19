# =============================================================================
# KEYFOODS · PATCH precios Excel → stock (Supabase)
# Versión: PATCH_STOCK_PRECIOS_v5  ·  V56.16 Production Automated
# =============================================================================
from __future__ import annotations

import csv
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

import pandas as pd

VERSION = "PATCH_STOCK_PRECIOS_v5"


def _s(v) -> Optional[str]:
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
    if re.search(r"\d\.\d{3},\d", s) or (
        s.count(".") >= 1 and s.count(",") == 1 and s.rfind(",") > s.rfind(".")
    ):
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


def code_to_str(v) -> Optional[str]:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        try:
            return str(int(round(v)))
        except Exception:
            return _s(v)
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
    if d and len(d) < 13:
        out.add(d + "00")
    return {x for x in out if x}


DEFAULT_DIRS = [
    "/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2",
    "/content/drive/MyDrive/Keyfoods",
    "/content/drive/MyDrive",
]


def _as_dir(p: Path) -> Path:
    return p.parent if p.is_file() else p


def _glob_precios(root: Path, recursive: bool = False):
    pats = [
        "*PRECIOS*.xlsx", "*precios*.xlsx", "LISTA*.xlsx",
        "*Lista*Precio*.xlsx", "*lista*precio*.xlsx", "*LISTA*PRECIO*.xlsx",
        "*PRECIOS*.xls", "LISTA*.xls",
    ]
    if not root.exists():
        return []
    hits = []
    for pat in pats:
        hits.extend(root.rglob(pat) if recursive else root.glob(pat))
    filtered = []
    for h in hits:
        if not h.is_file():
            continue
        low = str(h).lower()
        if "quarantine" in low or "cuarentena" in low or "/gold/" in low:
            continue
        filtered.append(h)
    uniq = {h.resolve(): h for h in filtered}
    out = list(uniq.values())
    out.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return out


def find_precios() -> Path:
    explicit = os.environ.get("KF_PRECIOS_XLSX") or os.environ.get("KF_PRECIOS_PATH")
    if explicit:
        p = Path(explicit).expanduser()
        if p.is_file() and p.suffix.lower() in (".xlsx", ".xls"):
            return p
        raise SystemExit(f"KF_PRECIOS_XLSX no es un Excel válido:\n  {explicit}")

    candidates = []
    if os.environ.get("KF_DATA_DIR"):
        candidates.append(_as_dir(Path(os.environ["KF_DATA_DIR"]).expanduser()))
    for d in DEFAULT_DIRS:
        candidates.append(Path(d))

    seen, searched = set(), []
    for root in candidates:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        searched.append(key)
        hits = _glob_precios(root, recursive=False)
        if not hits and root.exists():
            hits = [h for h in _glob_precios(root, recursive=True)
                    if len(h.relative_to(root).parts) <= 2]
        if hits:
            return hits[0]

    lines = ["No encontré lista de precios (.xlsx).", "", "Carpetas buscadas:"]
    for s in searched:
        exists = Path(s).exists()
        lines.append(f"  - {s}  {'OK' if exists else 'NO EXISTE'}")
    lines += [
        "",
        'os.environ["KF_PRECIOS_XLSX"] = "/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2/LISTA DE PRECIOS AGOSTO.xlsx"',
    ]
    raise SystemExit("\n".join(lines))


def _pick_col(cols, *names):
    for n in names:
        n = n.upper().strip()
        for k, orig in cols.items():
            if k == n or n in k:
                return orig
    return None


def load_price_map(path: Path) -> dict:
    raw = pd.read_excel(path)
    raw.columns = [str(c).strip() for c in raw.columns]
    print(f"  columnas: {list(raw.columns)}")
    cols = {str(c).strip().upper(): c for c in raw.columns}

    c_sku = _pick_col(cols, "CÓDIGO", "CODIGO", "SKU", "CODE", "COD")
    c_pu = _pick_col(cols, "PRECIO UNIDAD", "PRECIO UNITARIO", "P.UNIT", "UNITARIO")
    c_pc = _pick_col(cols, "PRECIO CAJA", "P.CAJA")
    c_pk = _pick_col(cols, "PRECIO KILO", "PRECIO KG", "P.KILO", "P KG", "KILO")
    c_desc = _pick_col(cols, "DESCRIPCION", "DESCRIPCIÓN", "PRODUCTO", "NOMBRE")
    c_marca = _pick_col(cols, "MARCA")
    c_cat = _pick_col(cols, "CATEGORÍA", "CATEGORIA", "SUBFAMILIA", "FAMILIA")
    c_uv = _pick_col(cols, "UNIDAD DE VENTA", "UNIDAD VENTA", "U.VENTA")

    if not c_sku:
        raise SystemExit(f"Sin columna Código/SKU. Columnas={list(raw.columns)}")

    print(f"  mapping: SKU={c_sku!r} | UNIDAD={c_pu!r} | CAJA={c_pc!r} | KILO={c_pk!r}")

    price_map = {}
    skipped = 0
    for _, r in raw.iterrows():
        sk = normalize_sku(r.get(c_sku))
        if not sk:
            continue
        pu = _f(r.get(c_pu)) if c_pu else None
        pc = _f(r.get(c_pc)) if c_pc else None
        pk = _f(r.get(c_pk)) if c_pk else None
        if not pu and not pc and not pk:
            skipped += 1
            continue
        price_map[sk] = {
            "precio_unidad": pu if pu else (pc if pc else pk),
            "precio_caja": pc,
            "precio_kilo": pk,
            "producto_nombre": _s(r.get(c_desc)) if c_desc else None,
            "marca": _s(r.get(c_marca)) if c_marca else None,
            "subfamilia": _s(r.get(c_cat)) if c_cat else None,
            "unidad_venta": _s(r.get(c_uv)) if c_uv else None,
            "_sku_lista": sk,
        }
    print(f"  precios parseados: {len(price_map)}  (sin precio: {skipped})")
    if not price_map:
        raise SystemExit("Ningún precio parseado")
    return price_map


def build_index(price_map: dict) -> dict:
    buckets = defaultdict(list)
    for sk, meta in price_map.items():
        for v in sku_variants(sk):
            buckets[v].append((len(sk), sk, meta))
    idx = {}
    for v, items in buckets.items():
        items.sort(key=lambda x: -x[0])
        idx[v] = items[0][2]
    return idx


def lookup(idx: dict, stock_sku: str):
    for v in sku_variants(stock_sku):
        if v in idx:
            return idx[v]
    d = digits_only(stock_sku)
    if len(d) < 7:
        return None
    best, best_score = None, 0
    for key, meta in idx.items():
        kd = digits_only(key)
        if len(kd) < 7:
            continue
        if kd.startswith(d) or d.startswith(kd):
            score = min(len(kd), len(d))
            if score > best_score:
                best_score, best = score, meta
    return best


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


def fetch_stock(sb):
    rows, start = [], 0
    while True:
        chunk = (
            sb.table("stock")
            .select("sku_canon,producto_nombre,precio_unidad,precio_caja,precio_kilo,marca,subfamilia,unidad_venta,stock_operativo,estado_stock")
            .range(start, start + 999)
            .execute()
            .data or []
        )
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        start += 1000
    return rows


def main():
    print("=" * 70)
    print(VERSION)
    dry = os.environ.get("KF_DRY_RUN", "").strip().lower() in ("1", "true", "yes")
    update_nombre = os.environ.get("KF_UPDATE_NOMBRE", "").strip().lower() in ("1", "true", "yes")
    insert_orphans = os.environ.get("KF_INSERT_ORPHANS", "").strip().lower() in ("1", "true", "yes")
    report_gaps = os.environ.get("KF_REPORT_GAPS", "").strip().lower() in ("1", "true", "yes")
    if dry:
        print("  MODE: DRY-RUN")
    if insert_orphans:
        print("  MODE: INSERT_ORPHANS")

    path = find_precios()
    print(f"  PRECIOS: {path}")
    price_map = load_price_map(path)
    idx = build_index(price_map)
    print(f"  índice variantes: {len(idx)}")

    sb = supabase_client()
    stock = fetch_stock(sb)
    print(f"  stock filas: {len(stock)}")

    updates, matched_examples, unmatched_stock = [], [], []
    matched_lista_skus = set()

    for row in stock:
        raw_sk = row.get("sku_canon")
        sk = normalize_sku(raw_sk) or str(raw_sk or "")
        meta = lookup(idx, sk)
        if not meta:
            unmatched_stock.append(str(raw_sk))
            continue
        matched_lista_skus.add(meta.get("_sku_lista") or "")
        payload = {
            "sku_canon": row["sku_canon"],
            "precio_unidad": meta["precio_unidad"],
            "precio_caja": meta.get("precio_caja"),
            "precio_kilo": meta.get("precio_kilo"),
        }
        if update_nombre and meta.get("producto_nombre") and not _s(row.get("producto_nombre")):
            payload["producto_nombre"] = meta["producto_nombre"]
        if meta.get("marca") and not _s(row.get("marca")):
            payload["marca"] = meta["marca"]
        if meta.get("subfamilia") and not _s(row.get("subfamilia")):
            payload["subfamilia"] = meta["subfamilia"]
        if meta.get("unidad_venta") and not _s(row.get("unidad_venta")):
            payload["unidad_venta"] = meta["unidad_venta"]
        updates.append(payload)
        if len(matched_examples) < 8:
            matched_examples.append((raw_sk, meta.get("_sku_lista"), meta["precio_unidad"]))

    orphan_lista = [sk for sk in price_map if sk not in matched_lista_skus]

    print("-" * 70)
    print(f"  match stock∩precios: {len(updates)}/{len(stock)}")
    print(f"  stock sin precio:    {len(unmatched_stock)}")
    print(f"  lista sin stock:     {len(orphan_lista)}")
    if matched_examples:
        print("  ejemplos match (stock ← lista = $unidad):")
        for a, b, p in matched_examples:
            print(f"    {a}  ←  {b}  =  ${p:,.0f}" if p else f"    {a} ← {b}")
    if unmatched_stock[:5]:
        print("  ej. stock sin match:", unmatched_stock[:5])
    if orphan_lista[:5]:
        print("  ej. lista sin stock:", orphan_lista[:5])

    if report_gaps:
        out_dir = Path(os.environ.get("KF_REPORT_DIR") or ".")
        out_dir.mkdir(parents=True, exist_ok=True)
        gap_path = out_dir / "KF_PRECIOS_GAPS.csv"
        with gap_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["tipo", "sku", "detalle"])
            for s in unmatched_stock:
                w.writerow(["stock_sin_precio", s, ""])
            for s in orphan_lista:
                meta = price_map.get(s) or {}
                w.writerow(["lista_sin_stock", s, meta.get("producto_nombre") or ""])
        print(f"  reporte gaps: {gap_path}")

    if not updates and not (insert_orphans and orphan_lista):
        print("  ejemplos stock:", [r.get("sku_canon") for r in stock[:5]])
        print("  ejemplos lista:", list(price_map.keys())[:5])
        raise SystemExit("Cero matches")

    if dry:
        print(f"  DRY-RUN: se habrían actualizado {len(updates)} filas")
        if insert_orphans:
            print(f"  DRY-RUN: se habrían insertado {len(orphan_lista)} huérfanos")
        print("LISTO", VERSION, "(dry)")
        return

    ok, errors = 0, 0
    for i in range(0, len(updates), 80):
        batch = updates[i : i + 80]
        try:
            sb.table("stock").upsert(batch, on_conflict="sku_canon").execute()
            ok += len(batch)
        except Exception as e:
            errors += 1
            print(f"  batch falló: {e}")
            for row in batch:
                try:
                    sb.table("stock").upsert([row], on_conflict="sku_canon").execute()
                    ok += 1
                except Exception as e2:
                    print(f"    fail {row.get('sku_canon')}: {e2}")

    print(f"  upsert precios: {ok}")

    if insert_orphans and orphan_lista:
        inserts = []
        for sk in orphan_lista:
            meta = price_map[sk]
            inserts.append({
                "sku_canon": sk,
                "producto_nombre": meta.get("producto_nombre") or sk,
                "marca": meta.get("marca"),
                "subfamilia": meta.get("subfamilia"),
                "unidad_venta": meta.get("unidad_venta"),
                "precio_unidad": meta.get("precio_unidad"),
                "precio_caja": meta.get("precio_caja"),
                "precio_kilo": meta.get("precio_kilo"),
                "stock_operativo": 0,
                "estado_stock": "SIN_STOCK",
            })
        ins_ok = 0
        for i in range(0, len(inserts), 50):
            batch = inserts[i : i + 50]
            try:
                sb.table("stock").upsert(batch, on_conflict="sku_canon").execute()
                ins_ok += len(batch)
            except Exception as e:
                print(f"  insert orphans batch: {e}")
        print(f"  insert huérfanos (stock 0): {ins_ok}")

    print("LISTO", VERSION)
    print("Verificá: select count(*) filter (where coalesce(precio_unidad,0)>0) from stock;")


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

# =============================================================================
# KEYFOODS · CICLO DE PRODUCCIÓN AUTOMATIZADO
# Versión: CICLO_PRODUCCION_v1  ·  V56.16
# =============================================================================
# Orquesta en orden:
#   1) Bajada Field (BigQuery → Supabase)     [opcional si KF_SKIP_BAJADA=1]
#   2) Patch precios Excel → stock
#   3) Patch media → stock.imagen_url
#   4) Health check (conteos + alertas)
#
# Uso Colab:
#   os.environ["KF_PRECIOS_XLSX"] = ".../LISTA DE PRECIOS AGOSTO.xlsx"
#   os.environ["KF_MEDIA_DIR"] = ".../media"   # opcional
#   %run KEYFOODS_CICLO_PRODUCCION.py
#
# Uso CI (GitHub Actions):
#   python scripts/KEYFOODS_CICLO_PRODUCCION.py
# =============================================================================
from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

VERSION = "CICLO_PRODUCCION_v1"

# Directorio de este script
HERE = Path(__file__).resolve().parent


def _run_module(path: Path, label: str) -> bool:
    print("\n" + "#" * 70)
    print(f"# {label}")
    print("#" * 70)
    if not path.exists():
        print(f"  SKIP: no existe {path}")
        return False
    # Ejecutar como script en el mismo proceso
    ns = {"__name__": "__main__", "__file__": str(path)}
    try:
        code = path.read_text(encoding="utf-8")
        exec(compile(code, str(path), "exec"), ns)
        print(f"  OK · {label}")
        return True
    except SystemExit as e:
        if e.code in (0, None):
            print(f"  OK · {label}")
            return True
        print(f"  FAIL · {label}: {e}")
        return False
    except Exception:
        traceback.print_exc()
        print(f"  FAIL · {label}")
        return False


def health_check() -> dict:
    print("\n" + "#" * 70)
    print("# HEALTH CHECK")
    print("#" * 70)
    url = os.environ.get("SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    try:
        from google.colab import userdata
        url = url or userdata.get("SUPABASE_URL") or ""
        key = key or userdata.get("SUPABASE_SERVICE_KEY") or ""
    except Exception:
        pass
    if not url or not key:
        print("  Sin credenciales Supabase — health skip")
        return {}

    from supabase import create_client
    sb = create_client(url, key)

    def count_filter(table, filt=None):
        q = sb.table(table).select("sku_canon", count="exact")
        # simple: fetch and count in python for compatibility
        rows, start = [], 0
        while True:
            chunk = (
                sb.table(table)
                .select("*")
                .range(start, start + 999)
                .execute()
                .data or []
            )
            rows.extend(chunk)
            if len(chunk) < 1000:
                break
            start += 1000
        return rows

    stock = count_filter("stock")
    total = len(stock)
    con_precio = sum(1 for r in stock if (r.get("precio_unidad") or 0) > 0)
    con_img = sum(1 for r in stock if (r.get("imagen_url") or "").strip())
    con_stock = sum(
        1
        for r in stock
        if (r.get("stock_operativo") or 0) > 0
        and (r.get("estado_stock") or "") not in ("SIN_STOCK", "VENCIDO")
    )
    sin_precio_con_stock = sum(
        1
        for r in stock
        if (r.get("stock_operativo") or 0) > 0
        and not (r.get("precio_unidad") or 0) > 0
    )

    stats = {
        "stock_total": total,
        "con_precio": con_precio,
        "con_imagen": con_img,
        "stock_operativo_ok": con_stock,
        "operativo_sin_precio": sin_precio_con_stock,
        "pct_precio": round(100 * con_precio / total, 1) if total else 0,
        "pct_imagen": round(100 * con_img / total, 1) if total else 0,
    }
    print(f"  stock total:            {stats['stock_total']}")
    print(f"  con precio_unidad:      {stats['con_precio']}  ({stats['pct_precio']}%)")
    print(f"  con imagen_url:         {stats['con_imagen']}  ({stats['pct_imagen']}%)")
    print(f"  stock operativo OK:     {stats['stock_operativo_ok']}")
    print(f"  operativo SIN precio:   {stats['operativo_sin_precio']}")

    alerts = []
    if stats["pct_precio"] < 50:
        alerts.append(f"ALERTA: solo {stats['pct_precio']}% del stock tiene precio")
    if stats["operativo_sin_precio"] > 10:
        alerts.append(
            f"ALERTA: {stats['operativo_sin_precio']} SKUs operativos sin precio de lista"
        )
    if stats["pct_imagen"] < 5 and stats["stock_total"] > 20:
        alerts.append("INFO: pocas imágenes cargadas — correr PATCH_STOCK_MEDIA")

    for a in alerts:
        print(f"  ⚠ {a}")
    if not alerts:
        print("  ✓ sin alertas críticas")

    return stats


def main():
    print("=" * 70)
    print(VERSION)
    print(f"  started: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    skip_bajada = os.environ.get("KF_SKIP_BAJADA", "").strip().lower() in ("1", "true", "yes")
    skip_precios = os.environ.get("KF_SKIP_PRECIOS", "").strip().lower() in ("1", "true", "yes")
    skip_media = os.environ.get("KF_SKIP_MEDIA", "").strip().lower() in ("1", "true", "yes")

    results = {}

    # 1) Bajada
    if skip_bajada:
        print("\n# BAJADA: skipped (KF_SKIP_BAJADA=1)")
        results["bajada"] = "skipped"
    else:
        bajada = HERE / "KEYFOODS_FIELD_BAJADA.py"
        if not bajada.exists():
            bajada = HERE / "KEYFOODS_FIELD_BAJADA_v8_14.py"
        results["bajada"] = "ok" if _run_module(bajada, "BAJADA Field") else "fail"

    # 2) Precios
    if skip_precios:
        print("\n# PRECIOS: skipped")
        results["precios"] = "skipped"
    else:
        precios = HERE / "KEYFOODS_PATCH_STOCK_PRECIOS.py"
        results["precios"] = "ok" if _run_module(precios, "PATCH PRECIOS") else "fail"

    # 3) Media (no falla el ciclo si no hay carpeta)
    if skip_media:
        print("\n# MEDIA: skipped")
        results["media"] = "skipped"
    else:
        media = HERE / "KEYFOODS_PATCH_STOCK_MEDIA.py"
        if media.exists() and (
            os.environ.get("KF_MEDIA_DIR")
            or os.environ.get("KF_MEDIA_BUCKET")
            or Path("/content/drive/MyDrive/Keyfoods/media").exists()
            or Path("/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2/media").exists()
        ):
            results["media"] = "ok" if _run_module(media, "PATCH MEDIA") else "fail"
        else:
            print("\n# MEDIA: skip (sin KF_MEDIA_DIR / bucket / carpeta media)")
            results["media"] = "skipped"

    # 4) Health
    stats = health_check()
    results["health"] = stats

    print("\n" + "=" * 70)
    print("RESUMEN CICLO")
    for k, v in results.items():
        if k == "health":
            continue
        print(f"  {k}: {v}")
    fails = [k for k, v in results.items() if v == "fail"]
    if fails:
        print(f"  FALLÓ: {fails}")
        print("LISTO", VERSION, "CON ERRORES")
        sys.exit(1)
    print("LISTO", VERSION)
    print("=" * 70)


if __name__ == "__main__":
    main()

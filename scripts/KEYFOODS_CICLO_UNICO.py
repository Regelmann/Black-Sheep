# =============================================================================
# KEYFOODS CICLO LIMPIO — UN SOLO SCRIPT CANÓNICO
# =============================================================================
# VERSION = CICLO_UNICO_v1.34_MIX
#
# Una corrida hace TODO:
#   1. Carga Excel (VENTAS, MAESTRA, STOCK, LISTA_PRECIOS) + opcional PRODUCTOS_MEDIA
#   2. Valida columnas (contrato v1)
#   3. Normaliza cliente_key / sku / zona
#   4. Ventas INCREMENTALES reales:
#        - Excel nuevo se SUMA a public.ventas_lineas (no reemplaza el mes)
#        - MTD / ciclo / gerencia se calculan sobre histórico + Excel
#        - KF_VENTAS_FULL_REPLACE=1 solo si querés pisar (pide KF_FORCE_VENTAS=1)
#   5. Calcula cartera: venta_mtd, estados, ciclo_dias (mediana gaps),
#      sku_detalle, oferta / pedido sugerido (catálogo × stock)
#   6. Stock + cobertura
#   7. Gerencia por zona/canal + NO_ASIGNADO
#   8. Prospectos Google Places (ZONAS_COMUNAS × SKU_FOCO_PLACES)
#   9. Publica snapshot a Supabase
#
# COLAB:
#   Secrets (llave): SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_MAPS_API_KEY
#   !pip install -q supabase openpyxl pandas requests
#   Subí los 4 Excel o montá Drive y ajustá PATHS abajo.
#   %run KEYFOODS_CICLO_LIMPIO.py
#
# FLAGS (opcional, antes del run):
#   os.environ["KF_SKIP_PLACES"] = "1"          # no llama Places
#   os.environ["KF_FORCE_PLACES"] = "1"         # regenera prospectos Places
#   os.environ["KF_SKIP_SUPABASE"] = "1"        # solo calcula y loguea
#   os.environ["KF_VENTAS_FULL_REPLACE"] = "1"  # no incremental, reemplaza
#   os.environ["KF_MES"] = "2026-08-01"         # mes MTD forzado
#   os.environ["KF_DATA_DIR"] = "/ruta/excel"   # prioritario (GitHub Actions / local)
#
# REGLA DE ORO — atribución de venta:
#   cliente_key → MAESTRA.EJECUTIVO/zona  (nunca VENDEDOR de la factura)
#   gerencia_clientes incluye TODA la maestra (venta_mtd=0 si no compró el mes)
#   PROVIDENCIA solo en NOR-PONIENTE
# =============================================================================

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
import traceback
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
VERSION = "CICLO_UNICO_v1.34_MIX"
print("=" * 72)
print(f"VERSION = {VERSION}")
print("Un solo script. Validar → Calcular → Metas → Places → Supabase.")
print("Atribución: MAESTRA (cliente→ejecutivo). Places auto-skip salvo KF_FORCE_PLACES=1.")
if _data_dir := (os.environ.get("KF_DATA_DIR") or "").strip():
    print(f"KF_DATA_DIR = {_data_dir}")
print("=" * 72)

# ---------------------------------------------------------------------------
# Dependencias
# ---------------------------------------------------------------------------
try:
    import pandas as pd
    import numpy as np
except ImportError as e:
    raise SystemExit("Falta pandas/numpy. En Colab: !pip install -q pandas openpyxl numpy") from e

try:
    import requests
except ImportError:
    requests = None  # Places opcional si falta

# ---------------------------------------------------------------------------
# PATHS — ajustar en Colab / local
# ---------------------------------------------------------------------------
# Orden de búsqueda de cada archivo (primer hit gana)
# KF_DATA_DIR primero (Actions / carpeta local); luego Colab Drive
_data_dir = (os.environ.get("KF_DATA_DIR") or "").strip()
SEARCH_DIRS = (
    [Path(_data_dir)] if _data_dir else []
) + [
    Path("/content"),
    Path("/content/drive/MyDrive/Keyfoods"),
    Path("/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2"),
    Path("/content/drive/MyDrive/Keyfoods/00_PRODUCCION_ACTIVA_R2/excel"),
    Path("/home/workdir/attachments"),
    Path("."),
]
SEARCH_DIRS = [d for d in SEARCH_DIRS if d]

VENTAS_GLOBS = ["VENTAS_KEYFOODS_ACTUAL.xlsx", "VENTAS*.xlsx", "*VENTAS*.xlsx"]
MAESTRA_GLOBS = ["MAESTRA_CLIENTES_ACTUAL.xlsx", "MAESTRA*.xlsx", "*MAESTRA*.xlsx"]
STOCK_GLOBS = [
    "Detalle_Stock_Diario*.xlsx",
    "*Detalle*Stock*.xlsx",
    "STOCK_ACTUAL_CONVERTIDO.xlsx",
    "STOCK*.xlsx",
    "*STOCK*.xlsx",
]
# API JSON en vivo (Flint Reportero). Override: os.environ["KF_STOCK_URL"]
STOCK_API_URL = os.environ.get(
    "KF_STOCK_URL",
    "https://flint-reportero.vercel.app/api/stock-diario",
).strip()
PRECIOS_GLOBS = ["LISTA DE PRECIOS AGOSTO.xlsx", "*PRECIOS*.xlsx", "*precios*.xlsx", "LISTA*.xlsx"]
# Media por SKU (opcional): foto + ficha + reseña. Una fila por sku_canon.
MEDIA_GLOBS = [
    "PRODUCTOS_MEDIA.xlsx", "PRODUCTOS_MEDIA.csv",
    "*PRODUCTOS_MEDIA*", "*MEDIA_SKU*", "media_sku.csv",
]
ZONAS_GLOBS = ["ZONAS_COMUNAS.xlsx", "ZONAS_COMUNAS.csv", "config/ZONAS_COMUNAS.csv"]
FOCO_GLOBS = ["SKU_FOCO_PLACES.xlsx", "SKU_FOCO_PLACES.csv", "config/SKU_FOCO_PLACES.csv"]
CONFIG_GLOBS = [
    "KEYFOODS_CONFIGURACION_MENSUAL_*.xlsx",
    "KEYFOODS_CONFIGURACION_MENSUAL*.xlsx",
    "*CONFIGURACION*MENSUAL*.xlsx",
    "CONFIG_MES.xlsx",
]

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
_sp = (os.environ.get("KF_SKIP_PLACES") or "auto").strip().lower()
SKIP_PLACES = _sp in ("1", "true", "yes")
SKIP_PLACES_AUTO = _sp in ("", "auto")  # default: no re-buscar Places si ya hay data
SKIP_SUPABASE = os.environ.get("KF_SKIP_SUPABASE", "").strip() in ("1", "true", "True")
VENTAS_FULL_REPLACE = os.environ.get("KF_VENTAS_FULL_REPLACE", "").strip() in ("1", "true", "True")
FORCE_VENTAS = os.environ.get("KF_FORCE_VENTAS", "").strip() in ("1", "true", "True")  # permite FULL_REPLACE o MTD a la baja
FORCE_MAESTRA = os.environ.get("KF_FORCE_MAESTRA", "").strip() in ("1", "true", "True")  # permite maestra con menos clientes que snapshot previo
MES_FORCE = os.environ.get("KF_MES", "").strip() or None  # "YYYY-MM-01"

# ---------------------------------------------------------------------------
# Alias de columnas (CONTRATO_v1)
# ---------------------------------------------------------------------------
def _norm_col(c: Any) -> str:
    s = str(c or "").strip().upper()
    s = re.sub(r"\s+", " ", s)
    return s


VENTAS_ALIAS = {
    "cliente_key": ["CODIGO", "COD CLIENTE", "CLIENTE_KEY", "RUT", "COD. CLIENTE"],
    "nombre_cliente": ["NOMBRE", "RAZON SOCIAL", "NOMBRE_CLIENTE"],
    "tipo_doc": ["TIPO", "TIPO_DOCUMENTO"],
    "numero_doc": ["NUMERO", "NUMERO_DOCUMENTO", "FOLIO"],
    "fecha": ["FECHA", "FECHA_DOC", "FECHA FACTURA"],
    "vendedor_raw": ["VENDEDOR", "EJECUTIVO", "VENDEDOR_ORIGEN"],
    "sku_raw": ["SOURCE CODE", "SKU", "CODIGO PRODUCTO", "COD_PRODUCTO"],
    "producto_nombre": ["PRODUCTO", "PRODUCTO_NOMBRE", "DESCRIPCION"],
    "cantidad": ["CANTIDAD", "CANT", "CANTIDAD_UNIDAD"],
    "precio_unit": ["PRECIO", "PRECIO_UNIT", "PRECIO UNITARIO"],
    "venta_neta_clp": ["NETO", "VENTA_NETA", "VENTA_NETA_CLP", "TOTAL"],
    "direccion_venta": ["DOMICILIO", "DIRECCION", "DIRECCION_ORIGEN"],
    "comuna_venta": ["COMUNA", "COMUNA_ORIGEN"],
}

# En ventas hay DOS columnas "CODIGO": cliente y producto. Se resuelven por posición.
MAESTRA_ALIAS = {
    "cliente_key": ["COD CLIENTE", "CODIGO CLIENTE", "CLIENTE_KEY", "COD. CLIENTE"],
    "rut": ["RUT", "RUT COMESA"],
    "razon_social": ["RAZON SOCIAL", "RAZÓN SOCIAL"],
    "nombre_comercial": ["NOMBRE COMERCIAL", "NOMBRE_COMERCIAL"],
    "rubro": ["AGCNC", "RUBRO", "CATEGORIA"],
    "ejecutivo_raw": ["EJECUTIVO", "ZONA", "VENDEDOR"],
    "direccion": ["DIRECCION", "DIRECCIÓN"],
    "comuna": ["COMUNA"],
    "region": ["REGION", "REGIÓN"],
    "telefono": ["TELEFONO", "TELÉFONO", "FONO"],
    "email": ["CORREO", "EMAIL", "MAIL"],
    "persona_contacto": ["PERSONA CONTACTO", "CONTACTO"],
}

STOCK_ALIAS = {
    "sku_canon": ["CODIGO SKU KL", "CODIGO", "SKU", "CODIGO SKU"],
    "descripcion": ["DESCRIPCION KL", "DESCRIPCION", "DESCRIPCIÓN"],
    "stock_total": ["TOTAL", "STOCK TOTAL", "STOCK"],
}

PRECIOS_ALIAS = {
    "sku_canon": ["CÓDIGO", "CODIGO", "SKU", "CODIGO SKU", "CODIGO PRODUCTO", "COD. PRODUCTO", "CODE"],
    "categoria": ["CATEGORÍA", "CATEGORIA"],
    "marca": ["MARCA"],
    "descripcion": ["DESCRIPCION", "DESCRIPCIÓN", "PRODUCTO"],
    "unidad_venta": ["UNIDAD DE VENTA", "UNIDAD"],
    "unidades_caja": ["UNIDADES POR CAJA"],
    "kg_unidad": ["KILOGRAMOS POR UNIDAD", "KG UNIDAD"],
    "kg_caja": ["KILOGRAMOS POR CAJA", "KG CAJA"],
    "precio_kilo": ["PRECIO KILO"],
    "precio_caja": ["PRECIO CAJA"],
    "precio_unidad": ["PRECIO UNIDAD", "PRECIO UNITARIO", "PRECIO"],
    "imagen_url": ["IMAGEN", "IMAGEN_URL", "FOTO", "FOTO_URL", "IMAGE", "URL_IMAGEN"],
    "resena": ["RESENA", "RESEÑA", "DESCRIPCION_CORTA", "DESCRIPCIÓN CORTA", "COPY"],
    "ficha_url": ["FICHA", "FICHA_URL", "FICHA TECNICA", "FICHA TÉCNICA", "URL_FICHA", "PDF"],
}

# ---------------------------------------------------------------------------
# Zona / canal
# ---------------------------------------------------------------------------
ZONA_RULES = [
    (r"NOR[-\s]?ORIENTE", "NOR-ORIENTE"),
    (r"NOR[-\s]?PONIENTE", "NOR-PONIENTE"),
    (r"ZONA\s*SUR", "ZONA SUR"),
    (r"TELEVENTA", "TELEVENTA"),
    (r"\bKAM\b", "KAM"),
    (r"CORPORATIVO", "CORPORATIVO"),
    (r"JEFE\s*DE\s*VENTAS", "JEFE DE VENTAS"),
    (r"\bCOMESA\b", "COMESA"),
    (r"VENDEDOR\s*01", "VENDEDOR_01"),
    (r"SUB\s*GTE", "SUB_GERENCIA"),
    (r"ABASTECIMIENTO", "ABASTECIMIENTO"),
    (r"NING[UÚ]N\s*EMPLEADO", "NO_ASIGNADO"),
    (r"NO\s*ASIGN", "NO_ASIGNADO"),
]

ZONAS_TERRENO = {"NOR-ORIENTE", "NOR-PONIENTE", "ZONA SUR"}

# Comunas default si no hay archivo de config (RM)
DEFAULT_ZONAS_COMUNAS = {
    # Fuente: ZONAS_COMUNAS.csv de producción
    "NOR-ORIENTE": [
        "LAS CONDES", "VITACURA", "LO BARNECHEA", "LA REINA",
        "PEÑALOLEN", "SAN BERNARDO", "PUENTE ALTO",
    ],
    "NOR-PONIENTE": [
        "ÑUÑOA", "NUNOA", "PROVIDENCIA", "RECOLETA", "INDEPENDENCIA",
        "HUECHURABA", "QUILICURA", "RENCA", "CONCHALI", "COLINA", "LAMPA",
        "CERRO NAVIA", "QUINTA NORMAL", "SANTIAGO",
    ],
    "ZONA SUR": [
        "LA FLORIDA", "MAIPU", "SAN MIGUEL", "SAN JOAQUIN",
        "EL BOSQUE", "LA CISTERNA", "PAINE", "PIRQUE",
    ],
}

# Categoría catálogo → Places (fallback)
CATEGORIA_TO_PLACES = {
    "HAMBURGUESA": ("restaurant|meal_takeaway", "hamburguesa burger"),
    "CARNE": ("restaurant|meal_takeaway", "parrilla restaurant"),
    "CERDO": ("restaurant|meal_takeaway", "restaurant"),
    "POLLO": ("restaurant|meal_takeaway", "pollo chicken"),
    "PAPAS FRITAS": ("restaurant|meal_takeaway", "restaurant papas"),
    "SALSAS Y ADEREZOS": ("restaurant|meal_takeaway", "burger sandwich"),
    "PANADERIA": ("bakery|cafe", "panaderia cafe"),
    "PASTELERIA": ("bakery|cafe", "pasteleria"),
    "ACEITE": ("restaurant", "restaurant"),
    "APPETIZER": ("restaurant|meal_takeaway", "restaurant"),
    "LACTEOS": ("restaurant|cafe", "restaurant"),
}

# ---------------------------------------------------------------------------
# Utils
# ---------------------------------------------------------------------------
def _c(v: Any) -> Any:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    if pd.isna(v):
        return None
    return v


def _s(v: Any) -> Optional[str]:
    v = _c(v)
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("nan", "none", "null", "(blank)") else None


def _f(v: Any) -> Optional[float]:
    """Parsea números: 1234.5 | 1.234,56 (CL) | 1,234.56 (US) | $1.250"""
    v = _c(v)
    if v is None:
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        return f if abs(f) > 1e-12 else None
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "null", "-"):
        return None
    s = re.sub(r"[$\s]", "", s)
    # 1.234,56 (CL) → 1234.56
    if re.search(r"\d\.\d{3},\d", s) or (s.count(".") >= 1 and s.count(",") == 1 and s.rfind(",") > s.rfind(".")):
        s = s.replace(".", "").replace(",", ".")
    # 1,234.56 (US)
    elif re.search(r"\d,\d{3}\.\d", s):
        s = s.replace(",", "")
    else:
        # solo coma decimal
        if s.count(",") == 1 and s.count(".") == 0:
            s = s.replace(",", ".")
    try:
        f = float(re.sub(r"[^\d.\-]", "", s) or 0)
        return f if abs(f) > 1e-12 else None
    except Exception:
        return None


def _i(v: Any) -> Optional[int]:
    f = _f(v)
    return int(round(f)) if f is not None else None


def normalize_cliente_key(v: Any) -> Optional[str]:
    s = _s(v)
    if not s:
        return None
    s = s.upper().replace(" ", "")
    # 78437630-C / 78437630C / 77878267-C
    return s


def normalize_sku(v: Any) -> Optional[str]:
    s = _s(v)
    if not s:
        return None
    s = s.upper().strip()
    # Quitar sufijos tipo C00762 pegados
    s = re.sub(r"C\d{4,}$", "", s)
    s = re.sub(r"[^0-9A-Z]", "", s)
    # Preferir bloque numérico largo
    m = re.search(r"(\d{6,12})", s)
    if m:
        return m.group(1)
    return s or None


def normalize_zona(raw: Any) -> str:
    """Canal canónico. Maestra.EJECUTIVO es la fuente de verdad para atribución."""
    s = _s(raw)
    if not s:
        return "NO_ASIGNADO"
    u = s.upper().strip()
    for pat, zona in ZONA_RULES:
        if re.search(pat, u, re.I):
            return zona
    CANALES_OK = ZONAS_TERRENO | {
        "TELEVENTA", "KAM", "OTROS", "NO_ASIGNADO", "CORPORATIVO",
        "JEFE DE VENTAS", "COMESA", "ABASTECIMIENTO", "SUB_GERENCIA",
    }
    if u in CANALES_OK:
        return u
    # No promover VENDEDOR_xx de factura a canal de gerencia
    if re.match(r"VENDEDOR", u):
        return "NO_ASIGNADO"
    return "OTROS"


def find_file(globs: List[str]) -> Optional[Path]:
    for d in SEARCH_DIRS:
        if not d.exists():
            continue
        for g in globs:
            hits = list(d.glob(g))
            # recursive ** if plain glob empty
            if not hits and "**" not in g:
                hits = list(d.glob("**/" + g))
            hits = [h for h in hits if h.is_file() and not h.name.startswith("~")]
            if hits:
                hits.sort(key=lambda p: p.stat().st_mtime, reverse=True)
                return hits[0]
    return None


def map_columns(df: pd.DataFrame, alias: Dict[str, List[str]], required: List[str]) -> Tuple[pd.DataFrame, Dict[str, str]]:
    cols = {_norm_col(c): c for c in df.columns}
    mapping = {}
    for canon, aliases in alias.items():
        for a in aliases:
            key = _norm_col(a)
            if key in cols:
                mapping[canon] = cols[key]
                break
    missing = [r for r in required if r not in mapping]
    if missing:
        raise ValueError(f"Faltan columnas {missing}. Disponibles: {list(df.columns)}")
    out = pd.DataFrame()
    for canon, src in mapping.items():
        out[canon] = df[src]
    return out, mapping


def parse_fecha_series(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, dayfirst=True, errors="coerce")


def median_gaps_days(dates: List[date]) -> Optional[int]:
    """Mediana de días entre compras sucesivas (ciclo real)."""
    ds = sorted({d for d in dates if d})
    if len(ds) < 2:
        return None
    gaps = [(ds[i] - ds[i - 1]).days for i in range(1, len(ds))]
    gaps = [g for g in gaps if 1 <= g <= 365]
    if not gaps:
        return None
    gaps.sort()
    mid = len(gaps) // 2
    if len(gaps) % 2:
        return int(gaps[mid])
    return int(round((gaps[mid - 1] + gaps[mid]) / 2))




# ===== RIESGO DE FUGA (integrado — un solo archivo) =====
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        n = float(v)
        if n != n:  # NaN
            return default
        return n
    except Exception:
        return default


def _parse_sku_detalle(raw: Any) -> List[dict]:
    """
    Formato histórico coach:
      nombre|prom|mtd|falta|promClp|clpMtd|ultima|ciclo|n|estado|dias
    Varias líneas separadas por \\n o ;
    """
    if raw is None:
        return []
    text = str(raw).strip()
    if not text:
        return []
    out = []
    for line in re.split(r"[\n;]+", text):
        line = line.strip()
        if not line or "|" not in line:
            continue
        p = line.split("|")
        # pad
        while len(p) < 11:
            p.append("")
        try:
            out.append(
                {
                    "nombre": p[0].strip(),
                    "prom": _num(p[1]),
                    "mtd": _num(p[2]),
                    "promClp": _num(p[4]),
                    "clpMtd": _num(p[5]),
                    "ultima": p[6].strip() or None,
                    "cicloDias": _num(p[7]) or None,
                    "diasUltima": _num(p[10]) if p[10] else None,
                }
            )
        except Exception:
            continue
    return out


def ciclo_cliente_dias(row: dict) -> int:
    skus = _parse_sku_detalle(row.get("sku_detalle"))
    ciclos = sorted(
        int(s["cicloDias"])
        for s in skus
        if s.get("cicloDias") and 5 <= float(s["cicloDias"]) <= 120
    )
    if ciclos:
        return ciclos[len(ciclos) // 2]
    hist = _num(row.get("venta_mensual")) or _num(row.get("venta_historica"))
    if hist >= 500_000:
        return 14
    if hist >= 150_000:
        return 21
    if hist > 0:
        return 28
    return 30


# ---------------------------------------------------------------------------
# Core algorithm (mirror of riesgo.js)
# ---------------------------------------------------------------------------

def calcular_riesgo_fuga(row: dict, hoy: Optional[date] = None) -> Dict[str, Any]:
    hoy = hoy or date.today()

    if row.get("es_bloqueado") in (True, 1, "1", "true", "True"):
        return {
            "riesgo_score": 0,
            "riesgo_nivel": "BLOQUEADO",
            "riesgo_label": "Bloqueado",
            "riesgo_razones": "Cliente bloqueado",
            "riesgo_plata": 0,
        }

    dias = row.get("dias_sin_comprar")
    try:
        dias = int(dias) if dias is not None else None
    except Exception:
        dias = None
    if dias is None:
        ult = row.get("ultima_compra")
        if ult:
            try:
                if isinstance(ult, date) and not isinstance(ult, datetime):
                    d0 = ult
                else:
                    d0 = datetime.fromisoformat(str(ult)[:10]).date()
                dias = (hoy - d0).days
            except Exception:
                dias = 0
        else:
            dias = 0
    dias = max(0, min(int(dias), 900))

    ciclo = ciclo_cliente_dias(row)
    ratio = (dias / ciclo) if ciclo > 0 else None
    mtd = _num(row.get("venta_mtd"))
    hist_mes = _num(row.get("venta_mensual"))
    if hist_mes <= 0 and _num(row.get("venta_historica")) > 0:
        hist_mes = _num(row.get("venta_historica")) / 12.0

    skus = _parse_sku_detalle(row.get("sku_detalle"))
    score = 0.0
    razones: List[str] = []

    # 1) Atraso vs ciclo (0–40)
    if ratio is not None:
        if ratio >= 3:
            score += 40
            razones.append(f"Lleva {dias}d sin compra (ciclo ~{ciclo}d)")
        elif ratio >= 2:
            score += 32
            razones.append(f"Atraso 2× ciclo ({dias}d / {ciclo}d)")
        elif ratio >= 1.5:
            score += 24
            razones.append(f"Atraso vs ciclo ({dias}d / {ciclo}d)")
        elif ratio >= 1.1:
            score += 14
            razones.append("Pasó su ciclo de reposición")
        elif ratio >= 0.9:
            score += 6

    # 2) Días absolutos (0–25)
    if dias >= 90:
        score += 25
        if not any("sin compra" in r for r in razones):
            razones.append(f"Sin compra hace {dias}d")
    elif dias >= 60:
        score += 20
    elif dias >= 45:
        score += 15
    elif dias >= 30:
        score += 10
    elif dias >= 21:
        score += 6

    # 3) Caída de volumen (0–20)
    day = hoy.day
    expected = (hist_mes * min(day, 28) / 28.0) if hist_mes > 0 else 0.0
    if hist_mes >= 50_000 and day >= 10:
        if mtd <= 0 and expected > 0:
            score += 20
            razones.append("Sin compra este mes y solía comprar")
        elif expected > 0 and mtd < expected * 0.35:
            score += 16
            razones.append("Ticket del mes muy bajo vs su promedio")
        elif expected > 0 and mtd < expected * 0.55:
            score += 10
            razones.append("Va lento vs su promedio")

    # 4) SKUs atrasados (0–15)
    skus_late = 0
    plata_sku = 0.0
    for s in skus:
        d_ult = s.get("diasUltima")
        cic = _num(s.get("cicloDias"))
        late = False
        if d_ult is not None and cic > 0 and float(d_ult) >= cic:
            late = True
        elif d_ult is not None and float(d_ult) >= 21 and cic <= 0:
            late = True
        if late:
            skus_late += 1
            plata_sku += _num(s.get("promClp")) or _num(s.get("clpMtd"))

    if skus_late >= 4:
        score += 15
        razones.append(f"{skus_late} productos para reponer")
    elif skus_late >= 2:
        score += 10
        razones.append(f"{skus_late} productos atrasados")
    elif skus_late == 1:
        score += 6
        razones.append("1 producto atrasado")

    # 5) Señal estado_fuga backend (0–10)
    ef = str(row.get("estado_fuga") or "").upper()
    if "FUGADO" in ef or ef.startswith("5_"):
        score += 10
    elif "DORMIDO" in ef or ef.startswith("4_"):
        score += 8
    elif "RIESGO" in ef or ef.startswith("3_"):
        score += 5
    elif "ENFRI" in ef or ef.startswith("2_"):
        score += 2

    nunca = (
        "NUNCA" in ef
        or ef.startswith("0_")
        or (_num(row.get("venta_historica")) <= 0 and mtd <= 0 and dias >= 900)
    )
    if nunca and mtd <= 0:
        return {
            "riesgo_score": 0,
            "riesgo_nivel": "0_NUNCA",
            "riesgo_label": "Sin historial",
            "riesgo_razones": "Sin historial de compra",
            "riesgo_plata": 0,
        }

    score_i = int(max(0, min(100, round(score))))

    if score_i >= 80:
        nivel, label = "5_FUGADO", "Fugado"
    elif score_i >= 65:
        nivel, label = "4_DORMIDO", "Dormido"
    elif score_i >= 45:
        nivel, label = "3_EN_RIESGO", "En riesgo"
    elif score_i >= 25:
        nivel, label = "2_ENFRIANDO", "Enfriando"
    else:
        nivel, label = "1_ACTIVO", "Activo"

    plata = int(round(max(plata_sku, hist_mes, 0)))
    if score_i >= 45 and plata > 0 and len(razones) < 3:
        razones.append(f"~$ {plata:,.0f} en juego".replace(",", "."))

    return {
        "riesgo_score": score_i,
        "riesgo_nivel": nivel,
        "riesgo_label": label,
        "riesgo_razones": " · ".join(razones[:4]),
        "riesgo_plata": plata,
    }


def enrich_cartera_riesgo(rows: List[dict], hoy: Optional[date] = None) -> List[dict]:
    """Agrega campos de riesgo a cada fila de cartera (in-place + return)."""
    hoy = hoy or date.today()
    for r in rows or []:
        risk = calcular_riesgo_fuga(r, hoy=hoy)
        r.update(risk)
        # Si no había estado_fuga, alinear con nivel calculado
        if not r.get("estado_fuga"):
            r["estado_fuga"] = risk["riesgo_nivel"]
            r["estado_texto"] = risk["riesgo_label"]
    return rows


def resumen_riesgo(rows: List[dict]) -> Dict[str, Any]:
    enriched = enrich_cartera_riesgo([dict(r) for r in (rows or [])])
    en_riesgo = [r for r in enriched if _num(r.get("riesgo_score")) >= 45]
    enfri = [r for r in enriched if 25 <= _num(r.get("riesgo_score")) < 45]
    plata = sum(_num(r.get("riesgo_plata")) for r in en_riesgo)
    top = sorted(en_riesgo, key=lambda x: -_num(x.get("riesgo_score")))[:10]
    return {
        "n_riesgo": len(en_riesgo),
        "n_enfri": len(enfri),
        "plata_en_riesgo": int(plata),
        "top": top,
    }


# ---------------------------------------------------------------------------
# Supabase DDL + job opcional
# ---------------------------------------------------------------------------

SQL_ENSURE_COLUMNS = """
-- Riesgo de fuga en cartera (idempotente)
alter table public.cartera add column if not exists riesgo_score int;
alter table public.cartera add column if not exists riesgo_nivel text;
alter table public.cartera add column if not exists riesgo_label text;
alter table public.cartera add column if not exists riesgo_razones text;
alter table public.cartera add column if not exists riesgo_plata numeric;

create index if not exists cartera_riesgo_score_idx on public.cartera (riesgo_score desc nulls last);
create index if not exists cartera_riesgo_nivel_idx on public.cartera (riesgo_nivel);
"""


def ensure_cartera_riesgo_columns(sb) -> None:
    """Ejecuta DDL vía RPC exec_sql si existe; si no, imprime el SQL."""
    try:
        # Preferencia: función helper en el proyecto
        sb.rpc("exec_sql", {"query": SQL_ENSURE_COLUMNS}).execute()
        print("  riesgo: columnas cartera OK (rpc exec_sql)")
        return
    except Exception as e1:
        try:
            # Algunos proyectos usan sql()
            sb.postgrest.session.post(
                f"{sb.rest_url}/rpc/exec_sql",
                json={"query": SQL_ENSURE_COLUMNS},
            )
        except Exception:
            pass
        print("  riesgo: no se pudo DDL automático — corré en SQL Editor:")
        print(SQL_ENSURE_COLUMNS)
        print(f"  ({e1})")


def publish_riesgo_only(sb, batch: int = 100) -> int:
    """
    Job liviano: lee cartera, recalcula riesgo, upsert solo columnas de riesgo.
    Útil sin re-correr el ciclo completo.
    """
    ensure_cartera_riesgo_columns(sb)
    rows: List[dict] = []
    page = 0
    page_size = 1000
    while True:
        q = (
            sb.table("cartera")
            .select(
                "cliente_key,ejecutivo_id,dias_sin_comprar,ultima_compra,"
                "venta_mtd,venta_mensual,venta_historica,sku_detalle,"
                "estado_fuga,es_bloqueado"
            )
            .range(page * page_size, (page + 1) * page_size - 1)
        )
        data = q.execute().data or []
        rows.extend(data)
        if len(data) < page_size:
            break
        page += 1

    print(f"  riesgo job: {len(rows)} filas cartera")
    enrich_cartera_riesgo(rows)

    ok = 0
    payload = []
    for r in rows:
        payload.append(
            {
                "cliente_key": r.get("cliente_key"),
                "ejecutivo_id": r.get("ejecutivo_id"),
                "riesgo_score": r.get("riesgo_score"),
                "riesgo_nivel": r.get("riesgo_nivel"),
                "riesgo_label": r.get("riesgo_label"),
                "riesgo_razones": r.get("riesgo_razones"),
                "riesgo_plata": r.get("riesgo_plata"),
            }
        )
    for i in range(0, len(payload), batch):
        chunk = payload[i : i + batch]
        # Requiere unique (ejecutivo_id, cliente_key) — mismo on_conflict del ciclo
        try:
            sb.table("cartera").upsert(chunk, on_conflict="ejecutivo_id,cliente_key").execute()
            ok += len(chunk)
        except Exception as e:
            print(f"  riesgo upsert batch error: {e}")
            for row in chunk:
                try:
                    sb.table("cartera").upsert([row], on_conflict="ejecutivo_id,cliente_key").execute()
                    ok += 1
                except Exception as e2:
                    print(f"  skip {row.get('cliente_key')}: {e2}")
    print(f"  riesgo: upsert {ok}/{len(payload)}")
    return ok



# ===== FIN RIESGO =====


def estado_fuga(dias: Optional[int], nunca: bool) -> Tuple[str, str]:
    if nunca or dias is None:
        return "0_NUNCA_COMPRO", "Nunca compró"
    if dias <= 21:
        return "1_ACTIVO", "Activo"
    if dias <= 45:
        return "2_ENFRIANDOSE", "Enfriándose"
    if dias <= 75:
        return "3_EN_RIESGO", "En riesgo"
    if dias <= 120:
        return "4_DORMIDO", "Dormido"
    return "5_FUGADO", "Fugado"


def telefono_wa(tel: Any) -> Tuple[Optional[str], Optional[str]]:
    s = _s(tel)
    if not s:
        return None, None
    digits = re.sub(r"\D", "", s)
    if digits.startswith("56"):
        pass
    elif len(digits) == 9 and digits.startswith("9"):
        digits = "56" + digits
    elif len(digits) == 8:
        digits = "569" + digits
    link = f"https://wa.me/{digits}" if len(digits) >= 11 else None
    return digits, link


def chunked(lst: List[Any], n: int = 200):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


# ---------------------------------------------------------------------------
# Secrets / clientes
# ---------------------------------------------------------------------------
def get_secret(name: str, alt: Optional[str] = None) -> Optional[str]:
    v = os.environ.get(name) or (os.environ.get(alt) if alt else None)
    if v:
        return v.strip()
    try:
        from google.colab import userdata  # type: ignore

        for key in ([name, alt] if alt else [name]):
            if not key:
                continue
            try:
                x = userdata.get(key)
                if x:
                    return str(x).strip()
            except Exception:
                pass
    except Exception:
        pass
    return None


def sb_client():
    DEFAULT_URL = "https://ihhnfouwviuyycltgafc.supabase.co"
    url = (get_secret("SUPABASE_URL") or DEFAULT_URL).strip().strip('"').strip("'")
    # Secret vacío, JWT pegado por error, o sin https → default
    if (
        not url
        or url.lower() in ("none", "null")
        or not re.match(r"^https?://", url)
        or url.startswith("eyJ")
    ):
        print(f"  SUPABASE_URL inválida (parece key/JWT o vacía) → default {DEFAULT_URL}")
        url = DEFAULT_URL
    key = get_secret("SUPABASE_SERVICE_KEY") or get_secret("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise SystemExit(
            "Falta SUPABASE_SERVICE_KEY en Secrets de Colab "
            "(icono llave → SUPABASE_SERVICE_KEY = service_role, Notebook access ON)."
        )
    key = key.strip().strip('"').strip("'")
    if not key.startswith("eyJ") and len(key) < 20:
        raise SystemExit("SUPABASE_SERVICE_KEY no parece un JWT service_role válido.")
    from supabase import create_client

    print(f"  supabase url={url}")
    return create_client(url, key)


# ---------------------------------------------------------------------------
# LOADERS
# ---------------------------------------------------------------------------
def load_ventas(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, engine="openpyxl")
    raw.columns = [str(c).strip() for c in raw.columns]
    # KeyFoods: columnas duplicadas "CODIGO" → pandas usa CODIGO y CODIGO.1
    rename = {}
    seen_codigo = 0
    for c in list(raw.columns):
        nc = _norm_col(c)
        if nc == "CODIGO" or nc.startswith("CODIGO."):
            seen_codigo += 1
            rename[c] = "CODIGO_CLIENTE" if seen_codigo == 1 else "CODIGO_PRODUCTO"
    if rename:
        raw = raw.rename(columns=rename)
    print(f"  ventas cols: {list(raw.columns)[:14]}")

    def col(*names):
        for n in names:
            for c in raw.columns:
                if _norm_col(c) == _norm_col(n):
                    return c
        return None

    c_cli = col("CODIGO_CLIENTE", "CODIGO", "COD CLIENTE")
    c_sku = col("CODIGO_PRODUCTO", "CODIGO.1", "SKU")
    c_fecha = col("FECHA")
    c_neto = col("NETO", "VENTA_NETA")
    c_nom = col("NOMBRE", "RAZON SOCIAL")
    c_prod = col("PRODUCTO", "DESCRIPCION")
    c_cant = col("CANTIDAD")
    c_vend = col("VENDEDOR", "EJECUTIVO")
    c_dir = col("DOMICILIO", "DIRECCION")
    c_com = col("COMUNA")
    c_num = col("NUMERO")
    c_tipo = col("TIPO")
    c_precio = col("PRECIO")

    if not c_cli or not c_fecha or not c_neto:
        raise ValueError(f"VENTAS sin columnas mínimas. cols={list(raw.columns)}")

    df = pd.DataFrame({
        "cliente_key": raw[c_cli].map(normalize_cliente_key),
        "fecha": parse_fecha_series(raw[c_fecha]),
        "venta_neta_clp": raw[c_neto].map(_f),
    })
    if c_sku:
        df["sku_canon"] = raw[c_sku].map(normalize_sku)
    else:
        df["sku_canon"] = None
    if c_nom:
        df["nombre_cliente"] = raw[c_nom].map(_s)
    if c_prod:
        df["producto_nombre"] = raw[c_prod].map(_s)
    if c_cant:
        df["cantidad"] = raw[c_cant].map(_f)
    if c_vend:
        df["vendedor_raw"] = raw[c_vend].map(_s)
        df["zona_vendedor"] = raw[c_vend].map(normalize_zona)
    else:
        df["zona_vendedor"] = "OTROS"
    if c_dir:
        df["direccion_venta"] = raw[c_dir].map(_s)
    if c_com:
        df["comuna_venta"] = raw[c_com].map(_s)
    if c_num:
        df["numero_doc"] = raw[c_num].map(_s)
    if c_tipo:
        df["tipo_doc"] = raw[c_tipo].map(_s)
    if c_precio:
        df["precio_unit"] = raw[c_precio].map(_f)

    n_sku = int(df["sku_canon"].notna().sum())
    print(f"  ventas mapping manual | sku_col={c_sku} | sku_canon={n_sku}/{len(df)}")
    df = df[df["cliente_key"].notna() & df["fecha"].notna()].copy()
    df["fecha_d"] = df["fecha"].dt.date
    return df


def load_maestra(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, engine="openpyxl")
    raw.columns = [str(c).strip() for c in raw.columns]
    # Columna I (índice 8) = EJECUTIVO de asignación comercial (fuente de verdad)
    if len(raw.columns) > 8:
        col_i = raw.columns[8]
        print(f"  maestra col I (ejecutivo) = {col_i!r}")
        # si el mapping no la encuentra como ejecutivo_raw, forzar alias
        if "ejecutivo_raw" not in [str(c).lower() for c in raw.columns]:
            pass
        # Preferir col I como ejecutivo si el nombre sugiere ejecutivo/zona
        if re.search(r"ejecutivo|zona|vendedor", str(col_i), re.I):
            raw = raw.rename(columns={col_i: "EJECUTIVO"})
    required = ["ejecutivo_raw"]
    # cliente_key puede faltar en filas basura; intentamos
    try:
        df, mapping = map_columns(raw, MAESTRA_ALIAS, ["cliente_key", "ejecutivo_raw"])
    except ValueError:
        df, mapping = map_columns(raw, MAESTRA_ALIAS, ["rut", "ejecutivo_raw"])
        df["cliente_key"] = df["rut"].map(lambda x: normalize_cliente_key(x) if x else None)
        # a veces COD CLIENTE estilo 77028122-C
        if "cliente_key" not in df.columns or df["cliente_key"].isna().all():
            pass
    print(f"  maestra mapping: {mapping}")
    df["cliente_key"] = df["cliente_key"].map(normalize_cliente_key)
    if "rut" in df.columns:
        df.loc[df["cliente_key"].isna(), "cliente_key"] = df.loc[df["cliente_key"].isna(), "rut"].map(
            lambda x: (normalize_cliente_key(str(x) + "-C") if _s(x) else None)
        )
    df["zona"] = df["ejecutivo_raw"].map(normalize_zona)
    df = df[df["cliente_key"].notna()].copy()
    df = df.drop_duplicates(subset=["cliente_key"], keep="first")
    return df


def load_stock_corta_fecha() -> Dict[str, dict]:
    """API corta-fecha: vencidos / críticos / urgentes en kg."""
    url = os.environ.get(
        "KF_STOCK_CORTA_URL",
        "https://flint-reportero.vercel.app/api/stock-corta-fecha",
    )
    out: Dict[str, dict] = {}
    if not requests:
        return out
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        payload = r.json()
    except Exception as e:
        print(f"  stock corta-fecha fail: {e}")
        return out
    for item in payload.get("tableData") or []:
        sk = normalize_sku(item.get("sku"))
        if not sk:
            continue
        kg = _f(item.get("qty_kg")) or 0
        if sk not in out:
            out[sk] = {"status_venc": None, "dias_venc": None, "fecha_venc": None, "kg_riesgo": 0.0}
        out[sk]["kg_riesgo"] += kg
        st = _s(item.get("status") or item.get("daysLeft"))
        rank = {"Vencidos": 0, "Críticos": 1, "Criticos": 1, "Urgentes": 2}
        prev = out[sk]["status_venc"]
        if prev is None or rank.get(st, 5) < rank.get(str(prev), 5):
            out[sk]["status_venc"] = st or prev
            out[sk]["dias_venc"] = item.get("diasRestantes")
            out[sk]["fecha_venc"] = item.get("fechaVencimiento")
    kpis = payload.get("kpis") or {}
    print(f"  stock corta-fecha: skus={len(out)} vencidos_kg={(kpis.get('vencidos') or {}).get('kg')}")
    return out


def load_stock_from_api(url: str) -> Optional[pd.DataFrame]:
    """stock-diario en KG + flags de vencimiento (corta-fecha)."""
    if not url or not requests:
        return None
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        payload = r.json()
    except Exception as e:
        print(f"  stock API fail ({url}): {e}")
        return None
    rows = payload.get("data") if isinstance(payload, dict) else payload
    if not rows:
        print("  stock API: sin data")
        return None
    agg: Dict[str, dict] = {}
    for item in rows:
        sk = normalize_sku(item.get("sku") or item.get("Codigo SKU KL"))
        if not sk:
            continue
        kg = _f(item.get("kilos") or item.get("Stocks Kg") or item.get("stock_kg")) or 0
        cajas = _f(item.get("cajas") or item.get("Stocks Cajas")) or 0
        desc = _s(item.get("descripcion") or item.get("Descripcion KL"))
        fam = _s(item.get("familia") or item.get("Familia"))
        if sk not in agg:
            agg[sk] = {"sku_canon": sk, "descripcion": desc, "familia": fam, "stock_kg": 0.0, "stock_cajas": 0.0}
        agg[sk]["stock_kg"] += kg
        agg[sk]["stock_cajas"] += cajas
        if desc and not agg[sk]["descripcion"]:
            agg[sk]["descripcion"] = desc
    corta = load_stock_corta_fecha()
    for sk, info in corta.items():
        if sk not in agg:
            agg[sk] = {
                "sku_canon": sk,
                "descripcion": None,
                "familia": None,
                "stock_kg": float(info.get("kg_riesgo") or 0),
                "stock_cajas": 0.0,
            }
        agg[sk]["status_venc"] = info.get("status_venc")
        agg[sk]["dias_venc"] = info.get("dias_venc")
        agg[sk]["fecha_venc"] = info.get("fecha_venc")
    df = pd.DataFrame(list(agg.values()))
    df["stock_total"] = df["stock_kg"]  # canónico KG
    fecha = payload.get("fechaData") if isinstance(payload, dict) else None
    print(f"  stock API OK fecha={fecha} skus={len(df)} unidad=KG")
    return df



def load_stock_from_excel(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, engine="openpyxl")
    raw.columns = [str(c).strip() for c in raw.columns]
    cols_u = {_norm_col(c): c for c in raw.columns}

    # Formato Detalle_Stock_Diario: Codigo SKU KL + Stocks Kg (+ Almacen)
    c_sku = cols_u.get("CODIGO SKU KL") or cols_u.get("CODIGO") or cols_u.get("SKU")
    c_kg = cols_u.get("STOCKS KG") or cols_u.get("STOCK KG") or cols_u.get("KILOS")
    c_cajas = cols_u.get("STOCKS CAJAS") or cols_u.get("STOCK CAJAS")
    c_desc = cols_u.get("DESCRIPCION KL") or cols_u.get("DESCRIPCION")
    c_fam = cols_u.get("FAMILIA")
    c_alm = cols_u.get("ALMACEN")
    c_total = cols_u.get("TOTAL") or cols_u.get("STOCK TOTAL") or cols_u.get("STOCK")

    if c_sku and c_kg:
        tmp = pd.DataFrame({
            "sku_canon": raw[c_sku].map(normalize_sku),
            "stock_kg": raw[c_kg].map(_f),
            "descripcion": raw[c_desc].map(_s) if c_desc else None,
            "familia": raw[c_fam].map(_s) if c_fam else None,
            "stock_cajas": raw[c_cajas].map(_f) if c_cajas else 0,
            "almacen": raw[c_alm].map(_s) if c_alm else None,
        })
        tmp = tmp[tmp["sku_canon"].notna()]
        g = tmp.groupby("sku_canon", as_index=False).agg(
            stock_kg=("stock_kg", "sum"),
            stock_cajas=("stock_cajas", "sum"),
            descripcion=("descripcion", "first"),
            familia=("familia", "first"),
        )
        g["stock_total"] = g["stock_kg"]
        print(f"  stock Excel DETALLE path={path.name} skus={len(g)} (sum kg por SKU)")
        return g

    # Formato viejo STOCK_ACTUAL_CONVERTIDO (TOTAL ya agregado)
    df, mapping = map_columns(raw, STOCK_ALIAS, ["sku_canon", "stock_total"])
    print(f"  stock Excel LEGACY mapping: {mapping}")
    df["sku_canon"] = df["sku_canon"].map(normalize_sku)
    df["stock_total"] = df["stock_total"].map(_f)
    df = df[df["sku_canon"].notna()].copy()
    return df


def load_stock(path: Optional[Path] = None) -> pd.DataFrame:
    """1) API en vivo  2) Excel detalle  3) Excel legacy."""
    if STOCK_API_URL and os.environ.get("KF_SKIP_STOCK_API", "") not in ("1", "true", "True"):
        api_df = load_stock_from_api(STOCK_API_URL)
        if api_df is not None and not api_df.empty:
            return api_df
    if path is None:
        raise ValueError("Sin stock API ni archivo Excel de stock")
    return load_stock_from_excel(path)


def load_precios(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, engine="openpyxl")
    raw.columns = [str(c).strip() for c in raw.columns]
    df, mapping = map_columns(raw, PRECIOS_ALIAS, ["descripcion"])
    print(f"  precios mapping: {mapping}")
    if "sku_canon" in df.columns:
        df["sku_canon"] = df["sku_canon"].map(normalize_sku)
    else:
        df["sku_canon"] = None
    for col in ("precio_unidad", "precio_caja", "precio_kilo", "kg_unidad"):
        if col in df.columns:
            df[col] = df[col].map(_f)
    for col in ("imagen_url", "resena", "ficha_url", "categoria", "marca", "unidad_venta"):
        if col in df.columns:
            df[col] = df[col].map(_s)
    return df




def load_productos_media() -> Dict[str, dict]:
    """Mapa sku_canon → {imagen_url, ficha_url, resena}.
    Fuente: PRODUCTOS_MEDIA.xlsx/csv (recomendado) o columnas en lista de precios.
    Convención Drive: nombre de archivo = {sku_canon}.jpg / {sku_canon}.pdf
    y en el Excel ponés el link de compartido público de cada archivo.
    """
    p = find_file(MEDIA_GLOBS)
    out: Dict[str, dict] = {}
    if not p:
        print("  PRODUCTOS_MEDIA: no encontrado (opcional) — fotos/fichas solo si vienen en lista de precios")
        return out
    print(f"  PRODUCTOS_MEDIA: {p.name}")
    if p.suffix.lower() == ".csv":
        raw = None
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                raw = pd.read_csv(p, encoding=enc)
                break
            except Exception:
                continue
        if raw is None:
            print("  PRODUCTOS_MEDIA: no se pudo leer CSV")
            return out
    else:
        raw = pd.read_excel(p, engine="openpyxl")
    raw.columns = [str(c).strip() for c in raw.columns]
    # flexible headers
    def pick(row, names):
        for n in names:
            for c in raw.columns:
                if str(c).strip().upper() == n.upper() or n.upper() in str(c).strip().upper():
                    v = row.get(c)
                    if v is not None and str(v).strip() and str(v).lower() not in ("nan", "none"):
                        return str(v).strip()
        return None
    sku_cols = ["sku_canon", "SKU", "CODIGO", "CÓDIGO", "Codigo", "Código", "sku"]
    for _, row in raw.iterrows():
        sk = None
        for c in raw.columns:
            cu = str(c).strip().upper()
            if cu in ("SKU_CANON", "SKU", "CODIGO", "CÓDIGO", "CODIGO_PRODUCTO", "CÓDIGO PRODUCTO"):
                sk = normalize_sku(row.get(c))
                if sk:
                    break
        if not sk:
            # first column fallback
            sk = normalize_sku(row.iloc[0]) if len(row) else None
        if not sk:
            continue
        img = pick(row, ["imagen_url", "IMAGEN_URL", "IMAGEN", "FOTO", "FOTO_URL", "URL_IMAGEN", "image"])
        ficha = pick(row, ["ficha_url", "FICHA_URL", "FICHA", "PDF", "URL_FICHA", "FICHA_TECNICA"])
        resena = pick(row, ["resena", "RESEÑA", "RESENA", "DESCRIPCION_CORTA", "COPY"])
        out[sk] = {
            "imagen_url": img,
            "ficha_url": ficha,
            "resena": resena,
        }
    print(f"  PRODUCTOS_MEDIA filas={len(out)} con_foto={sum(1 for v in out.values() if v.get('imagen_url'))} con_ficha={sum(1 for v in out.values() if v.get('ficha_url'))}")
    return out

def load_config_csv(globs: List[str]) -> Optional[pd.DataFrame]:
    p = find_file(globs)
    if not p:
        return None
    print(f"  config file: {p}")
    if p.suffix.lower() == ".csv":
        last_err = None
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                return pd.read_csv(p, encoding=enc)
            except Exception as e:
                last_err = e
                continue
        print(f"  WARN CSV {p.name}: {last_err} → defaults")
        return None
    try:
        return pd.read_excel(p, engine="openpyxl")
    except Exception as e:
        print(f"  WARN excel config {p.name}: {e}")
        return None


def load_config_mensual(path: Optional[Path]) -> Tuple[List[dict], List[dict], Dict[str, str], Dict[str, float]]:
    """
    Lee Excel de configuración mensual (hojas METAS, FOCOS_MES, FOCO_SKU).
    Devuelve (metas_rows, focos_rows, foco_sku_map, foco_kg_factor) listos para Supabase.
    """
    metas, focos = [], []
    if not path or not path.exists():
        return metas, focos, {}, {}
    xl = pd.ExcelFile(path, engine="openpyxl")
    sheets = {s.upper(): s for s in xl.sheet_names}
    print(f"  config mensual: {path.name} hojas={list(xl.sheet_names)}")

    def sheet(*names):
        for n in names:
            if n.upper() in sheets:
                return pd.read_excel(xl, sheet_name=sheets[n.upper()])
        return None

    # --- METAS ---
    mdf = sheet("METAS", "META", "METAS_MES")
    if mdf is not None and not mdf.empty:
        mdf.columns = [str(c).strip() for c in mdf.columns]
        colmap = {_norm_col(c): c for c in mdf.columns}
        def mc(*opts):
            for o in opts:
                if _norm_col(o) in colmap:
                    return colmap[_norm_col(o)]
            return None
        c_ej = mc("ejecutivo", "zona", "vendedor")
        c_meta = mc("meta_mensual_clp", "meta_mensual", "meta", "meta_clp")
        c_mes = mc("mes", "periodo", "fecha")
        for _, r in mdf.iterrows():
            ej = normalize_zona(r[c_ej]) if c_ej else "OTROS"
            meta_v = _f(r[c_meta]) if c_meta else None
            if meta_v is None:
                continue
            mes_v = r[c_mes] if c_mes else None
            if mes_v is not None and not isinstance(mes_v, date):
                try:
                    mes_v = pd.to_datetime(mes_v).date()
                except Exception:
                    mes_v = None
            metas.append(
                {
                    "zona": ej,
                    "ejecutivo": ej,
                    "meta_mensual": meta_v,
                    "mes": mes_v.isoformat() if hasattr(mes_v, "isoformat") else str(mes_v) if mes_v else None,
                    "fecha_snapshot": date.today().isoformat(),
                }
            )

    # --- FOCOS ---
    fdf = sheet("FOCOS_MES", "FOCOS", "FOCO")
    if fdf is not None and not fdf.empty:
        fdf.columns = [str(c).strip() for c in fdf.columns]
        colmap = {_norm_col(c): c for c in fdf.columns}
        def fc(*opts):
            for o in opts:
                if _norm_col(o) in colmap:
                    return colmap[_norm_col(o)]
            return None
        c_ej = fc("ejecutivo", "zona")
        c_foco = fc("foco", "producto_foco", "nombre_foco")
        c_meta_u = fc("meta_unidad_mes", "meta_unidad", "meta")
        c_unidad = fc("unidad_meta", "unidad")
        for _, r in fdf.iterrows():
            ej = normalize_zona(r[c_ej]) if c_ej else "OTROS"
            foco = _s(r[c_foco]) if c_foco else None
            if not foco:
                continue
            focos.append(
                {
                    "zona": ej,
                    "ejecutivo": ej,
                    "foco": foco,
                    "meta_unidad": _f(r[c_meta_u]) if c_meta_u else None,
                    "unidad_meta": _s(r[c_unidad]) if c_unidad else None,
                    "fecha_snapshot": date.today().isoformat(),
                }
            )

    # --- FOCO_SKU (sku → nombre de foco + factor KG opcional) ---
    foco_skus: Dict[str, str] = {}
    foco_kg_factor: Dict[str, float] = {}  # sku → kg (o LT) por unidad de venta del ERP
    sdf = sheet("FOCO_SKU", "FOCOS_SKU", "SKU_FOCO")
    if sdf is not None and not sdf.empty:
        sdf.columns = [str(c).strip() for c in sdf.columns]
        colmap = {_norm_col(c): c for c in sdf.columns}
        def sc(*opts):
            for o in opts:
                if _norm_col(o) in colmap:
                    return colmap[_norm_col(o)]
            return None
        c_sku = sc("sku_canon", "sku", "codigo", "codigo_sku")
        c_foco = sc("foco", "nombre_foco", "producto_foco")
        c_kg = sc(
            "factor_kg_equivalente_por_unidad",
            "factor_kg",
            "kg_unidad",
            "kg_por_unidad",
            "kilogramos_por_unidad",
            "factor_lt",
            "lt_unidad",
        )
        if c_sku:
            for _, r in sdf.iterrows():
                sk = normalize_sku(r[c_sku])
                fo = _s(r[c_foco]) if c_foco else None
                if sk and fo:
                    foco_skus[sk] = fo
                if sk and c_kg is not None:
                    try:
                        fv = float(str(r[c_kg]).replace(",", ".").strip() or 0)
                        if fv > 0:
                            foco_kg_factor[sk] = fv
                    except Exception:
                        pass
        print(f"  config FOCO_SKU: {len(foco_skus)} skus")
        if foco_kg_factor:
            print(f"  config FOCO_SKU factores KG/LT: {len(foco_kg_factor)} skus")

    print(f"  config metas={len(metas)} focos={len(focos)}")
    return metas, focos, foco_skus, foco_kg_factor


# ---------------------------------------------------------------------------
# CÁLCULOS
# ---------------------------------------------------------------------------

def _kg_from_nombre(nombre: str) -> Optional[float]:
    """Infiere kg por unidad de venta desde el nombre (ej. 6X2K=12, 10KG=10, 1X2,5KG=2.5)."""
    if not nombre:
        return None
    n = str(nombre).upper().replace(",", ".")
    # NxM KG  or NxMK
    import re
    m = re.search(r"(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*K(?:G)?\b", n)
    if m:
        return float(m.group(1)) * float(m.group(2))
    m = re.search(r"(\d+(?:\.\d+)?)\s*KG\b", n)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*KG", n)
    if m:
        return float(m.group(1)) * float(m.group(2))
    return None

def mes_mtd(ventas: pd.DataFrame) -> date:
    if MES_FORCE:
        return date.fromisoformat(MES_FORCE[:10])
    if ventas.empty:
        today = date.today()
        return date(today.year, today.month, 1)
    mx = ventas["fecha"].max()
    return date(mx.year, mx.month, 1)


def build_sku_detalle_y_ciclo(ventas: pd.DataFrame, mes_inicio: date) -> Dict[str, Any]:
    """
    Por cliente:
      - productos_top (nombres)
      - sku_detalle: nombre||prom||mtd||clp||clp_mtd||ultima||ciclo_dias||n_compras
      - ciclo por sku (mediana gaps)
    """
    if ventas.empty:
        return {}

    mes_fin = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)  # next month
    # meses previos para promedio: 6 meses antes de mes_inicio
    prev_ini = date(mes_inicio.year, mes_inicio.month, 1)
    for _ in range(6):
        prev_ini = (prev_ini - timedelta(days=1)).replace(day=1)

    out: Dict[str, Dict[str, Any]] = {}

    # Pre-group
    v = ventas.dropna(subset=["cliente_key"]).copy()
    v["mes"] = v["fecha"].dt.to_period("M")

    for ck, g in v.groupby("cliente_key"):
        skus = {}
        for sku, gs in g.groupby(g["sku_canon"].fillna("SIN_SKU")):
            if sku == "SIN_SKU":
                continue
            nombre = _s(gs["producto_nombre"].iloc[0]) if "producto_nombre" in gs.columns else sku
            fechas = [d for d in gs["fecha_d"].tolist() if d]
            ciclo = median_gaps_days(fechas)
            n_compras = len(set(fechas))
            ultima = max(fechas) if fechas else None

            # mtd
            mtd_mask = (gs["fecha_d"] >= mes_inicio) & (gs["fecha_d"] < mes_fin)
            cant_mtd = float(gs.loc[mtd_mask, "cantidad"].sum()) if "cantidad" in gs.columns else 0.0
            clp_mtd = float(gs.loc[mtd_mask, "venta_neta_clp"].fillna(0).sum())

            # promedio mensual (meses previos con data)
            prev = gs[(gs["fecha_d"] >= prev_ini) & (gs["fecha_d"] < mes_inicio)]
            if prev.empty:
                prom = 0.0
                clp_prom = 0.0
            else:
                by_m = prev.groupby(prev["fecha"].dt.to_period("M"))
                if "cantidad" in prev.columns:
                    prom = float(by_m["cantidad"].sum().mean())
                else:
                    prom = 0.0
                clp_prom = float(by_m["venta_neta_clp"].sum().mean())

            falta = max(0.0, (prom or 0) - (cant_mtd or 0))
            dias_desde = (date.today() - ultima).days if ultima else None
            if ciclo and dias_desde is not None:
                if dias_desde >= ciclo:
                    est_rec = "RECOMPRAR_HOY"
                elif dias_desde >= max(1, int(ciclo) - 3):
                    est_rec = "RECOMPRAR_PRONTO"
                else:
                    est_rec = "OK"
                dias_para = max(0, int(ciclo) - int(dias_desde))
            else:
                est_rec = "SIN_CICLO"
                dias_para = None
            skus[sku] = {
                "nombre": nombre or sku,
                "prom": round(prom, 2),
                "mtd": round(cant_mtd, 2),
                "falta": round(falta, 2),
                "clp_prom": round(clp_prom, 0),
                "clp_mtd": round(clp_mtd, 0),
                "ultima": ultima.isoformat() if ultima else "",
                "ciclo_dias": ciclo,
                "n_compras": n_compras,
                "sku": str(sku),
                "dias_desde": dias_desde,
                "dias_para_recompra": dias_para,
                "estado_recompra": est_rec,
            }

        ranking = sorted(skus.values(), key=lambda x: -(x["clp_mtd"] * 10 + x["clp_prom"]))
        # REGLA MIX: todos los SKU con venta MTD del mes van SIEMPRE.
        # Después se completan con histórico hasta 30 (antes top 10 perdía productos).
        mtd_first = [x for x in ranking if float(x.get("mtd") or 0) > 0]
        rest = [x for x in ranking if float(x.get("mtd") or 0) <= 0]
        ordered = mtd_first + rest
        top_names = [x["nombre"] for x in ordered[:5]]
        # V3: nombre|prom|mtd|falta|clp_prom|clp_mtd|ultima|ciclo|n|estado|dias|sku_canon
        parts = []
        for x in ordered[:30]:
            parts.append("|".join([
                str(x["nombre"]),
                str(x["prom"]),
                str(x["mtd"]),
                str(x.get("falta", 0)),
                str(int(x["clp_prom"])),
                str(int(x["clp_mtd"])),
                x["ultima"] or "",
                str(x["ciclo_dias"] or ""),
                str(x["n_compras"]),
                str(x.get("estado_recompra") or ""),
                str(x["dias_para_recompra"] if x.get("dias_para_recompra") is not None else ""),
                str(x.get("sku") or ""),
            ]))
        out[ck] = {
            "productos_top": " · ".join(top_names),
            "sku_detalle": "||".join(parts),
            "skus": skus,
            "n_sku_mtd": len(mtd_first),
            "n_sku_total": len(ordered),
        }
    return out


def build_oferta(
    detalle: Dict[str, Any],
    precios: pd.DataFrame,
    stock: pd.DataFrame,
    focos_skus: List[str],
) -> Dict[str, str]:
    """Oferta: siempre NOMBRE de producto (nunca código SKU solo)."""
    stock_map = {}
    name_by_sku = {}
    cat_by_sku = {}
    if stock is not None and not stock.empty:
        for _, r in stock.iterrows():
            sk = str(r.get("sku_canon") or "")
            if not sk:
                continue
            stock_map[sk] = _f(r.get("stock_total")) or 0
            desc = _s(r.get("descripcion") or r.get("producto_nombre"))
            if desc:
                name_by_sku[sk] = desc
    if precios is not None and not precios.empty and "sku_canon" in precios.columns:
        for _, r in precios.iterrows():
            sk = str(r.get("sku_canon") or "")
            if not sk:
                continue
            cat_by_sku[sk] = _s(r.get("categoria")) or ""
            desc = _s(r.get("descripcion"))
            if desc:
                name_by_sku[sk] = desc
    # nombres desde historial de ventas del cliente
    for info in (detalle or {}).values():
        for sk, s in (info.get("skus") or {}).items():
            if s.get("nombre"):
                name_by_sku.setdefault(str(sk), s["nombre"])

    def _is_code(s):
        s = str(s or "").strip()
        return bool(re.fullmatch(r"\d{5,}", s))

    def _nom(sk):
        sk = str(sk)
        n = name_by_sku.get(sk) or name_by_sku.get(sk.lstrip("0")) or ""
        if n and not _is_code(n):
            return n
        return None  # nunca devolver código solo

    focos_ok = [s for s in focos_skus if stock_map.get(str(s), 1) > 0] or list(focos_skus[:1])
    ofertas = {}
    for ck, info in detalle.items():
        skus = info.get("skus") or {}
        hist = sorted(skus.items(), key=lambda kv: -(kv[1].get("clp_prom", 0) + kv[1].get("clp_mtd", 0)))
        hist_names = []
        for kv in hist[:3]:
            nm = kv[1].get("nombre") or _nom(kv[0])
            if nm and not _is_code(nm):
                hist_names.append(nm)
        # complemento: preferir SKU con stock de misma categoría o top stock con nombre
        comp = None
        top_sku = str(hist[0][0]) if hist else None
        cat = cat_by_sku.get(top_sku, "") if top_sku else ""
        for sk, st in stock_map.items():
            if st <= 0 or (top_sku and sk == top_sku):
                continue
            if cat and cat_by_sku.get(sk, "") != cat:
                continue
            nm = _nom(sk)
            if nm:
                comp = nm
                break
        if not comp:
            for sk, st in sorted(stock_map.items(), key=lambda x: -x[1]):
                if st <= 0:
                    continue
                nm = _nom(sk)
                if nm and (not top_sku or sk != top_sku):
                    comp = nm
                    break
        foco_txt = None
        for fs in focos_ok:
            foco_txt = _nom(fs)
            if foco_txt:
                break
        # stock del foco / alternativa
        bits = []
        if foco_txt:
            # indicar si hay stock del foco
            fs0 = str(focos_ok[0]) if focos_ok else ""
            st0 = stock_map.get(fs0)
            if st0 is not None and st0 <= 0 and comp:
                bits.append(f"Foco sin stock → alternativa: {comp}")
            else:
                bits.append(f"Foco: {foco_txt}")
        if hist_names:
            bits.append(f"Tu rubro: {hist_names[0]}")
        if comp and (not hist_names or comp != hist_names[0]):
            if not (foco_txt and "alternativa" in (bits[0] if bits else "")):
                bits.append(f"Complemento: {comp}")
        ofertas[ck] = " · ".join(bits) if bits else (hist_names[0] if hist_names else "")
    return ofertas



def _norm_doc(x) -> str:
    """Normaliza número de factura para comparar (evita 00123 vs 123)."""
    s = str(x or "").strip().upper()
    if not s or s in ("NAN", "NONE", "NAT"):
        return ""
    # quitar espacios y guiones repetidos
    s = re.sub(r"\s+", "", s)
    # si es numérico puro, sacar ceros a la izquierda
    if re.fullmatch(r"\d+", s):
        s = str(int(s)) if s else ""
    return s


def _venta_key_row(r) -> tuple:
    """Clave estable de línea de venta (detección de duplicados)."""
    ck = str(r.get("cliente_key") or "").strip()
    fd = r.get("fecha_d")
    if hasattr(fd, "isoformat"):
        fd = fd.isoformat()
    else:
        fd = str(fd or "")[:10]
    doc = _norm_doc(r.get("numero_documento") or r.get("numero_doc"))
    sku = str(r.get("sku_canon") or "").strip()
    try:
        neto = round(float(r.get("venta_neta_clp") or 0), 0)
    except Exception:
        neto = 0.0
    try:
        cant = round(float(r.get("cantidad") or 0), 4)
    except Exception:
        cant = 0.0
    return (ck, fd, doc, sku, neto, cant)


def dedupe_ventas(df: pd.DataFrame) -> pd.DataFrame:
    """Elimina líneas de venta repetidas (misma factura + sku + neto + cantidad)."""
    if df is None or df.empty:
        return df
    before = len(df)
    df = df.copy()
    if "numero_doc" in df.columns and "numero_documento" not in df.columns:
        df["numero_documento"] = df["numero_doc"]
    if "numero_documento" in df.columns:
        df["_doc_norm"] = df["numero_documento"].map(_norm_doc)
    else:
        df["_doc_norm"] = ""
    # clave fuerte normalizada
    df["_neto_r"] = pd.to_numeric(df.get("venta_neta_clp"), errors="coerce").fillna(0).round(0)
    df["_cant_r"] = pd.to_numeric(df.get("cantidad"), errors="coerce").fillna(0).round(4)
    strong = [c for c in [
        "cliente_key", "fecha_d", "_doc_norm", "sku_canon", "_neto_r", "_cant_r",
    ] if c in df.columns]
    if len(strong) >= 4:
        df = df.drop_duplicates(subset=strong, keep="last")
    else:
        weak = [c for c in ["cliente_key", "fecha_d", "sku_canon", "_neto_r", "_cant_r"] if c in df.columns]
        if weak:
            df = df.drop_duplicates(subset=weak, keep="last")
    df = df.drop(columns=[c for c in ("_doc_norm", "_neto_r", "_cant_r") if c in df.columns], errors="ignore")
    after = len(df)
    if after < before:
        print(f"  ventas dedupe: {before} → {after} (quitadas {before - after})")
    else:
        print(f"  ventas dedupe: sin duplicados ({after} filas)")
    return df


def audit_duplicados_carga(excel_df: pd.DataFrame, hist_df: pd.DataFrame, mes_trabajo: date) -> dict:
    """
    Revisa si el Excel es un re-carga / archivo pisado con facturas ya existentes.
    - Duplicados internos del Excel
    - Solape con histórico Supabase (misma factura+sku+$ )
    - Inflación de documentos del mes
    Aborta si detecta re-carga masiva que duplicaría el MTD (salvo KF_FORCE_VENTAS).
    """
    report = {
        "excel_rows": 0,
        "excel_dups_internos": 0,
        "ya_en_hist": 0,
        "nuevas": 0,
        "pct_ya_en_hist": 0.0,
        "docs_excel_mes": 0,
        "docs_hist_mes": 0,
        "abort": False,
        "reason": "",
    }
    if excel_df is None or excel_df.empty:
        return report

    ex = excel_df.copy()
    if "numero_doc" in ex.columns and "numero_documento" not in ex.columns:
        ex["numero_documento"] = ex["numero_doc"]

    report["excel_rows"] = len(ex)

    # 1) Duplicados internos
    keys_list = []
    for _, r in ex.iterrows():
        keys_list.append(_venta_key_row(r))
    key_series = pd.Series(keys_list)
    dups_mask = key_series.duplicated(keep="first")
    report["excel_dups_internos"] = int(dups_mask.sum())
    if report["excel_dups_internos"]:
        print(f"  AUDIT DUPS Excel interno: {report['excel_dups_internos']} líneas repetidas (se deduplican)")

    # 2) Solape con histórico
    hist_keys = set()
    if hist_df is not None and not hist_df.empty:
        hi = hist_df.copy()
        if "numero_doc" in hi.columns and "numero_documento" not in hi.columns:
            hi["numero_documento"] = hi["numero_doc"]
        for _, r in hi.iterrows():
            hist_keys.add(_venta_key_row(r))

    ya = 0
    nuevas_keys = []
    for k in keys_list:
        if k in hist_keys:
            ya += 1
        else:
            nuevas_keys.append(k)
    report["ya_en_hist"] = ya
    report["nuevas"] = len(keys_list) - ya
    report["pct_ya_en_hist"] = (100.0 * ya / len(keys_list)) if keys_list else 0.0
    print(
        f"  AUDIT DUPS vs histórico: ya_en_hist={ya} ({report['pct_ya_en_hist']:.1f}%) · "
        f"nuevas={report['nuevas']} de {len(keys_list)}"
    )

    # 3) Documentos del mes
    mes_fin = (mes_trabajo.replace(day=28) + timedelta(days=4)).replace(day=1)

    def _docs_mes(df):
        if df is None or df.empty or "fecha_d" not in df.columns:
            return set()
        m = df[(df["fecha_d"] >= mes_trabajo) & (df["fecha_d"] < mes_fin)]
        if m.empty:
            return set()
        col = "numero_documento" if "numero_documento" in m.columns else (
            "numero_doc" if "numero_doc" in m.columns else None
        )
        if not col:
            return set()
        return set(_norm_doc(x) for x in m[col].tolist() if _norm_doc(x))

    docs_ex = _docs_mes(ex)
    docs_hi = _docs_mes(hist_df) if hist_df is not None else set()
    report["docs_excel_mes"] = len(docs_ex)
    report["docs_hist_mes"] = len(docs_hi)
    docs_overlap = docs_ex & docs_hi
    print(
        f"  AUDIT DUPS docs mes: excel={len(docs_ex)} · hist={len(docs_hi)} · "
        f"solape_docs={len(docs_overlap)}"
    )

    # 4) Heurística de archivo pisado / re-carga peligrosa
    # Si >70% de las líneas del Excel ya están en hist → es re-carga, no debe inflar
    if report["pct_ya_en_hist"] >= 70 and report["excel_rows"] >= 200:
        print(
            "  ✓ Re-carga detectada (≥70% líneas ya en histórico): "
            "se usará anti-doble; no deberían sumarse de nuevo."
        )
    # Si pocas líneas nuevas pero el Excel trae casi todos los docs del mes otra vez
    if docs_hi and docs_ex:
        pct_docs = 100.0 * len(docs_overlap) / max(len(docs_ex), 1)
        if pct_docs >= 80 and report["pct_ya_en_hist"] >= 50:
            print(
                f"  ✓ Facturas del mes ya conocidas ({pct_docs:.0f}% docs Excel ⊂ hist). "
                f"Solo aportan {report['nuevas']} líneas nuevas."
            )

    # 5) Caso peligroso: Excel grande "nuevo" que no matchea keys (formato distinto)
    # pero documentos sí existen → riesgo de doble con otro hash
    if docs_hi and docs_ex and len(docs_overlap) >= 50:
        pct_docs = 100.0 * len(docs_overlap) / max(len(docs_ex), 1)
        if pct_docs >= 60 and report["pct_ya_en_hist"] < 40:
            # Mismos números de factura, pocas líneas exactas → probable cambio de formato
            msg = (
                f"ALERTA DUPLICADOS: {pct_docs:.0f}% de facturas del Excel ya existen en histórico, "
                f"pero solo {report['pct_ya_en_hist']:.1f}% de líneas matchean exacto. "
                f"Riesgo de doble conteo por formato distinto (nº doc / decimales)."
            )
            print(f"  ⚠ {msg}")
            if not FORCE_VENTAS:
                report["abort"] = True
                report["reason"] = msg
            else:
                print("  ⚠ FORCE_VENTAS: se continúa pese a alerta de duplicados por formato")

    return report


def audit_venta_mtd(ventas: pd.DataFrame, mes_inicio: date) -> None:
    """Log de control: total MTD y por zona_vendedor (detecta doble conteo)."""
    if ventas is None or ventas.empty:
        return
    mes_fin = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    vm = ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin)]
    total = float(vm["venta_neta_clp"].fillna(0).sum())
    print(f"  AUDIT MTD {mes_inicio}: filas={len(vm)} neto=${total:,.0f}")
    if "zona_vendedor" in vm.columns:
        by_z = vm.groupby("zona_vendedor")["venta_neta_clp"].sum().sort_values(ascending=False)
        for z, v in by_z.items():
            print(f"    {z}: ${float(v):,.0f}")
        s = float(by_z.sum())
        print(f"    SUMA zonas=${s:,.0f} | diff vs total=${abs(s-total):,.0f}")
    ncol = "numero_documento" if "numero_documento" in vm.columns else ("numero_doc" if "numero_doc" in vm.columns else None)
    if ncol:
        print(f"    docs distintos: {vm[ncol].nunique()}")



def fetch_cartera_previa(sb) -> List[dict]:
    """Snapshot de cartera en Supabase para diff de maestra (paginado)."""
    if sb is None:
        return []
    try:
        page, start, rows = 1000, 0, []
        while True:
            q = (
                sb.table("cartera")
                .select("cliente_key,nombre_cliente,ejecutivo_id,venta_mtd,dias_sin_comprar,estado_fuga,sku_detalle,ultima_compra")
                .range(start, start + page - 1)
            )
            chunk = q.execute().data or []
            rows.extend(chunk)
            if len(chunk) < page:
                break
            start += page
            if start > 20000:
                break
        print(f"  cartera previa Supabase: {len(rows)} filas")
        return rows
    except Exception as e:
        print(f"  cartera previa: {str(e)[:120]}")
        return []


def audit_maestra_incremental(maestra: pd.DataFrame, prev: List[dict]) -> dict:
    """
    Diff maestra Excel vs cartera publicada.
    Permite verificar reasignaciones, altas y bajas antes de publicar.
    """
    report = {
        "n_maestra": 0,
        "n_prev": len(prev or []),
        "nuevos": [],
        "bajas": [],
        "cambio_zona": [],
        "sin_zona": 0,
        "por_zona": {},
    }
    if maestra is None or maestra.empty:
        print("  AUDIT MAESTRA: Excel vacío")
        return report

    m = maestra.copy()
    m["cliente_key"] = m["cliente_key"].map(lambda x: str(x).strip() if x is not None else "")
    m = m[m["cliente_key"] != ""]
    report["n_maestra"] = len(m)
    report["por_zona"] = m["zona"].value_counts().to_dict() if "zona" in m.columns else {}

    prev_map = {}
    for r in prev or []:
        ck = str(r.get("cliente_key") or "").strip()
        if not ck:
            continue
        prev_map[ck] = {
            "zona": str(r.get("zona") or "").strip().upper() or "NO_ASIGNADO",
            "nombre": r.get("nombre_cliente"),
        }

    new_map = {}
    for _, r in m.iterrows():
        ck = str(r.get("cliente_key") or "").strip()
        z = str(r.get("zona") or "NO_ASIGNADO").strip().upper() or "NO_ASIGNADO"
        nom = _s(r.get("nombre_comercial") or r.get("razon_social") or r.get("nombre") or ck)
        new_map[ck] = {"zona": z, "nombre": nom}
        if z in ("", "NO_ASIGNADO", "OTROS", "NONE", "NAN"):
            report["sin_zona"] += 1

    for ck, info in new_map.items():
        if ck not in prev_map:
            report["nuevos"].append({"cliente_key": ck, "zona": info["zona"], "nombre": info["nombre"]})
        else:
            z0 = prev_map[ck]["zona"]
            z1 = info["zona"]
            if z0 and z1 and z0 != z1:
                report["cambio_zona"].append({
                    "cliente_key": ck,
                    "nombre": info["nombre"],
                    "zona_antes": z0,
                    "zona_ahora": z1,
                })

    for ck, info in prev_map.items():
        if ck not in new_map:
            report["bajas"].append({"cliente_key": ck, "zona": info["zona"], "nombre": info["nombre"]})

    print(f"  AUDIT MAESTRA Excel={report['n_maestra']} | prev cartera={report['n_prev']}")
    print(f"    altas={len(report['nuevos'])} · bajas={len(report['bajas'])} · cambio zona={len(report['cambio_zona'])} · sin zona={report['sin_zona']}")
    if report["por_zona"]:
        topz = sorted(report["por_zona"].items(), key=lambda x: -x[1])[:12]
        print("    por zona:", ", ".join(f"{z}={n}" for z, n in topz))
    for row in report["cambio_zona"][:8]:
        print(f"    ZONA {row['cliente_key']}: {row['zona_antes']} → {row['zona_ahora']} · {row['nombre']}")
    if len(report["cambio_zona"]) > 8:
        print(f"    … +{len(report['cambio_zona']) - 8} cambios de zona")
    for row in report["nuevos"][:5]:
        print(f"    ALTA {row['cliente_key']} · {row['zona']} · {row['nombre']}")
    for row in report["bajas"][:5]:
        print(f"    BAJA {row['cliente_key']} · {row['zona']} · {row['nombre']}")

    # Seguridad: maestra no puede caer >25% sin force
    if report["n_prev"] >= 200 and report["n_maestra"] < report["n_prev"] * 0.75:
        msg = (
            f"Maestra Excel tiene {report['n_maestra']} clientes vs {report['n_prev']} en cartera. "
            f"Posible archivo parcial. Usá KF_FORCE_MAESTRA=1 si es intencional."
        )
        if not FORCE_MAESTRA:
            raise SystemExit(msg)
        print(f"  ⚠ FORCE_MAESTRA: {msg}")

    return report


def audit_recompra_signals(cartera_rows: List[dict], limit: int = 8) -> None:
    """
    Verifica que sku_detalle traiga ciclo/última para insights de Hoy.
    Muestra muestra de clientes terreno con señal de reponer.
    """
    from collections import Counter
    n_det = 0
    n_ciclo = 0
    n_reponer = 0
    samples = []
    for r in cartera_rows or []:
        if r.get("zona") not in ZONAS_TERRENO:
            continue
        det = str(r.get("sku_detalle") or "")
        if not det or det in ("None", "nan"):
            continue
        n_det += 1
        # Formato ciclo: nombre|prom|mtd|…|ultima|ciclo|n
        parts_all = [p for p in det.replace("||", "|").split("|") if p is not None]
        # conteo simple de tokens numéricos de ciclo en segmentos
        has_ciclo = False
        # parse tosco: si aparece patrón de fechas y números de ciclo en el string
        if re.search(r"\d{4}-\d{2}-\d{2}", det) and re.search(r"\|\d{1,3}(\.\d+)?\|", det):
            has_ciclo = True
            n_ciclo += 1
        dias = r.get("dias_sin_comprar")
        try:
            dias_n = int(dias) if dias is not None else None
        except Exception:
            dias_n = None
        if dias_n is not None and dias_n >= 14 and dias_n < 999:
            n_reponer += 1
            if len(samples) < limit:
                samples.append({
                    "ck": r.get("cliente_key"),
                    "nom": (r.get("nombre_cliente") or "")[:40],
                    "zona": r.get("zona"),
                    "dias": dias_n,
                    "has_ciclo": has_ciclo,
                    "sku_len": len(det),
                })
    print(f"  AUDIT RECOMPRA terreno: con sku_detalle={n_det} · con señal ciclo/fecha≈{n_ciclo} · dias≥14={n_reponer}")
    for s in samples:
        print(
            f"    {s['zona']} · {s['ck']} · hace {s['dias']}d · ciclo_data={'sí' if s['has_ciclo'] else 'no'} · "
            f"{s['nom']} · sku_detalle chars={s['sku_len']}"
        )


def build_cartera_rows(
    maestra: pd.DataFrame,
    ventas: pd.DataFrame,
    detalle: Dict[str, Any],
    ofertas: Dict[str, str],
    mes_inicio: date,
    ejecutivos_map: Dict[str, str],
) -> List[dict]:
    mes_fin = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    # venta_mtd por cliente
    mtd = {}
    if not ventas.empty:
        vm = ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin)]
        mtd = vm.groupby("cliente_key")["venta_neta_clp"].sum().to_dict()

    # última compra + histórico
    ultima = {}
    hist = {}
    if not ventas.empty:
        ultima = ventas.groupby("cliente_key")["fecha_d"].max().to_dict()
        hist = ventas.groupby("cliente_key")["venta_neta_clp"].sum().to_dict()

    hoy = date.today()
    # primera compra histórica por cliente (para es_nuevo_mes)
    primera_compra = {}
    if not ventas.empty:
        primera_compra = ventas.groupby("cliente_key")["fecha_d"].min().to_dict()
    nombres_venta, comunas_venta = {}, {}
    if not ventas.empty:
        if "nombre_cliente" in ventas.columns:
            for ck_v, g in ventas.groupby("cliente_key"):
                nom = next((x for x in g["nombre_cliente"].tolist() if _s(x)), None)
                if nom:
                    nombres_venta[ck_v] = nom
        if "comuna_venta" in ventas.columns:
            for ck_v, g in ventas.groupby("cliente_key"):
                com = next((x for x in g["comuna_venta"].tolist() if _s(x)), None)
                if com:
                    comunas_venta[ck_v] = com
    rows = []
    for _, r in maestra.iterrows():
        ck = r["cliente_key"]
        zona = r.get("zona") or "NO_ASIGNADO"
        eid = ejecutivos_map.get(zona) or ejecutivos_map.get("NOR-ORIENTE")
        ult = ultima.get(ck)
        dias = (hoy - ult).days if ult else None
        nunca = ult is None
        est, est_txt = estado_fuga(dias, nunca)
        tel, wa = telefono_wa(r.get("telefono"))
        det = detalle.get(ck) or {}
        v_mtd = float(mtd.get(ck) or 0)
        v_hist = float(hist.get(ck) or 0)
        # venta mensual ref ~ hist/6 simplificado si no hay mejor
        v_men = round(v_hist / 6.0, 0) if v_hist else 0
        rows.append(
            {
                "cliente_key": ck,
                "ejecutivo_id": eid,
                "zona": zona,
                "nombre_cliente": (
                    _s(r.get("razon_social"))
                    or _s(r.get("nombre_cliente"))
                    or _s(r.get("nombre_comercial"))
                    or nombres_venta.get(ck)
                    or ck
                ),
                "comuna": (
                    _s(r.get("comuna"))
                    if _s(r.get("comuna")) and str(r.get("comuna")).strip() not in ("0", "None", "nan")
                    else (comunas_venta.get(ck) or _s(r.get("comuna")))
                ),
                "direccion": _s(r.get("direccion")),
                "persona_contacto": _s(r.get("persona_contacto")),
                "telefono": tel,
                "link_whatsapp": wa,
                "ultima_compra": ult.isoformat() if ult else None,
                "dias_sin_comprar": dias if dias is not None else 999,
                "venta_mtd": round(v_mtd, 0),
                # alias históricos del schema app
                "venta_mensual": v_men,
                "venta_mensual_historica_clp": v_men,
                "venta_historica": round(v_hist, 0),
                "venta_total_historica_clp": round(v_hist, 0),
                "estado_fuga": est,
                "estado_texto": est_txt,
                "productos_top": det.get("productos_top"),
                "sku_detalle": det.get("sku_detalle"),
                "oferta_real": ofertas.get(ck),
                "fecha_snapshot": hoy.isoformat(),
                # Nuevo del mes = primera factura cae en el mes en curso
                "es_nuevo_mes": bool(
                    primera_compra.get(ck) is not None
                    and primera_compra.get(ck) >= mes_inicio
                    and v_mtd > 0
                ),
            }
        )
    return rows


def build_stock_rows(stock: pd.DataFrame, precios: pd.DataFrame, ventas: pd.DataFrame, mes_inicio: date, foco_sku_map: Optional[Dict[str, str]] = None, media_map: Optional[Dict[str, dict]] = None) -> List[dict]:
    """
    BASE = lista de precios (Excel).
    Stock (API diario + corta-fecha) solo aporta disponibilidad / vencimiento.
    SKUs solo en stock sin precio quedan al final (operativo, no catálogo web).
    """
    ritmo = {}
    if not ventas.empty and "sku_canon" in ventas.columns and "cantidad" in ventas.columns:
        desde = mes_inicio - timedelta(days=30)
        recent = ventas[ventas["fecha_d"] >= desde]
        for sku, g in recent.groupby("sku_canon"):
            if not sku:
                continue
            ritmo[str(sku)] = float(g["cantidad"].fillna(0).sum()) / 30.0

    # --- mapa precios (maestro) ---
    cat: Dict[str, dict] = {}
    if precios is not None and not precios.empty and "sku_canon" in precios.columns:
        for _, r in precios.iterrows():
            sk = r.get("sku_canon")
            if not sk:
                continue
            sks = str(sk).strip()
            pu = _f(r.get("precio_unidad"))
            pc = _f(r.get("precio_caja"))
            pk = _f(r.get("precio_kilo"))
            if not pu and not pc and not pk:
                continue
            cat[sks] = {
                "categoria": _s(r.get("categoria")),
                "descripcion": _s(r.get("descripcion")),
                "precio_unidad": pu or pc or pk,
                "precio_caja": pc,
                "precio_kilo": pk,
                "kg_unidad": _f(r.get("kg_unidad")),
                "marca": _s(r.get("marca")),
                "unidad_venta": _s(r.get("unidad_venta")),
                "imagen_url": _s(r.get("imagen_url")),
                "resena": _s(r.get("resena")),
                "ficha_url": _s(r.get("ficha_url")),
            }

    # --- índice stock operativo ---
    stock_ix: Dict[str, dict] = {}
    if stock is not None and not stock.empty:
        for _, r in stock.iterrows():
            sk = r.get("sku_canon")
            if not sk:
                continue
            sks = str(sk).strip()
            stock_ix[sks] = {
                "stock_total": _f(r.get("stock_total")) or _f(r.get("stock_kg")) or 0,
                "descripcion": _s(r.get("descripcion")),
                "familia": _s(r.get("familia")),
                "status_venc": _s(r.get("status_venc")),
                "dias_venc": r.get("dias_venc"),
                "fecha_venc": r.get("fecha_venc"),
            }

    def lookup_stock(sk: str) -> dict:
        if sk in stock_ix:
            return stock_ix[sk]
        d = re.sub(r"\D", "", sk).lstrip("0") or re.sub(r"\D", "", sk)
        for k, v in stock_ix.items():
            kd = re.sub(r"\D", "", k).lstrip("0") or re.sub(r"\D", "", k)
            if d and kd and d == kd:
                return v
        return {}

    rows: List[dict] = []
    seen = set()

    # 1) Todos los de la LISTA DE PRECIOS (con o sin stock)
    for sk, meta0 in cat.items():
        meta = dict(meta0)
        med = (media_map or {}).get(sk) or {}
        for k in ("imagen_url", "ficha_url", "resena"):
            if med.get(k):
                meta[k] = med[k]
        st_info = lookup_stock(sk)
        st = float(st_info.get("stock_total") or 0)
        ri = ritmo.get(sk) or 0
        dias_cob = round(st / ri, 1) if ri > 0 else None
        st_venc = st_info.get("status_venc")
        estado = "OK"
        if st <= 0:
            estado = "SIN_STOCK"
        elif st_venc:
            u = str(st_venc).lower()
            if u.startswith("venc"):
                estado = "VENCIDO"
            elif "crit" in u or "acci" in u:
                estado = "CRITICO"
            elif "seguim" in u or "empuje" in u or "urgente" in u:
                estado = "BAJO"
        elif dias_cob is not None and dias_cob < 7:
            estado = "CRITICO"
        elif dias_cob is not None and dias_cob < 21:
            estado = "BAJO"
        nombre = meta.get("descripcion") or st_info.get("descripcion") or sk
        decision = {
            "SIN_STOCK": "NO_VENDER",
            "VENCIDO": "SACAR_DE_VENTA",
            "CRITICO": "PRIORIZAR_VENTA",
            "BAJO": "CONTROLAR",
            "OK": "DISPONIBLE",
        }.get(estado, "DISPONIBLE")
        rows.append({
            "sku_canon": sk,
            "producto_nombre": nombre,
            "stock_operativo": st,
            "estado_stock": estado,
            "decision_comercial": decision,
            "cobertura_dias": dias_cob,
            "es_foco_mes": bool(foco_sku_map and sk in (foco_sku_map or {})),
            "foco": (foco_sku_map or {}).get(sk),
            "subfamilia": meta.get("categoria") or st_info.get("familia"),
            "precio_unidad": meta.get("precio_unidad"),
            "precio_caja": meta.get("precio_caja"),
            "precio_kilo": (
                round(float(meta["precio_unidad"]) / float(meta["kg_unidad"]), 0)
                if meta.get("precio_unidad") and meta.get("kg_unidad") and float(meta.get("kg_unidad") or 0) > 0
                else meta.get("precio_kilo")
            ),
            "marca": meta.get("marca") or None,
            "unidad_venta": meta.get("unidad_venta") or None,
            "imagen_url": meta.get("imagen_url") or None,
            "resena": meta.get("resena") or None,
            "ficha_url": meta.get("ficha_url") or None,
            "fecha_snapshot": date.today().isoformat(),
        })
        seen.add(sk)

    # 2) Stock sin precio (solo operativo en app Stock; catálogo web los filtra)
    for sk, st_info in stock_ix.items():
        if sk in seen:
            continue
        st = float(st_info.get("stock_total") or 0)
        st_venc = st_info.get("status_venc")
        estado = "OK"
        if st <= 0:
            estado = "SIN_STOCK"
        elif st_venc and str(st_venc).lower().startswith("venc"):
            estado = "VENCIDO"
        elif st_venc and "crit" in str(st_venc).lower():
            estado = "CRITICO"
        rows.append({
            "sku_canon": sk,
            "producto_nombre": st_info.get("descripcion") or sk,
            "stock_operativo": st,
            "estado_stock": estado,
            "decision_comercial": "SIN_PRECIO_LISTA",
            "cobertura_dias": None,
            "es_foco_mes": bool(foco_sku_map and sk in (foco_sku_map or {})),
            "foco": (foco_sku_map or {}).get(sk),
            "subfamilia": st_info.get("familia"),
            "precio_unidad": None,
            "precio_caja": None,
            "precio_kilo": None,
            "marca": None,
            "unidad_venta": None,
            "imagen_url": None,
            "resena": None,
            "ficha_url": None,
            "fecha_snapshot": date.today().isoformat(),
        })

    n_con = sum(1 for r in rows if (r.get("precio_unidad") or 0) > 0)
    n_sin = sum(1 for r in rows if not (r.get("precio_unidad") or 0) > 0)
    print(f"  build_stock BASE=lista_precios con_precio={n_con} solo_stock_sin_precio={n_sin} total={len(rows)}")
    return rows



def build_gerencia(
    cartera_rows: List[dict],
    ventas: pd.DataFrame,
    mes_inicio: date,
    metas_rows: Optional[List[dict]] = None,
) -> List[dict]:
    """
    Venta atribuida SOLO por ejecutivo de la MAESTRA (columna EJECUTIVO / I).
    No se suma por zona_vendedor de la factura (eso era el doble conteo).
    Cada línea de venta cuenta UNA vez → zona del cliente en maestra.
    """
    mes_fin = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    # cliente_key → zona maestra
    zona_ck: Dict[str, str] = {}
    nombre_ck: Dict[str, str] = {}
    for r in cartera_rows:
        ck = str(r.get("cliente_key") or "")
        if ck:
            zona_ck[ck] = r.get("zona") or "NO_ASIGNADO"
            if r.get("nombre_cliente"):
                nombre_ck[ck] = r["nombre_cliente"]

    venta_zona: Dict[str, float] = defaultdict(float)
    clientes_zona: Dict[str, set] = defaultdict(set)
    # top productos global y por zona: sku -> (nombre, clp, kg)
    prod_global: Dict[str, dict] = {}
    prod_zona: Dict[str, Dict[str, dict]] = defaultdict(dict)

    total_mtd = 0.0
    if not ventas.empty:
        vm = ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin)].copy()
        for _, row in vm.iterrows():
            ck = str(row.get("cliente_key") or "")
            neto = float(row.get("venta_neta_clp") or 0)
            if neto == 0:
                continue
            z = zona_ck.get(ck) or "NO_ASIGNADO"
            # si no está en maestra, intentar nombre de venta y dejar NO_ASIGNADO
            venta_zona[z] += neto
            total_mtd += neto
            if ck:
                clientes_zona[z].add(ck)
            sku = str(row.get("sku_canon") or "") or "SIN_SKU"
            nom = _s(row.get("producto_nombre")) or sku
            cant = float(row.get("cantidad") or 0)
            for bucket in (prod_global, prod_zona[z]):
                if sku not in bucket:
                    bucket[sku] = {"nombre": nom, "clp": 0.0, "cant": 0.0}
                bucket[sku]["clp"] += neto
                bucket[sku]["cant"] += cant
                if nom and not bucket[sku]["nombre"]:
                    bucket[sku]["nombre"] = nom

    meta_by_zona = {}
    if metas_rows:
        for m in metas_rows:
            z = m.get("zona") or m.get("ejecutivo")
            if z:
                meta_by_zona[z] = float(m.get("meta_mensual") or 0)

    # ranking productos global (top 8)
    top_global = sorted(prod_global.values(), key=lambda x: -x["clp"])[:8]
    top_global_txt = " · ".join(
        f"{x['nombre'][:28]} ${x['clp']/1e6:.1f}M" for x in top_global
    ) if top_global else ""

    zonas = sorted(
        set(list(venta_zona.keys()) + list(meta_by_zona.keys()) + list({r.get("zona") for r in cartera_rows})),
        key=lambda z: -venta_zona.get(z, 0),
    )
    rows = []
    print(f"  gerencia MTD total (1 conteo, por maestra) = ${total_mtd:,.0f}")
    for z in zonas:
        venta = round(venta_zona.get(z, 0), 0)
        if venta <= 0 and z not in meta_by_zona and z not in ZONAS_TERRENO:
            continue
        meta = meta_by_zona.get(z, 0) or 0
        brecha = round(meta - venta, 0) if meta else None
        pct = round(100.0 * venta / total_mtd, 1) if total_mtd else 0
        n_cli = len(clientes_zona.get(z, set()))
        if meta and venta >= meta:
            estado, accion = "CUMPLIDA", "Mantener ritmo"
        elif meta and venta >= meta * 0.8:
            estado, accion = "EN_RITMO", "Cerrar brecha"
        elif meta:
            estado, accion = "ATRASADA", "Acelerar visitas y focos"
        else:
            estado, accion = "SIN_META", "Definir meta"
        # top 5 productos de la zona
        tops = sorted((prod_zona.get(z) or {}).values(), key=lambda x: -x["clp"])[:5]
        top_txt = " | ".join(f"{x['nombre'][:22]} ${x['clp']/1e6:.2f}M" for x in tops)
        accion_full = f"{accion} · {pct}% del total · {n_cli} clientes MTD"
        if top_txt:
            accion_full = (accion_full + " · TOP: " + top_txt)[:500]
        rows.append(
            {
                "ejecutivo": z,
                "venta_mtd": venta,
                "meta_mensual": meta if meta else None,
                "brecha": brecha,
                "estado_meta": estado,
                "accion": accion_full,
                "fecha_snapshot": date.today().isoformat(),
            }
        )
        print(f"    {z}: ${venta:,.0f} ({pct}%) · {n_cli} clientes")
    if top_global_txt:
        print(f"  TOP productos mes: {top_global_txt}")
        # fila sintética de análisis (no suma venta)
        rows.append(
            {
                "ejecutivo": "_TOP_PRODUCTOS",
                "venta_mtd": 0,
                "meta_mensual": None,
                "brecha": None,
                "estado_meta": "ANALISIS",
                "accion": top_global_txt[:500],
                "fecha_snapshot": date.today().isoformat(),
            }
        )
    return rows



def build_tendencia(ventas: pd.DataFrame, n_meses: int = 12) -> List[dict]:
    """Solo últimos n_meses (default 12) para el gráfico de Gerencia."""
    if ventas.empty:
        return []
    g = ventas.groupby(ventas["fecha"].dt.to_period("M"))["venta_neta_clp"].sum().sort_index()
    if len(g) > n_meses:
        g = g.iloc[-n_meses:]
    rows = []
    for per, val in g.items():
        mes = str(per)
        if len(mes) == 7:  # YYYY-MM
            mes = mes + "-01"
        rows.append({"mes": mes, "venta_clp": round(float(val), 0)})
    print(f"  tendencia: {len(rows)} meses (últimos {n_meses})")
    return rows



# ---------------------------------------------------------------------------
# GEOCODE CARTERA (Google Geocoding API)
# ---------------------------------------------------------------------------
# Bbox RM (ampliado un poco para Melipilla/Colina/Paine)
RM_LAT_MIN, RM_LAT_MAX = -34.25, -32.85
RM_LNG_MIN, RM_LNG_MAX = -71.55, -70.15

SKIP_GEOCODE = os.environ.get("KF_SKIP_GEOCODE", "") in ("1", "true", "True")
GEOCODE_LIMIT = int(os.environ.get("KF_GEOCODE_LIMIT", "0") or 0)  # 0 = todos los candidatos


def _comuna_ok(c: Any) -> bool:
    s = _s(c)
    if not s:
        return False
    bad = {"0", "NONE", "NULL", "NAN", "-", "S/I", "SI", "NO"}
    return s.upper() not in bad and len(s) >= 3


def _in_rm(lat: float, lng: float) -> bool:
    return RM_LAT_MIN <= lat <= RM_LAT_MAX and RM_LNG_MIN <= lng <= RM_LNG_MAX


def _comuna_match(comuna: str, formatted: str, components: list) -> bool:
    """True si comuna maestra aparece en el resultado (fuzzy)."""
    if not _comuna_ok(comuna):
        return True  # no podemos validar
    target = _norm_col(comuna).replace("NUNOA", "NUNOA").replace("PENA", "PENA")
    # normalizar ñ
    def strip_n(x: str) -> str:
        return (
            x.upper()
            .replace("Ñ", "N")
            .replace("Á", "A")
            .replace("É", "E")
            .replace("Í", "I")
            .replace("Ó", "O")
            .replace("Ú", "U")
        )
    t = strip_n(comuna)
    f = strip_n(formatted or "")
    if t in f:
        return True
    for comp in components or []:
        types = comp.get("types") or []
        if any(x in types for x in ("locality", "administrative_area_level_3", "sublocality")):
            if t in strip_n(comp.get("long_name") or "") or t in strip_n(comp.get("short_name") or ""):
                return True
    # match parcial (primer token)
    token = t.split()[0] if t else ""
    if len(token) >= 4 and token in f:
        return True
    return False


def geocode_address(api_key: str, direccion: str, comuna: Optional[str] = None) -> Optional[dict]:
    """Geocoding API. Devuelve {lat,lng,precision,formatted} o None."""
    if not requests or not api_key:
        return None
    d = _s(direccion)
    if not d or len(d) < 5:
        return None
    if d.upper() in ("SANTIAGO", "CHILE", "RM"):
        return None
    parts = [d]
    if _comuna_ok(comuna):
        parts.append(_s(comuna))
    parts.append("Región Metropolitana")
    parts.append("Chile")
    address = ", ".join(parts)
    params = {
        "address": address,
        "key": api_key,
        "region": "cl",
        "language": "es",
        "components": "country:CL",
    }
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params=params,
            timeout=25,
        )
        data = r.json()
    except Exception as e:
        print(f"  geocode error: {e}")
        return None
    status = data.get("status")
    if status != "OK":
        if status not in ("ZERO_RESULTS",):
            print(f"  geocode status={status} q={address[:70]}")
        return None
    results = data.get("results") or []
    if not results:
        return None
    # preferir mejor location_type
    order = {"ROOFTOP": 0, "RANGE_INTERPOLATED": 1, "GEOMETRIC_CENTER": 2, "APPROXIMATE": 3}
    results = sorted(
        results,
        key=lambda x: order.get(((x.get("geometry") or {}).get("location_type") or "APPROXIMATE"), 9),
    )
    for res in results:
        geom = res.get("geometry") or {}
        loc = geom.get("location") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        if lat is None or lng is None:
            continue
        lat, lng = float(lat), float(lng)
        if not _in_rm(lat, lng):
            continue
        formatted = res.get("formatted_address") or ""
        comps = res.get("address_components") or []
        if not _comuna_match(comuna or "", formatted, comps):
            continue
        return {
            "lat": lat,
            "lng": lng,
            "precision": geom.get("location_type"),
            "formatted": formatted,
            "query": address,
        }
    # fallback: primer resultado en RM aunque comuna no matchee (marcar WARN)
    for res in results:
        geom = res.get("geometry") or {}
        loc = geom.get("location") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        if lat is None or lng is None:
            continue
        lat, lng = float(lat), float(lng)
        if _in_rm(lat, lng):
            return {
                "lat": lat,
                "lng": lng,
                "precision": "WARN_" + str(geom.get("location_type") or "APPROXIMATE"),
                "formatted": res.get("formatted_address"),
                "query": address,
            }
    return None


def load_geo_existente(sb) -> Dict[str, Tuple[float, float]]:
    """cliente_key -> (lat,lng) ya en Supabase."""
    out: Dict[str, Tuple[float, float]] = {}
    if not sb:
        return out
    try:
        data = (
            sb.table("cartera")
            .select("cliente_key,lat,lng")
            .not_.is_("lat", "null")
            .execute()
            .data
            or []
        )
        for r in data:
            ck = normalize_cliente_key(r.get("cliente_key")) or str(r.get("cliente_key") or "")
            lat, lng = r.get("lat"), r.get("lng")
            if ck and lat is not None and lng is not None:
                try:
                    la, ln = float(lat), float(lng)
                    if _in_rm(la, ln):
                        out[ck] = (la, ln)
                except Exception:
                    pass
        print(f"  geo cache supabase: {len(out)} clientes con lat/lng válidos")
    except Exception as e:
        print(f"  geo cache skip: {str(e)[:80]}")
    return out


def geocode_cartera_rows(
    rows: List[dict],
    api_key: Optional[str],
    geo_cache: Dict[str, Tuple[float, float]],
) -> List[dict]:
    """
    Rellena lat/lng en cada fila de cartera.
    Prioridad: cache Supabase → Geocoding API (solo sin coord).
    """
    if SKIP_GEOCODE:
        print("  geocode omitido (KF_SKIP_GEOCODE=1)")
        for r in rows:
            ck = r.get("cliente_key")
            if ck in geo_cache:
                r["lat"], r["lng"] = geo_cache[ck]
        return rows

    ok = warn = fail = skip = cached = 0
    candidates = []
    for r in rows:
        ck = r.get("cliente_key")
        ck_n = normalize_cliente_key(ck) or ck
        if ck_n and ck_n in geo_cache:
            r["lat"], r["lng"] = geo_cache[ck_n]
            cached += 1
            continue
        if ck and ck in geo_cache:
            r["lat"], r["lng"] = geo_cache[ck]
            cached += 1
            continue
        if r.get("lat") is not None and r.get("lng") is not None:
            cached += 1
            continue
        d = _s(r.get("direccion"))
        if not d or len(d) < 5:
            skip += 1
            continue
        candidates.append(r)

    if GEOCODE_LIMIT > 0:
        candidates = candidates[:GEOCODE_LIMIT]

    print(f"  geo: cache={cached} candidatos_api={len(candidates)} skip_dir={skip}")

    if not api_key:
        print("  geo: sin GOOGLE_MAPS_API_KEY — solo cache")
        return rows

    for i, r in enumerate(candidates, 1):
        res = geocode_address(api_key, r.get("direccion"), r.get("comuna"))
        if not res:
            fail += 1
            if i <= 5 or fail <= 3:
                print(f"  [{i}] FAIL {_s(r.get('nombre_cliente'))[:40]} | {_s(r.get('direccion'))[:40]}")
            time.sleep(0.12)
            continue
        r["lat"] = res["lat"]
        r["lng"] = res["lng"]
        prec = res.get("precision") or ""
        if str(prec).startswith("WARN"):
            warn += 1
            if warn <= 5:
                print(f"  [{i}] WARN {prec} | {_s(r.get('nombre_cliente'))[:30]} → {res['lat']:.5f},{res['lng']:.5f}")
        else:
            ok += 1
            if ok <= 5:
                print(f"  [{i}] OK {prec} | {_s(r.get('nombre_cliente'))[:30]} → {res['lat']:.5f},{res['lng']:.5f}")
        time.sleep(0.12)

    con_geo = sum(1 for r in rows if r.get("lat") is not None and r.get("lng") is not None)
    print(f"  geo resultado: ok={ok} warn={warn} fail={fail} | con_geo total={con_geo}/{len(rows)}")
    return rows


# ---------------------------------------------------------------------------
# PLACES
# ---------------------------------------------------------------------------
_PLACES_DIAG_DONE = False


def places_search(api_key: str, query: str, max_results: int = 20) -> List[dict]:
    """Text Search. Reintenta params si INVALID_REQUEST; imprime error_message una vez."""
    global _PLACES_DIAG_DONE
    if not requests or not api_key:
        return []
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    q = " ".join(str(query).split())
    if not q:
        return []

    def _get(params):
        r = requests.get(url, params=params, timeout=30)
        return r.json()

    param_variants = [
        {"query": q, "key": api_key, "language": "es"},
        {"query": q, "key": api_key, "language": "es", "region": "cl"},
        {
            "query": q,
            "key": api_key,
            "language": "es",
            "location": "-33.4489,-70.6693",
            "radius": "25000",
        },
    ]
    data = None
    for params in param_variants:
        try:
            data = _get(params)
        except Exception as e:
            print("  places error:", e)
            return []
        st = data.get("status")
        if st in ("OK", "ZERO_RESULTS"):
            break
        if not _PLACES_DIAG_DONE:
            print(f"  places DIAG status={st} error_message={data.get('error_message')!r}")
            print("  → Cloud Console: habilitar Places API + facturación; key sin HTTP referrer (usar IP o sin restricción)")
            _PLACES_DIAG_DONE = True
        if st in ("REQUEST_DENIED", "OVER_QUERY_LIMIT"):
            return []
        data = None

    if not data:
        return []
    if data.get("status") == "ZERO_RESULTS":
        return []
    if data.get("status") != "OK":
        return []

    out = []
    payload = data
    for _ in range(3):
        for p in payload.get("results") or []:
            loc = (p.get("geometry") or {}).get("location") or {}
            out.append(
                {
                    "place_id": p.get("place_id"),
                    "nombre": p.get("name"),
                    "direccion": p.get("formatted_address"),
                    "lat": loc.get("lat"),
                    "lng": loc.get("lng"),
                    "rating": p.get("rating"),
                    "types": ",".join(p.get("types") or [])[:200],
                }
            )
            if len(out) >= max_results:
                return out
        tok = payload.get("next_page_token")
        if not tok:
            break
        time.sleep(2.1)
        try:
            payload = _get({"pagetoken": tok, "key": api_key})
        except Exception:
            break
        if payload.get("status") != "OK":
            break
    return out


# Centros Nearby Search (misma lógica PROSPECTOS_PLACES_3ZONAS)
PLACES_TYPES_NEARBY = [
    "restaurant", "cafe", "bar", "bakery",
    "meal_delivery", "meal_takeaway", "food",
    "night_club", "lodging",
]
BBOX_PLACES = {
    "NOR-ORIENTE": [
        {"name": "Las Condes",   "lat": -33.408, "lng": -70.565, "r": 4500},
        {"name": "Vitacura",     "lat": -33.385, "lng": -70.590, "r": 3500},
        {"name": "Lo Barnechea", "lat": -33.350, "lng": -70.515, "r": 5000},
        {"name": "La Reina",     "lat": -33.445, "lng": -70.545, "r": 3000},
        {"name": "Peñalolén",    "lat": -33.487, "lng": -70.535, "r": 3500},
        {"name": "Ñuñoa",        "lat": -33.458, "lng": -70.600, "r": 2500},
        # Providencia solo en NOR-PONIENTE
    ],
    "NOR-PONIENTE": [
        {"name": "Santiago Centro", "lat": -33.450, "lng": -70.665, "r": 3000},
        {"name": "Recoleta", "lat": -33.405, "lng": -70.645, "r": 2500},
        {"name": "Independencia", "lat": -33.420, "lng": -70.665, "r": 2000},
        {"name": "Quinta Normal", "lat": -33.435, "lng": -70.693, "r": 2500},
        {"name": "Renca", "lat": -33.405, "lng": -70.715, "r": 3000},
        {"name": "Pudahuel", "lat": -33.440, "lng": -70.762, "r": 4000},
        {"name": "Cerro Navia", "lat": -33.430, "lng": -70.742, "r": 2500},
        {"name": "Quilicura", "lat": -33.360, "lng": -70.728, "r": 3500},
        {"name": "Huechuraba", "lat": -33.365, "lng": -70.650, "r": 3000},
        {"name": "Providencia", "lat": -33.432, "lng": -70.618, "r": 2500},
    ],
    "ZONA SUR": [
        {"name": "Maipú", "lat": -33.513, "lng": -70.762, "r": 4500},
        {"name": "San Bernardo", "lat": -33.600, "lng": -70.700, "r": 4000},
        {"name": "Puente Alto", "lat": -33.610, "lng": -70.575, "r": 4000},
        {"name": "La Florida", "lat": -33.531, "lng": -70.567, "r": 3500},
        {"name": "San Miguel", "lat": -33.497, "lng": -70.652, "r": 2500},
        {"name": "La Cisterna", "lat": -33.530, "lng": -70.664, "r": 2000},
        {"name": "El Bosque", "lat": -33.562, "lng": -70.675, "r": 2500},
        {"name": "Macul", "lat": -33.497, "lng": -70.595, "r": 2500},
    ],
}
MAX_PROSPECTOS_POR_ZONA = int(os.environ.get("KF_MAX_PROSPECTOS_ZONA", "5000") or 5000)


def _product_place_keywords(focos: List[dict], focos_skus: Optional[List[str]] = None) -> List[str]:
    """Keywords de Places a partir de productos foco (portable a otras empresas)."""
    raw = []
    for f in focos or []:
        for k in ("places_keyword", "foco", "sku_canon", "nombre"):
            v = f.get(k)
            if v:
                raw.append(str(v))
    for s in focos_skus or []:
        raw.append(str(s))
    text = " ".join(raw).upper()
    # tokens de negocio foodservice relevantes
    mapping = [
        (r"POLLO|PECHUGA|ALITAS|NUGGET", "pollo restaurant"),
        (r"HAMBUR|BURGER|VACUNO|CARNE|ENTRA", "hamburguesa restaurant"),
        (r"PAPA|FRITA|SURECRISP|ONEFRY", "papas fritas restaurant"),
        (r"SALSA|KETCHUP|HANKS|MAYO", "sandwich salsa"),
        (r"PAN|BAGEL|HAWAII", "bakery sandwich"),
        (r"QUESO|MOZZA|CHEDDAR", "pizzeria restaurant"),
        (r"ACEITE|FRY", "restaurant"),
    ]
    kws = []
    for pat, kw in mapping:
        if re.search(pat, text):
            kws.append(kw)
    if not kws:
        kws = ["restaurant", "comida rapida"]
    # únicos preservando orden
    out = []
    for k in kws:
        if k not in out:
            out.append(k)
    return out


def run_places(
    api_key: str,
    zonas_comunas: Dict[str, List[str]],
    focos: List[dict],
    cartera_nombres: set,
    ejecutivos_map: Dict[str, str],
    focos_skus: Optional[List[str]] = None,
) -> List[dict]:
    """Nearby + Text Search por keywords de producto (SKU foco). Sin tope bajo: max 5000/zona."""
    rows = []
    seen = set()
    nombres_lower = {str(n).lower().strip() for n in (cartera_nombres or set()) if n}
    product_kws = _product_place_keywords(focos, focos_skus)
    print(f"  Places keywords producto: {product_kws}")

    for zona, centros in BBOX_PLACES.items():
        eid = ejecutivos_map.get(zona)
        if not eid:
            print(f"  Places {zona}: sin ejecutivo_id → skip")
            continue
        print(f"  Places Nearby {zona}: {len(centros)} centros × {len(PLACES_TYPES_NEARBY)} tipos")
        n_zona = 0
        for centro in centros:
            if n_zona >= MAX_PROSPECTOS_POR_ZONA:
                break
            for tipo in PLACES_TYPES_NEARBY:
                if n_zona >= MAX_PROSPECTOS_POR_ZONA:
                    break
                try:
                    resp = requests.get(
                        "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                        params={
                            "location": f"{centro['lat']},{centro['lng']}",
                            "radius": centro["r"],
                            "type": tipo,
                            "key": api_key,
                            "language": "es",
                        },
                        timeout=20,
                    ).json()
                except Exception as ex:
                    print(f"    WARN {centro['name']}/{tipo}: {str(ex)[:50]}")
                    continue
                time.sleep(0.12)
                st = resp.get("status")
                if st not in ("OK", "ZERO_RESULTS"):
                    if st:
                        print(f"    nearby status={st} {centro['name']}/{tipo} {resp.get('error_message') or ''}")
                    continue

                def _add(results):
                    nonlocal n_zona
                    c = 0
                    for place in results or []:
                        pid = place.get("place_id") or ""
                        if not pid or pid in seen:
                            continue
                        nombre = (place.get("name") or "").strip()
                        if nombre.lower() in nombres_lower:
                            continue
                        seen.add(pid)
                        loc = (place.get("geometry") or {}).get("location") or {}
                        rows.append(
                            {
                                "cliente_key": pid,
                                "nombre_cliente": nombre,
                                "direccion": place.get("vicinity") or place.get("formatted_address"),
                                "comuna": centro["name"],
                                "lat": loc.get("lat"),
                                "lng": loc.get("lng"),
                                "zona": zona,
                                "ejecutivo_id": eid,
                                "segmento": "PROSPECTO",
                                "oferta": None,
                                "productos_top": ", ".join((place.get("types") or [])[:3]),
                                "score": float(place["rating"]) if place.get("rating") is not None else None,
                                "potencial": None,
                                "estado": "PROSPECTO",
                                "telefono": None,
                                "persona_contacto": None,
                            }
                        )
                        n_zona += 1
                        c += 1
                        if n_zona >= MAX_PROSPECTOS_POR_ZONA:
                            break
                    return c

                _add(resp.get("results"))
                tok = resp.get("next_page_token")
                pages = 0
                while tok and pages < 2 and n_zona < MAX_PROSPECTOS_POR_ZONA:
                    time.sleep(2.2)
                    try:
                        rn = requests.get(
                            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                            params={"pagetoken": tok, "key": api_key},
                            timeout=20,
                        ).json()
                    except Exception:
                        break
                    if rn.get("status") != "OK":
                        break
                    _add(rn.get("results"))
                    tok = rn.get("next_page_token")
                    pages += 1
            # Keywords de producto (Text Search) — portable por SKU/rubro
            for kw in product_kws:
                if n_zona >= MAX_PROSPECTOS_POR_ZONA:
                    break
                q = f"{kw} en {centro['name']}, Santiago, Chile"
                found = places_search(api_key, q, max_results=40)
                time.sleep(0.15)
                fake = []
                for p in found:
                    fake.append({
                        "place_id": p.get("place_id"),
                        "name": p.get("nombre"),
                        "vicinity": p.get("direccion"),
                        "geometry": {"location": {"lat": p.get("lat"), "lng": p.get("lng")}},
                        "rating": p.get("rating"),
                        "types": (p.get("types") or "").split(",") if isinstance(p.get("types"), str) else (p.get("types") or []),
                    })
                _add(fake)
        print(f"    {zona}: {n_zona} prospectos")
    return rows


# ---------------------------------------------------------------------------
# SUPABASE publish
# ---------------------------------------------------------------------------
def _missing_col(msg: str) -> Optional[str]:
    m = re.search(
        r"Could not find the '(\w+)' column|column \"(\w+)\" does not exist",
        msg,
    )
    if not m:
        return None
    return m.group(1) or m.group(2)


def probe_columns(sb, table: str) -> Optional[set]:
    """Intenta leer 1 fila para conocer columnas reales."""
    try:
        data = sb.table(table).select("*").limit(1).execute().data
        if data and isinstance(data, list) and data[0]:
            cols = set(data[0].keys())
            print(f"  schema {table}: {sorted(cols)}")
            return cols
    except Exception as e:
        print(f"  schema {table}: no se pudo leer ({str(e)[:80]})")
    return None


def remap_rows(rows: List[dict], table: str, cols: Optional[set]) -> List[dict]:
    """Renombra campos del ciclo a nombres del schema real si se conocen."""
    aliases = {
        "stock": [
            ("sku", ["sku_canon", "codigo", "codigo_sku", "sku_kl"]),
            ("stock_total", ["stock", "stock_kg", "kilos", "total", "cantidad"]),
            ("descripcion", ["nombre", "producto", "descripcion_kl"]),
            ("dias_cobertura", ["cobertura_dias", "dias"]),
            ("estado", ["estado_stock", "status"]),
        ],
        "gerencia": [
            ("zona", ["ejecutivo", "nombre"]),
            ("venta_mtd", ["venta_mtd_oficial_clp", "venta"]),
            ("clientes_activos", ["activos", "n_activos"]),
        ],
        "prospectos": [
            ("place_id", ["id", "google_place_id", "punto_id"]),
            ("nombre", ["nombre_entidad", "nombre_prospecto", "name"]),
            ("direccion", ["address", "formatted_address"]),
            ("categoria_places", ["types", "categoria", "tipo"]),
        ],
        "metas": [
            ("meta_mensual", ["meta_mensual_clp", "meta"]),
            ("venta_mtd", ["venta_mtd_oficial_clp", "venta"]),
        ],
    }
    out = []
    for r in rows:
        d = dict(r)
        for src, targets in aliases.get(table, []):
            if src in d:
                for t in targets:
                    if cols is None or t in cols:
                        if t not in d:
                            d[t] = d[src]
        if cols:
            d = {k: v for k, v in d.items() if k in cols and v is not None}
        out.append(d)
    return out


def upsert(sb, table: str, rows: List[dict], on_conflict: str, batch: int = 100):
    """Upsert tolerante a schema: parsea errores Postgres y PostgREST."""
    if not rows:
        print(f"  {table}: 0 filas")
        return
    cols = probe_columns(sb, table)
    rows = remap_rows(rows, table, cols)
    drop_cols: set = set()
    ok = 0
    for chunk in chunked(rows, batch):
        clean = [{k: v for k, v in r.items() if v is not None and k not in drop_cols} for r in chunk]
        if not clean or not any(clean):
            continue
        attempts = 0
        while attempts < 30:
            attempts += 1
            try:
                sb.table(table).upsert(clean, on_conflict=on_conflict).execute()
                ok += len(clean)
                break
            except Exception as e:
                msg = str(e)
                col = _missing_col(msg)
                if col:
                    drop_cols.add(col)
                    for r in clean:
                        r.pop(col, None)
                    if not any(r for r in clean):
                        print(f"  {table} FAIL: sin columnas válidas {sorted(drop_cols)}")
                        break
                    continue
                if "23505" in msg or "duplicate key" in msg.lower():
                    # fila a fila
                    for r in clean:
                        try:
                            sb.table(table).upsert([r], on_conflict=on_conflict).execute()
                            ok += 1
                        except Exception:
                            try:
                                sb.table(table).upsert([r]).execute()
                                ok += 1
                            except Exception:
                                pass
                    break
                if "ON CONFLICT" in msg or "42P10" in msg:
                    try:
                        sb.table(table).upsert(clean).execute()
                        ok += len(clean)
                        break
                    except Exception as e2:
                        col = _missing_col(str(e2))
                        if col:
                            drop_cols.add(col)
                            for r in clean:
                                r.pop(col, None)
                            continue
                        print(f"  {table} FAIL: {str(e2)[:140]}")
                        break
                print(f"  {table} FAIL: {msg[:140]}")
                break
    if drop_cols:
        print(f"  {table}: columnas omitidas={sorted(drop_cols)}")
    print(f"  {table}: upsert ~{ok}/{len(rows)}")


def load_ejecutivos(sb) -> Dict[str, str]:
    try:
        data = sb.table("ejecutivos").select("id,zona,nombre").execute().data or []
        m = {}
        for e in data:
            z = normalize_zona(e.get("zona") or e.get("nombre"))
            m[z] = e["id"]
            if e.get("nombre"):
                m[normalize_zona(e["nombre"])] = e["id"]
        return m
    except Exception as e:
        print("  ejecutivos:", e)
        return {}



# ---------------------------------------------------------------------------
# VENTAS INCREMENTALES (histórico en Supabase)
# ---------------------------------------------------------------------------
def _linea_id(r: dict) -> str:
    """Clave estable por línea de factura (idempotente entre corridas)."""
    parts = [
        str(r.get("cliente_key") or ""),
        str(r.get("fecha_d") or r.get("fecha") or ""),
        str(r.get("numero_documento") or r.get("numero_doc") or ""),
        str(r.get("sku_canon") or ""),
        str(r.get("venta_neta_clp") or ""),
        str(r.get("cantidad") or ""),
    ]
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()


def _ventas_df_to_rows(df: pd.DataFrame) -> List[dict]:
    rows = []
    if df is None or df.empty:
        return rows
    for _, r in df.iterrows():
        d = r.get("fecha_d")
        if hasattr(d, "isoformat"):
            d = d.isoformat()
        elif d is not None:
            d = str(d)[:10]
        rec = {
            "linea_id": _linea_id({
                "cliente_key": r.get("cliente_key"),
                "fecha_d": d,
                "numero_documento": r.get("numero_documento") or r.get("numero_doc"),
                "sku_canon": r.get("sku_canon"),
                "venta_neta_clp": r.get("venta_neta_clp"),
                "cantidad": r.get("cantidad"),
            }),
            "cliente_key": str(r.get("cliente_key") or ""),
            "nombre_cliente": _s(r.get("nombre_cliente")) or None,
            "fecha": d,
            "numero_documento": str(r.get("numero_documento") or r.get("numero_doc") or "") or None,
            "sku_canon": str(r.get("sku_canon") or "") or None,
            "producto_nombre": _s(r.get("producto_nombre")) or None,
            "cantidad": _f(r.get("cantidad")),
            "venta_neta_clp": _f(r.get("venta_neta_clp")) or 0,
            "vendedor_raw": _s(r.get("vendedor_raw") or r.get("zona_vendedor")) or None,
            "zona_vendedor": _s(r.get("zona_vendedor")) or None,
            "fuente": "excel_incremental",
        }
        if rec["cliente_key"] and rec["fecha"]:
            rows.append(rec)
    return rows


def _rows_to_ventas_df(rows: List[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    if "fecha" in df.columns and "fecha_d" not in df.columns:
        df["fecha_d"] = pd.to_datetime(df["fecha"], errors="coerce").dt.date
    if "fecha_d" in df.columns:
        df["fecha"] = pd.to_datetime(df["fecha_d"], errors="coerce")
    for c in ("cantidad", "venta_neta_clp"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    if "numero_documento" in df.columns and "numero_doc" not in df.columns:
        df["numero_doc"] = df["numero_documento"]
    return df


def fetch_ventas_supabase(sb, desde: date, hasta: date) -> pd.DataFrame:
    """Lee histórico de ventas_lineas entre fechas (inclusive). Paginado (PostgREST ~1000/req)."""
    try:
        page = 1000
        data = []
        start = 0
        while True:
            q = (
                sb.table("ventas_lineas")
                .select("*")
                .gte("fecha", desde.isoformat())
                .lte("fecha", hasta.isoformat())
                .order("fecha")
                .range(start, start + page - 1)
            )
            chunk = q.execute().data or []
            data.extend(chunk)
            if len(chunk) < page:
                break
            start += page
            if start > 500000:
                print("  ⚠ fetch ventas_lineas: tope de seguridad 500k filas")
                break
        print(f"  histórico Supabase ventas_lineas: {len(data)} filas ({desde}→{hasta})")
        return _rows_to_ventas_df(data)
    except Exception as e:
        msg = str(e)
        if "ventas_lineas" in msg or "PGRST" in msg or "42P01" in msg or "does not exist" in msg.lower():
            print("  ⚠ tabla public.ventas_lineas no existe → corré SUPABASE_VENTAS_LINEAS.sql")
            print("    sin histórico: el Excel se usará solo (peligroso si es parcial)")
        else:
            print(f"  fetch ventas_lineas: {msg[:160]}")
        return pd.DataFrame()


def purge_ventas_mes(sb, mes_inicio: date) -> int:
    """Borra ventas_lineas del mes de trabajo (para REPAIR tras doble conteo)."""
    if sb is None or mes_inicio is None:
        return 0
    mes_fin = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    deleted = 0
    try:
        # PostgREST delete por rango de fecha
        # Si la tabla es grande, puede requerir varias pasadas
        for _ in range(30):
            rows = (
                sb.table("ventas_lineas")
                .select("linea_id")
                .gte("fecha", mes_inicio.isoformat())
                .lt("fecha", mes_fin.isoformat())
                .limit(1000)
                .execute()
                .data
                or []
            )
            if not rows:
                break
            ids = [r["linea_id"] for r in rows if r.get("linea_id")]
            if not ids:
                break
            # delete in chunks
            for i in range(0, len(ids), 100):
                chunk = ids[i : i + 100]
                sb.table("ventas_lineas").delete().in_("linea_id", chunk).execute()
                deleted += len(chunk)
        print(f"  REPAIR purge ventas_lineas mes {mes_inicio}: borradas ~{deleted} filas")
    except Exception as e:
        print(f"  REPAIR purge FAIL: {str(e)[:150]}")
    return deleted


def publish_ventas_lineas(sb, excel_df: pd.DataFrame) -> int:
    """Upsert solo las líneas del Excel (idempotente por linea_id)."""
    rows = _ventas_df_to_rows(excel_df)
    if not rows:
        print("  ventas_lineas: nada que publicar")
        return 0
    try:
        upsert(sb, "ventas_lineas", rows, on_conflict="linea_id", batch=200)
        return len(rows)
    except Exception as e:
        print(f"  ventas_lineas FAIL: {str(e)[:180]}")
        return 0



def validar_historial_ventas(
    excel_df: pd.DataFrame,
    hist_df: pd.DataFrame,
    merged_df: pd.DataFrame,
    mes_trabajo: date,
    sb=None,
) -> dict:
    """
    Validación explícita del historial antes de publicar.
    Devuelve dict con métricas; levanta SystemExit si es inseguro.
    """
    print("\n[2c] VALIDACIÓN HISTORIAL")
    report = {
        "ok": True,
        "warnings": [],
        "errors": [],
        "mtd_merged": 0.0,
        "mtd_excel": 0.0,
        "mtd_hist": 0.0,
        "mtd_prev_pub": 0.0,
        "dias_mes_con_venta": 0,
        "docs_mes": 0,
    }
    hoy = date.today()
    mes_fin = (mes_trabajo.replace(day=28) + timedelta(days=4)).replace(day=1)

    def _slice(df):
        if df is None or df.empty or "fecha_d" not in df.columns:
            return df.iloc[0:0] if df is not None else pd.DataFrame()
        return df[(df["fecha_d"] >= mes_trabajo) & (df["fecha_d"] < mes_fin)]

    ex = _slice(excel_df)
    hi = _slice(hist_df) if hist_df is not None else pd.DataFrame()
    mg = _slice(merged_df)

    def _neto(df):
        if df is None or df.empty or "venta_neta_clp" not in df.columns:
            return 0.0
        return float(df["venta_neta_clp"].fillna(0).sum())

    report["mtd_excel"] = _neto(ex)
    report["mtd_hist"] = _neto(hi)
    report["mtd_merged"] = _neto(mg)

    # --- calidad Excel ---
    if excel_df is None or excel_df.empty:
        report["errors"].append("Excel de ventas vacío")
    else:
        null_ck = int(excel_df["cliente_key"].isna().sum()) if "cliente_key" in excel_df.columns else len(excel_df)
        null_fecha = int(excel_df["fecha_d"].isna().sum()) if "fecha_d" in excel_df.columns else len(excel_df)
        if null_ck:
            report["warnings"].append(f"Excel: {null_ck} filas sin cliente_key")
        if null_fecha:
            report["errors"].append(f"Excel: {null_fecha} filas sin fecha válida")
        fut = excel_df[excel_df["fecha_d"] > hoy] if "fecha_d" in excel_df.columns else pd.DataFrame()
        if len(fut):
            report["warnings"].append(f"Excel: {len(fut)} filas con fecha futura")
        xmin, xmax = excel_df["fecha_d"].min(), excel_df["fecha_d"].max()
        span = (xmax - xmin).days + 1 if pd.notna(xmin) and pd.notna(xmax) else 0
        print(f"  Excel: {len(excel_df)} filas | {xmin}→{xmax} ({span}d) | MTD-en-archivo=${report['mtd_excel']:,.0f}")

    # --- histórico ---
    n_hist = 0 if hist_df is None or hist_df.empty else len(hist_df)
    if n_hist == 0:
        print("  Histórico Supabase: VACÍO (primera carga o falta tabla ventas_lineas)")
        report["warnings"].append("Sin histórico en ventas_lineas")
    else:
        hmin, hmax = hist_df["fecha_d"].min(), hist_df["fecha_d"].max()
        print(f"  Histórico: {n_hist} filas | {hmin}→{hmax} | MTD-histórico=${report['mtd_hist']:,.0f}")

    # --- cobertura del mes en merge ---
    if mg is not None and not mg.empty:
        dias = sorted(set(d for d in mg["fecha_d"].tolist() if d))
        report["dias_mes_con_venta"] = len(dias)
        ncol = "numero_documento" if "numero_documento" in mg.columns else (
            "numero_doc" if "numero_doc" in mg.columns else None
        )
        report["docs_mes"] = int(mg[ncol].nunique()) if ncol else 0
        # días faltantes desde inicio de mes hasta hoy (aprox; no excluye feriados)
        esperado = []
        d = mes_trabajo
        while d <= min(hoy, mes_fin - timedelta(days=1)):
            if d.weekday() < 5:  # lun-vie
                esperado.append(d)
            d += timedelta(days=1)
        faltan = [x for x in esperado if x not in set(dias)]
        print(f"  Mes {mes_trabajo}: días hábiles con venta={len(dias)}/{len(esperado)} | docs={report['docs_mes']} | MTD-merge=${report['mtd_merged']:,.0f}")
        if faltan and len(faltan) <= 15:
            print(f"  Días hábiles sin venta en merge: {', '.join(str(x) for x in faltan[:12])}{'…' if len(faltan)>12 else ''}")
        elif faltan:
            print(f"  Días hábiles sin venta: {len(faltan)} (revisar si el histórico está completo)")
        # Si estamos > día 5 del mes y hay < 3 días con venta → sospechoso
        if hoy.day >= 5 and len(dias) < 3:
            report["errors"].append(
                f"Solo {len(dias)} día(s) con venta en el mes y hoy es día {hoy.day}: historial incompleto"
            )
    else:
        report["errors"].append("Merge sin filas MTD para el mes en curso")

    # --- solapamiento Excel vs hist (cuántas líneas nuevas) ---
    if n_hist and excel_df is not None and not excel_df.empty:
        try:
            ids_ex = set(_linea_id({
                "cliente_key": r.get("cliente_key"),
                "fecha_d": r.get("fecha_d"),
                "numero_documento": r.get("numero_documento") or r.get("numero_doc"),
                "sku_canon": r.get("sku_canon"),
                "venta_neta_clp": r.get("venta_neta_clp"),
                "cantidad": r.get("cantidad"),
            }) for _, r in excel_df.iterrows())
            ids_hi = set()
            for _, r in hist_df.iterrows():
                if r.get("linea_id"):
                    ids_hi.add(str(r.get("linea_id")))
                else:
                    ids_hi.add(_linea_id({
                        "cliente_key": r.get("cliente_key"),
                        "fecha_d": r.get("fecha_d"),
                        "numero_documento": r.get("numero_documento") or r.get("numero_doc"),
                        "sku_canon": r.get("sku_canon"),
                        "venta_neta_clp": r.get("venta_neta_clp"),
                        "cantidad": r.get("cantidad"),
                    }))
            nuevas = ids_ex - ids_hi
            ya = ids_ex & ids_hi
            print(f"  Líneas Excel: {len(ids_ex)} | ya en histórico={len(ya)} | nuevas={len(nuevas)}")
            if len(ids_ex) and len(nuevas) == 0:
                report["warnings"].append("Excel no aporta líneas nuevas (todo ya estaba en histórico)")
        except Exception as e:
            report["warnings"].append(f"No se pudo calcular solapamiento: {str(e)[:80]}")

    # --- vs última publicación gerencia ---
    mtd_prev = 0.0
    if sb is not None:
        try:
            prev = sb.table("gerencia").select("venta_mtd,ejecutivo").execute().data or []
            mtd_prev = sum(float(x.get("venta_mtd") or 0) for x in prev)
            report["mtd_prev_pub"] = mtd_prev
            print(f"  Publicado previo (suma gerencia): ${mtd_prev:,.0f}")
        except Exception as e:
            print(f"  gerencia previa: {str(e)[:100]}")
        try:
            meta = sb.table("snapshot_meta").select("venta_mtd_total,mes,actualizado_en").order(
                "actualizado_en", desc=True
            ).limit(1).execute().data or []
            if meta:
                sm = float(meta[0].get("venta_mtd_total") or 0)
                print(f"  snapshot_meta último: mes={meta[0].get('mes')} MTD=${sm:,.0f}")
                if sm > mtd_prev:
                    mtd_prev = sm
                    report["mtd_prev_pub"] = sm
        except Exception:
            pass

    # Reglas de abort
    if report["mtd_prev_pub"] > 0 and report["mtd_merged"] < report["mtd_prev_pub"] * 0.75:
        report["errors"].append(
            f"MTD merge ${report['mtd_merged']:,.0f} < 75% de publicado ${report['mtd_prev_pub']:,.0f}"
        )
    # Inflación: merge no puede saltar >35% sobre lo ya publicado (típico doble conteo)
    if report["mtd_prev_pub"] > 100_000 and report["mtd_merged"] > report["mtd_prev_pub"] * 1.35:
        report["errors"].append(
            f"MTD merge ${report['mtd_merged']:,.0f} > 135% de publicado "
            f"${report['mtd_prev_pub']:,.0f} — probable doble conteo en ventas_lineas. "
            f"El ciclo intentó reparar el mes; si persiste: borrá ventas del mes en Supabase "
            f"o usá Excel completo del mes + KF_VENTAS_FULL_REPLACE=1 + KF_FORCE_VENTAS=1"
        )
    # Hist del mes muy por encima del Excel del mes
    if report["mtd_excel"] > 100_000 and report["mtd_hist"] > report["mtd_excel"] * 1.5:
        report["warnings"].append(
            f"MTD histórico del mes ${report['mtd_hist']:,.0f} >> Excel ${report['mtd_excel']:,.0f}. "
            f"Si el Excel es el archivo bueno del mes, el hist en Supabase está contaminado."
        )
    if report["mtd_merged"] <= 0 and hoy.day >= 3:
        report["errors"].append("MTD merge = 0 con mes ya avanzado")

    for w in report["warnings"]:
        print(f"  ⚠ {w}")
    for e in report["errors"]:
        print(f"  ✗ {e}")

    if report["errors"] and not FORCE_VENTAS:
        raise SystemExit(
            "ABORT validación historial:\n  - "
            + "\n  - ".join(report["errors"])
            + "\n\nSi es intencional: os.environ['KF_FORCE_VENTAS']='1'"
        )
    if report["errors"] and FORCE_VENTAS:
        print("  ⚠ FORCE_VENTAS: se continúa pese a errores de validación")
    else:
        print("  ✓ Validación historial OK")
    report["ok"] = not bool(report["errors"]) or FORCE_VENTAS
    return report


def save_snapshot_meta(sb, mes_trabajo: date, mtd_total: float, n_lineas: int, version: str) -> None:
    if sb is None:
        return
    row = {
        "id": 1,
        "mes": mes_trabajo.isoformat(),
        "venta_mtd_total": round(float(mtd_total), 0),
        "n_lineas": int(n_lineas),
        "version_ciclo": version,
        "actualizado_en": datetime.now(tz=__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        sb.table("snapshot_meta").upsert(row, on_conflict="id").execute()
        print(f"  snapshot_meta: mes={mes_trabajo} MTD=${mtd_total:,.0f} lineas={n_lineas}")
    except Exception as e:
        # tabla opcional
        if "snapshot_meta" in str(e) or "PGRST" in str(e):
            print("  snapshot_meta: tabla ausente (opcional — SUPABASE_VENTAS_LINEAS.sql la crea)")
        else:
            print(f"  snapshot_meta: {str(e)[:120]}")


def merge_ventas_incremental(excel_df: pd.DataFrame, sb, mes_inicio: date) -> pd.DataFrame:
    """
    Une Excel + histórico Supabase.
    - Default: INCREMENTAL (nunca borra histórico)
    - KF_VENTAS_FULL_REPLACE=1 + KF_FORCE_VENTAS=1: usa solo Excel
    """
    if excel_df is None or excel_df.empty:
        raise SystemExit("Excel de ventas vacío.")

    xmin, xmax = excel_df["fecha_d"].min(), excel_df["fecha_d"].max()
    n_excel = len(excel_df)
    span_days = (xmax - xmin).days + 1 if xmin and xmax else 0
    print(f"  Excel ventas: {n_excel} filas | {xmin} → {xmax} ({span_days} días)")

    # Mes de trabajo: KF_MES o mes calendario actual si Excel es parcial
    hoy = date.today()
    mes_cal = date(hoy.year, hoy.month, 1)
    if MES_FORCE:
        try:
            y, m, *_ = MES_FORCE.split("-")
            mes_trabajo = date(int(y), int(m), 1)
        except Exception:
            mes_trabajo = mes_inicio or mes_cal
    else:
        # Si el Excel solo cubre pocos días del mes, NO dejar que mes_mtd se achique
        mes_trabajo = mes_cal if span_days <= 10 else (mes_inicio or mes_cal)
    print(f"  mes trabajo MTD = {mes_trabajo}")

    if VENTAS_FULL_REPLACE:
        if not FORCE_VENTAS:
            raise SystemExit(
                "KF_VENTAS_FULL_REPLACE=1 requiere también KF_FORCE_VENTAS=1 "
                "(evita borrar el mes por error con un Excel parcial)."
            )
        print("  ⚠ FULL_REPLACE forzado: se ignora histórico Supabase")
        validar_historial_ventas(excel_df, pd.DataFrame(), excel_df, mes_trabajo, sb=sb)
        return excel_df.copy(), mes_trabajo, excel_df.copy()

    # Rango histórico: 6 meses atrás del mes de trabajo → hoy
    hist_desde = date(mes_trabajo.year, mes_trabajo.month, 1)
    for _ in range(6):
        hist_desde = (hist_desde - timedelta(days=1)).replace(day=1)
    hist_hasta = hoy

    hist = pd.DataFrame()
    if sb is not None:
        hist = fetch_ventas_supabase(sb, hist_desde, hist_hasta)
    else:
        print("  sin Supabase: no hay histórico que fusionar")

    # ANTI-DOBLE CONTEO (siempre):
    # 1) En el rango de fechas del Excel, Excel es la verdad → se descarta hist en [xmin, xmax].
    # 2) Si el MTD del mes en hist ya está inflado vs lo publicado en gerencia/snapshot,
    #    se descarta TODO el mes actual del hist y el mes queda = Excel (+ días del mes
    #    no cubiertos por Excel si los hubiera en hist — en la práctica Excel parcial
    #    + hist limpio de mes).
    if hist is not None and not hist.empty and "fecha_d" in getattr(hist, "columns", []):
        xmin = excel_df["fecha_d"].min()
        xmax = excel_df["fecha_d"].max()
        before_h = len(hist)
        # (1) solape exacto con ventana Excel
        mask_overlap = (hist["fecha_d"] >= xmin) & (hist["fecha_d"] <= xmax)
        n_overlap = int(mask_overlap.sum())
        hist = hist.loc[~mask_overlap].copy()
        print(
            f"  anti-doble ventana Excel: {xmin}→{xmax} · hist quitó solape={n_overlap} "
            f"· hist queda={len(hist)} (antes {before_h})"
        )

        # (2) ¿hist del mes de trabajo ya inflado vs publicado?
        mes_fin = (mes_trabajo.replace(day=28) + timedelta(days=4)).replace(day=1)
        hist_mes = hist[(hist["fecha_d"] >= mes_trabajo) & (hist["fecha_d"] < mes_fin)]
        mtd_hist_mes = float(hist_mes["venta_neta_clp"].fillna(0).sum()) if len(hist_mes) and "venta_neta_clp" in hist_mes.columns else 0.0
        mtd_excel_mes = 0.0
        if "venta_neta_clp" in excel_df.columns and "fecha_d" in excel_df.columns:
            ex_mes = excel_df[(excel_df["fecha_d"] >= mes_trabajo) & (excel_df["fecha_d"] < mes_fin)]
            mtd_excel_mes = float(ex_mes["venta_neta_clp"].fillna(0).sum())

        mtd_prev = 0.0
        if sb is not None:
            try:
                prev = sb.table("gerencia").select("venta_mtd").execute().data or []
                mtd_prev = sum(float(x.get("venta_mtd") or 0) for x in prev)
            except Exception:
                pass
            try:
                meta = (
                    sb.table("snapshot_meta")
                    .select("venta_mtd_total,mes")
                    .order("actualizado_en", desc=True)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if meta:
                    sm = float(meta[0].get("venta_mtd_total") or 0)
                    # solo si el snapshot es del mismo mes de trabajo
                    mes_meta = str(meta[0].get("mes") or "")[:7]
                    if mes_meta == mes_trabajo.strftime("%Y-%m") and sm > mtd_prev:
                        mtd_prev = sm
            except Exception:
                pass

        print(
            f"  anti-doble mes: MTD hist(mes residual)=${mtd_hist_mes:,.0f} · "
            f"Excel(mes)=${mtd_excel_mes:,.0f} · publicado previo=${mtd_prev:,.0f}"
        )

        # Si hist residual del mes es absurdo vs publicado o vs Excel → tirar todo el mes del hist
        inflado = False
        if mtd_prev > 0 and mtd_hist_mes > mtd_prev * 1.20:
            inflado = True
            print(
                f"  ⚠ hist del mes inflado vs publicado "
                f"(${mtd_hist_mes:,.0f} > 120% de ${mtd_prev:,.0f})"
            )
        if mtd_excel_mes > 0 and mtd_hist_mes > mtd_excel_mes * 1.15:
            # hist residual del mes no debería ser casi tan grande como el Excel
            # si el Excel ya cubre la mayor parte del mes
            inflado = True
            print(
                f"  ⚠ hist residual del mes alto vs Excel "
                f"(${mtd_hist_mes:,.0f} vs Excel ${mtd_excel_mes:,.0f})"
            )

        if inflado:
            before2 = len(hist)
            hist = hist[hist["fecha_d"] < mes_trabajo].copy()
            print(
                f"  REPAIR mes MTD: se elimina hist ≥ {mes_trabajo} "
                f"({before2} → {len(hist)}). Mes actual = Excel como fuente."
            )
            # Flag para que el publish borre ventas_lineas del mes antes de upsert
            os.environ["_KF_REPAIR_MES_MTD"] = mes_trabajo.isoformat()

    if hist is None or hist.empty:
        # Validación: Excel parcial sin histórico = peligro
        if span_days <= 10 or n_excel < 500:
            if not FORCE_VENTAS:
                raise SystemExit(
                    f"Excel parece PARCIAL ({n_excel} filas, {span_days} días) y no hay "
                    f"histórico en ventas_lineas.\n"
                    f"  Opciones:\n"
                    f"  1) Subí un Excel con TODO el mes (o histórico) una vez\n"
                    f"  2) Creá la tabla (SUPABASE_VENTAS_LINEAS.sql) y re-corré un Excel completo\n"
                    f"  3) Si sabés lo que hacés: os.environ['KF_FORCE_VENTAS']='1'"
                )
            print("  ⚠ FORCE_VENTAS: continúo solo con Excel parcial")
        return excel_df.copy(), mes_trabajo, excel_df.copy()

    # Auditoría de duplicados / archivo pisado antes de unir
    dup_report = audit_duplicados_carga(excel_df, hist, mes_trabajo)
    if dup_report.get("abort") and not FORCE_VENTAS:
        raise SystemExit(
            "ABORT por riesgo de duplicados al re-cargar ventas:\n  "
            + dup_report.get("reason", "")
            + "\n\nOpciones:\n"
            + "  1) Usá un Excel solo con facturas NUEVAS del día/periodo\n"
            + "  2) Si el archivo es el correcto y querés reparar el mes: "
            + "el anti-doble ya limpia solapes; revisá el log REPAIR\n"
            + "  3) Forzar (no recomendado): os.environ['KF_FORCE_VENTAS']='1'"
        )

    # Si ≥70% ya estaba en hist → filtrar del Excel las líneas ya conocidas
    # (el cálculo usa hist limpio + solo líneas realmente nuevas)
    if dup_report.get("pct_ya_en_hist", 0) >= 70 and hist is not None and not hist.empty:
        hist_keys = set()
        hi = hist.copy()
        if "numero_doc" in hi.columns and "numero_documento" not in hi.columns:
            hi["numero_documento"] = hi["numero_doc"]
        for _, r in hi.iterrows():
            hist_keys.add(_venta_key_row(r))
        before_ex = len(excel_df)
        keep_idx = []
        for i, r in excel_df.iterrows():
            if _venta_key_row(r) not in hist_keys:
                keep_idx.append(i)
        excel_new = excel_df.loc[keep_idx].copy() if keep_idx else excel_df.iloc[0:0].copy()
        print(
            f"  filtro re-carga: Excel {before_ex} → {len(excel_new)} líneas nuevas "
            f"(se ignoran {before_ex - len(excel_new)} ya publicadas)"
        )
        excel_for_merge = excel_new
        # Para publish: sigue siendo el Excel original (upsert idempotente),
        # pero el flag de solo-nuevas ayuda al MTD
        os.environ["_KF_EXCEL_SOLO_NUEVAS"] = "1"
    else:
        excel_for_merge = excel_df

    # Concat + dedupe
    both = pd.concat([hist, excel_for_merge], ignore_index=True, sort=False)
    before = len(both)
    both = dedupe_ventas(both)
    print(f"  merge: histórico={len(hist)} + excel_merge={len(excel_for_merge)} → {len(both)} (dedupe desde {before})")
    validar_historial_ventas(excel_df, hist, both, mes_trabajo, sb=sb)
    return both, mes_trabajo, excel_df.copy()


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    # --- resolver archivos ---
    p_ventas = find_file(VENTAS_GLOBS)
    p_maestra = find_file(MAESTRA_GLOBS)
    p_stock = find_file(STOCK_GLOBS)
    p_precios = find_file(PRECIOS_GLOBS)
    p_config = find_file(CONFIG_GLOBS)

    print("\n[1] ARCHIVOS")
    for label, p in [
        ("VENTAS", p_ventas),
        ("MAESTRA", p_maestra),
        ("STOCK", p_stock),
        ("PRECIOS", p_precios),
        ("CONFIG_MES", p_config),
    ]:
        print(f"  {label}: {p if p else 'NO ENCONTRADO'}")
    print(f"  STOCK_API: {STOCK_API_URL or '(off)'}")
    if not all([p_ventas, p_maestra, p_precios]):
        raise SystemExit("Faltan VENTAS/MAESTRA/PRECIOS. Stock puede venir de API.")
    if not p_stock and not STOCK_API_URL:
        raise SystemExit("Falta stock: Excel o KF_STOCK_URL / API default.")

    print("\n[2] VALIDAR Y CARGAR")
    ventas_excel = load_ventas(p_ventas)
    ventas_excel = dedupe_ventas(ventas_excel)
    maestra = load_maestra(p_maestra)
    try:
        stock = load_stock(p_stock)
    except Exception as e:
        raise SystemExit(f"No se pudo cargar stock: {e}") from e
    precios = load_precios(p_precios)
    media_map = load_productos_media()
    metas_cfg, focos_cfg_mes, foco_sku_map, foco_kg_factor = load_config_mensual(p_config)

    print(f"  ventas Excel filas={len(ventas_excel)} | {ventas_excel['fecha_d'].min()} → {ventas_excel['fecha_d'].max()}")
    print(f"  maestra clientes={len(maestra)} | zonas={maestra['zona'].value_counts().to_dict()}")
    print(f"  stock skus={len(stock)}")
    print(f"  precios filas={len(precios)}")
    if len(precios):
        n_pu = int((precios.get("precio_unidad").fillna(0) > 0).sum()) if "precio_unidad" in precios.columns else 0
        n_pc = int((precios.get("precio_caja").fillna(0) > 0).sum()) if "precio_caja" in precios.columns else 0
        sample = precios.dropna(subset=["sku_canon"]).head(3)
        print(f"  precios con precio_unidad>0={n_pu} precio_caja>0={n_pc}")
        if n_pu == 0 and n_pc == 0:
            print("  ⚠ LISTA DE PRECIOS sin montos parseables. Revisá columnas Precio Unidad/Caja/Kilo.")
            print(f"    columnas precios: {list(precios.columns)}")
            if len(precios):
                print(f"    primera fila raw: {precios.iloc[0].to_dict()}")
        for _, rr in sample.iterrows():
            print(f"    ej sku={rr.get('sku_canon')} pu={rr.get('precio_unidad')} pc={rr.get('precio_caja')} · {str(rr.get('descripcion') or '')[:40]}")


    # Conectar Supabase YA (hace falta para merge incremental)
    ejecutivos_map: Dict[str, str] = {}
    sb = None
    if not SKIP_SUPABASE:
        try:
            sb = sb_client()
            ejecutivos_map = load_ejecutivos(sb)
            print(f"  supabase url={get_secret('SUPABASE_URL') or '(ok)'}")
            print(f"  ejecutivos: {ejecutivos_map}")
        except Exception as e:
            print(f"  supabase: {e}")

    print("\n[2b] VENTAS INCREMENTALES")
    mes_hint = mes_mtd(ventas_excel)
    ventas, mes_inicio, ventas_excel_only = merge_ventas_incremental(ventas_excel, sb, mes_hint)
    print(f"\n[3] MES MTD = {mes_inicio} | filas cálculo={len(ventas)}")
    audit_venta_mtd(ventas, mes_inicio)

    print("\n[4] CICLO / SKU DETALLE / OFERTA")
    detalle = build_sku_detalle_y_ciclo(ventas, mes_inicio)
    print(f"  clientes con detalle={len(detalle)}")

    # focos: top skus del mes por venta
    mes_fin = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    focos_skus = []
    if not ventas.empty and "sku_canon" in ventas.columns:
        vm = ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin)]
        top = vm.groupby("sku_canon")["venta_neta_clp"].sum().sort_values(ascending=False).head(5)
        focos_skus = [str(x) for x in top.index if x]
    print(f"  focos auto sku={focos_skus[:5]}")

    ofertas = build_oferta(detalle, precios, stock, focos_skus)
    print(f"  ofertas={sum(1 for v in ofertas.values() if v)}")

    print("\n[5] MAESTRA INCREMENTAL + CARTERA")
    prev_cartera = fetch_cartera_previa(sb) if sb else []
    audit_maestra_incremental(maestra, prev_cartera)
    cartera_rows = build_cartera_rows(maestra, ventas, detalle, ofertas, mes_inicio, ejecutivos_map)
    print(f"  cartera rows={len(cartera_rows)}")
    # Riesgo de fuga → Supabase cartera
    # Riesgo de fuga (integrado en este script)
    try:
        if sb is not None:
            ensure_cartera_riesgo_columns(sb)
    except Exception as _re:
        print(f"  riesgo DDL: {_re}")
    cartera_rows = enrich_cartera_riesgo(cartera_rows)
    _rs = resumen_riesgo(cartera_rows)
    print(f"  riesgo: n={_rs['n_riesgo']} enfri={_rs['n_enfri']} plata=${_rs['plata_en_riesgo']:,.0f}")

    audit_recompra_signals(cartera_rows)
    # solo terreno para app campo (gerencia ve todos)
    cartera_terreno = [r for r in cartera_rows if r["zona"] in ZONAS_TERRENO]
    print(f"  cartera terreno={len(cartera_terreno)}")

    print("\n[5b] GEOCODE CARTERA")
    geo_cache = load_geo_existente(sb) if sb else {}
    geo_key = None
    if not SKIP_GEOCODE:
        geo_key = get_secret("GOOGLE_MAPS_API_KEY") or get_secret("GEOCODING_KEY")
        if not geo_key:
            print("  sin GOOGLE_MAPS_API_KEY / GEOCODING_KEY — solo se reusan coords existentes")
    cartera_terreno = geocode_cartera_rows(cartera_terreno, geo_key, geo_cache)

    print("\n[6] STOCK + TENDENCIA + GERENCIA + METAS")
    stock_rows = build_stock_rows(stock, precios, ventas, mes_inicio, foco_sku_map, media_map)
    n_img = sum(1 for r in stock_rows if r.get("imagen_url"))
    n_fi = sum(1 for r in stock_rows if r.get("ficha_url"))
    n_pu = sum(1 for r in stock_rows if (r.get("precio_unidad") or 0) > 0)
    n_pc = sum(1 for r in stock_rows if (r.get("precio_caja") or 0) > 0)
    n_any = sum(1 for r in stock_rows if (r.get("precio_unidad") or r.get("precio_caja") or r.get("precio_kilo") or 0) > 0)
    print(f"  stock_rows media: fotos={n_img} fichas={n_fi} de {len(stock_rows)} SKU")
    print(f"  stock_rows PRECIOS: con_precio={n_any} (unidad={n_pu} caja={n_pc}) de {len(stock_rows)}")
    if n_pu == 0 and len(stock_rows):
        # diagnóstico de match SKU
        stock_skus = set(str(r.get("sku_canon") or "") for r in stock_rows)
        prec_skus = set()
        if precios is not None and not precios.empty and "sku_canon" in precios.columns:
            prec_skus = set(str(x) for x in precios["sku_canon"].dropna().astype(str))
        inter = stock_skus & prec_skus
        print(f"  ⚠ match SKU stock∩precios={len(inter)} (stock={len(stock_skus)} precios={len(prec_skus)})")
        print(f"    stock ej: {list(sorted(stock_skus))[:5]}")
        print(f"    precios ej: {list(sorted(prec_skus))[:5]}")
    tend_rows = build_tendencia(ventas)
    # gerencia preliminar (sin metas) → se recalcula tras metas_cfg
    ger_rows = build_gerencia(cartera_rows, ventas, mes_inicio, None)
    gerencia_clientes_rows = []
    print(f"  stock={len(stock_rows)} tendencia={len(tend_rows)} gerencia={len(ger_rows)}")

    # Metas: config + venta_mtd real por zona (clave = ejecutivo)
    venta_por_zona = {g["ejecutivo"]: g["venta_mtd"] for g in ger_rows}
    metas_rows = []
    if metas_cfg:
        for m in metas_cfg:
            z = m.get("zona") or "OTROS"
            vm = float(venta_por_zona.get(z) or 0)
            meta = float(m.get("meta_mensual") or 0)
            pct = round(vm / meta, 4) if meta else None
            metas_rows.append(
                {
                    "ejecutivo_id": ejecutivos_map.get(z),
                    "zona": z,
                    "ejecutivo": z,
                    "venta_mtd": vm,
                    "meta_mensual": meta,
                    "brecha": round(meta - vm, 0) if meta else None,
                    "pct_avance": pct,
                    "mes": m.get("mes") or mes_inicio.isoformat(),
                    "fecha_snapshot": date.today().isoformat(),
                }
            )
    else:
        # fallback: meta = venta (sin config) para no dejar pantalla vacía
        for g in ger_rows:
            if g["ejecutivo"] not in ZONAS_TERRENO:
                continue
            metas_rows.append(
                {
                    "ejecutivo_id": ejecutivos_map.get(g["ejecutivo"]),
                    "zona": g["ejecutivo"],
                    "ejecutivo": g["ejecutivo"],
                    "venta_mtd": g["venta_mtd"],
                    "meta_mensual": None,
                    "brecha": None,
                    "pct_avance": None,
                    "mes": mes_inicio.isoformat(),
                    "fecha_snapshot": date.today().isoformat(),
                }
            )
    focos_rows = []
    mes_fin_f = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    vm_f = ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin_f)] if not ventas.empty else ventas
    # clientes por zona maestra
    zona_por_ck = {}
    for _, mr in maestra.iterrows():
        zona_por_ck[str(mr.get("cliente_key"))] = mr.get("zona") or "OTROS"

    # Mapa SKU → kg por unidad de venta (desde lista de precios)
    kg_por_sku = {}
    if precios is not None and not precios.empty:
        for _, pr in precios.iterrows():
            sk = str(pr.get("sku_canon") or "").strip()
            if not sk:
                continue
            kg_u = _f(pr.get("kg_unidad"))
            kg_c = _f(pr.get("kg_caja"))
            u_caja = _f(pr.get("unidades_caja")) or 0
            if kg_u and kg_u > 0:
                kg_por_sku[sk] = float(kg_u)
            elif kg_c and kg_c > 0 and u_caja > 0:
                kg_por_sku[sk] = float(kg_c) / float(u_caja)
            elif kg_c and kg_c > 0:
                kg_por_sku[sk] = float(kg_c)  # cantidad ya en cajas

    # FOCO_SKU pisa precios (fuente más confiable para focos del mes)
    for sk, fv in (foco_kg_factor or {}).items():
        if fv and float(fv) > 0:
            kg_por_sku[str(sk).strip()] = float(fv)
    print(f"  kg_por_sku config (FOCO_SKU): {len(foco_kg_factor or {})} factores explícitos")
    print(f"  kg_por_sku total: {len(kg_por_sku)} skus con factor KG/LT")

    def _skus_for_foco(foco_name: str):
        """SOLO SKUs listados en hoja FOCO_SKU del config mensual. Sin expansión por nombre."""
        fn = _norm_col(foco_name)
        skus = [sk for sk, name in foco_sku_map.items() if _norm_col(name) == fn]
        if not skus:
            print(f"  ⚠ FOCO_SKU vacío para '{foco_name}' — revisá hoja FOCO_SKU del config mensual")
        else:
            print(f"  FOCO_SKU '{foco_name}': {len(skus)} skus canónicos → {skus}")
        return skus

    def _vendido_unidades(sub, unidad_meta: str):
        """Suma en la unidad de la meta (KG / LT / UD)."""
        if sub is None or sub.empty:
            return 0.0
        u = (unidad_meta or "UD").upper()
        cant = sub["cantidad"].fillna(0) if "cantidad" in sub.columns else None
        if cant is None:
            return float(sub["venta_neta_clp"].fillna(0).sum()) if "venta_neta_clp" in sub.columns else 0.0
        if "KG" in u or "KILO" in u:
            total = 0.0
            sin_factor = 0
            for sk, g in sub.groupby(sub["sku_canon"].astype(str)):
                c = float(g["cantidad"].fillna(0).sum())
                factor = kg_por_sku.get(sk)
                if not factor or factor <= 0:
                    # inferir desde nombre de producto en las filas
                    for nom in g.get("producto_nombre", pd.Series(dtype=str)).dropna().unique().tolist()[:3]:
                        factor = _kg_from_nombre(str(nom))
                        if factor and factor > 0:
                            kg_por_sku[sk] = factor  # cache
                            break
                if factor and factor > 0:
                    total += c * factor
                else:
                    sin_factor += c
                    total += c  # último recurso
            if sin_factor > 0:
                print(f"    aviso foco KG: {sin_factor:.0f} ud sin factor (sumadas crudas)")
            return total
        if "LT" in u or "LTS" in u or "LITRO" in u:
            # muchas salsas vienen en LT por unidad o por caja; usar kg_por_sku si existe como proxy de LT
            total = 0.0
            for sk, g in sub.groupby(sub["sku_canon"].astype(str)):
                c = float(g["cantidad"].fillna(0).sum())
                factor = kg_por_sku.get(sk)
                total += c * factor if factor and factor > 0 else c
            return total
        return float(cant.sum())

    for f in focos_cfg_mes:
        z = f.get("zona") or "OTROS"
        foco_name = f.get("foco") or ""
        unidad = f.get("unidad_meta") or "KG"
        skus_foco = _skus_for_foco(foco_name)
        vendido = 0.0
        if not vm_f.empty and skus_foco:
            sub = vm_f[vm_f["sku_canon"].astype(str).isin([str(s) for s in skus_foco])].copy()
            if "cliente_key" in sub.columns:
                mask_z = sub["cliente_key"].map(
                    lambda ck: normalize_zona(zona_por_ck.get(str(ck), "")) == z
                )
                sub2 = sub[mask_z]
                if sub2.empty and "zona_vendedor" in sub.columns:
                    sub2 = sub[sub["zona_vendedor"].map(lambda x: normalize_zona(x) == z)]
                sub = sub2
            vendido = _vendido_unidades(sub, unidad)
            print(f"  foco {z}/{foco_name}: skus={len(skus_foco)} filas={len(sub)} vendido={vendido:.1f} {unidad}")
            if not sub.empty and ("KG" in str(unidad).upper() or "POLLO" in str(foco_name).upper()):
                try:
                    rows_dbg = []
                    for sk, gsk in sub.groupby(sub["sku_canon"].astype(str)):
                        c = float(gsk["cantidad"].fillna(0).sum())
                        fac = kg_por_sku.get(sk) or 0
                        nom = ""
                        if "producto_nombre" in gsk.columns and gsk["producto_nombre"].dropna().shape[0]:
                            nom = str(gsk["producto_nombre"].dropna().iloc[0])[:40]
                        rows_dbg.append((c * (fac if fac > 0 else 1), c, fac, sk, nom))
                    rows_dbg.sort(reverse=True)
                    for kg_i, c_i, fac_i, sk_i, nom_i in rows_dbg[:5]:
                        print(f"      sku {sk_i}: qty={c_i:.1f} × factor={fac_i or 1:.2f} → {kg_i:.1f} KG | {nom_i}")
                except Exception as _e:
                    print(f"      (debug foco skip: {_e})")
        meta_u = float(f.get("meta_unidad") or 0) or 0
        pct = round(vendido / meta_u, 4) if meta_u else None
        if meta_u and vendido >= meta_u:
            ritmo = "CUMPLIDO"
        elif meta_u and vendido >= meta_u * 0.7:
            ritmo = "EN_RITMO"
        elif meta_u and vendido > 0:
            ritmo = "ATRASADO"
        elif vendido == 0:
            ritmo = "SIN_DATO" if not skus_foco else "SIN_VENTA"
        else:
            ritmo = "SIN_DATO"
        focos_rows.append(
            {
                **f,
                "ejecutivo_id": ejecutivos_map.get(z),
                "vendido_unidad": round(vendido, 2),
                "pct_avance": pct,
                "estado_ritmo": ritmo,
                "unidad_meta": unidad,
            }
        )
        print(
            f"  foco {z}/{foco_name}: skus={len(skus_foco)} vendido={vendido:.1f} {unidad} "
            f"meta={meta_u} → {ritmo}"
        )

    print(f"  metas={len(metas_rows)} focos_mes={len(focos_rows)}")
    # Recalcular gerencia con metas del config
    ger_rows = build_gerencia(cartera_rows, ventas, mes_inicio, metas_rows)
    print(f"  gerencia (con metas)={len(ger_rows)}")
    # Clientes por canal/zona para drill-down Gerencia (nombres + comuna + peso)
    gerencia_clientes_rows = []
    mes_fin_g = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    zona_ck = {str(r.get("cliente_key")): r.get("zona") for r in cartera_rows}
    nom_ck = {str(r.get("cliente_key")): r.get("nombre_cliente") for r in cartera_rows}
    com_ck = {str(r.get("cliente_key")): r.get("comuna") for r in cartera_rows}
    if not ventas.empty:
        vm = ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin_g)]
        # nombres de venta para no asignados
        if "nombre_cliente" in vm.columns:
            for ck, g in vm.groupby("cliente_key"):
                if not nom_ck.get(str(ck)):
                    n = next((x for x in g["nombre_cliente"].tolist() if _s(x)), None)
                    if n:
                        nom_ck[str(ck)] = n
        agg = vm.groupby("cliente_key")["venta_neta_clp"].sum()
        venta_por_zona = defaultdict(float)
        for ck, v in agg.items():
            z = zona_ck.get(str(ck)) or "NO_ASIGNADO"
            venta_por_zona[z] += float(v)
        for ck, v in agg.items():
            z = zona_ck.get(str(ck)) or "NO_ASIGNADO"
            tot_z = venta_por_zona.get(z) or 1
            # sku_detalle desde detalle (todas las zonas/canales) + fallback cartera
            _car_row = next((r for r in cartera_rows if str(r.get("cliente_key","")) == str(ck)), None)
            _det = detalle.get(str(ck)) or detalle.get(ck) or {}
            _sku = _det.get("sku_detalle") or (_car_row.get("sku_detalle") if _car_row else None)
            _top = _det.get("productos_top") or (_car_row.get("productos_top") if _car_row else None)
            _ofe = (_car_row.get("oferta_real") if _car_row else None)
            gerencia_clientes_rows.append({
                "ejecutivo": z,
                "canal": z,  # alias para schemas viejos
                "cliente_key": str(ck),
                "nombre_cliente": nom_ck.get(str(ck)) or str(ck),
                "comuna": com_ck.get(str(ck)) or None,
                "venta_mtd": round(float(v), 0),
                "pct_zona": round(100.0 * float(v) / tot_z, 2),
                "sku_detalle": _sku,
                "productos_top": _top,
                "oferta_real": _ofe,
                "fecha_snapshot": date.today().isoformat(),
            })
        gerencia_clientes_rows.sort(key=lambda r: -r["venta_mtd"])
    # Completar con TODA la maestra (venta_mtd=0) → mapa canónico cliente→canal para Gerencia histórica
    seen_gc = {str(r.get("cliente_key")) for r in gerencia_clientes_rows}
    for r in cartera_rows:
        ck = str(r.get("cliente_key") or "")
        if not ck or ck in seen_gc:
            continue
        seen_gc.add(ck)
        z = r.get("zona") or "NO_ASIGNADO"
        gerencia_clientes_rows.append({
            "ejecutivo": z,
            "canal": z,
            "cliente_key": ck,
            "nombre_cliente": r.get("nombre_cliente") or ck,
            "comuna": r.get("comuna") or None,
            "venta_mtd": 0,
            "pct_zona": 0,
            "fecha_snapshot": date.today().isoformat(),
        })
    print(f"  gerencia_clientes={len(gerencia_clientes_rows)} (incluye maestra completa)")


    # --- Places ---
    prospectos_rows: List[dict] = []
    force_places = os.environ.get("KF_FORCE_PLACES", "") in ("1", "true", "True")
    skip_places = (not force_places) and (SKIP_PLACES or SKIP_PLACES_AUTO)
    if skip_places and not force_places:
        print("\n[7] PLACES omitido (default auto: no re-gasta API; KF_FORCE_PLACES=1 para regenerar)")
    else:
        print("\n[7] PLACES")
        api_key = get_secret("GOOGLE_MAPS_API_KEY") or get_secret("GEOCODING_KEY")
        if not api_key:
            print("  sin GOOGLE_MAPS_API_KEY — skip Places")
        else:
          try:
            zdf = load_config_csv(ZONAS_GLOBS)
            if zdf is not None and len(zdf.columns) >= 2:
                zonas_comunas = defaultdict(list)
                col_z = next((c for c in zdf.columns if "zona" in str(c).lower()), zdf.columns[0])
                col_c = next((c for c in zdf.columns if "comuna" in str(c).lower()), zdf.columns[1])
                for _, rr in zdf.iterrows():
                    zonas_comunas[normalize_zona(rr[col_z])].append(str(rr[col_c]).strip().upper())
                zonas_comunas = dict(zonas_comunas)
            else:
                zonas_comunas = DEFAULT_ZONAS_COMUNAS
                print("  usando DEFAULT_ZONAS_COMUNAS")

            fdf = load_config_csv(FOCO_GLOBS)
            focos_cfg = []
            if fdf is not None:
                for _, rr in fdf.iterrows():
                    focos_cfg.append(
                        {
                            "zona": normalize_zona(rr.get("zona")),
                            "sku_canon": normalize_sku(rr.get("sku_canon")),
                            "places_types": _s(rr.get("places_types")) or "restaurant",
                            "places_keyword": _s(rr.get("places_keyword")) or "",
                            "max_por_comuna": _i(rr.get("max_por_comuna")) or 25,
                        }
                    )
            else:
                # auto desde focos_skus × zonas terreno
                for z in ZONAS_TERRENO:
                    for sk in focos_skus[:2]:
                        cat = ""
                        if not precios.empty and "sku_canon" in precios.columns:
                            hit = precios[precios["sku_canon"] == sk]
                            if len(hit):
                                cat = (_s(hit.iloc[0].get("categoria")) or "").upper()
                        types, kw = CATEGORIA_TO_PLACES.get(cat, ("restaurant|meal_takeaway", "restaurant"))
                        focos_cfg.append(
                            {
                                "zona": z,
                                "sku_canon": sk,
                                "places_types": types,
                                "places_keyword": kw,
                                "max_por_comuna": 20,
                            }
                        )
                print(f"  focos places auto={len(focos_cfg)}")

            nombres_cartera = set()
            for r in cartera_rows:
                n = (r.get("nombre_cliente") or "").strip().upper()
                if n:
                    nombres_cartera.add(n)

            prospectos_rows = run_places(api_key, zonas_comunas, focos_cfg, nombres_cartera, ejecutivos_map, focos_skus)
            print(f"  prospectos nuevos={len(prospectos_rows)}")
          except Exception as e:
            print(f"  PLACES error (se continúa sin prospectos): {e}")
            prospectos_rows = []

    # --- Publish ---
    print("\n[8] PUBLICAR SUPABASE")
    # 1) primero las líneas del Excel → histórico (idempotente)
    if sb is not None:
        repair_mes = os.environ.get("_KF_REPAIR_MES_MTD", "").strip()
        if repair_mes:
            try:
                d_rep = date.fromisoformat(repair_mes[:10])
                purge_ventas_mes(sb, d_rep)
            except Exception as e:
                print(f"  repair date parse: {e}")
        n_pub = publish_ventas_lineas(sb, ventas_excel_only)
        print(f"  ventas_lineas publicadas desde Excel: {n_pub}")
    if SKIP_SUPABASE or sb is None:
        print("  skip publish")
        # dump local summary
        Path("/tmp/ciclo_limpio_summary.json").write_text(
            json.dumps(
                {
                    "version": VERSION,
                    "mes": str(mes_inicio),
                    "cartera": len(cartera_rows),
                    "stock": len(stock_rows),
                    "prospectos": len(prospectos_rows),
                    "gerencia": ger_rows,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        print("  summary → /tmp/ciclo_limpio_summary.json")
    else:
        # cartera: upsert por cliente_key (y ejecutivo_id si existe)
        # Filtrar terreno para no mezclar KAM en app campo; gerencia usa venta por zona
        # --- CARTERA (schema real) ---
        cartera_pub = []
        for r in cartera_terreno:
            cartera_pub.append(
                {
                    "ejecutivo_id": r.get("ejecutivo_id"),
                    "cliente_key": r.get("cliente_key"),
                    "nombre_cliente": r.get("nombre_cliente"),
                    "comuna": r.get("comuna"),
                    "direccion": r.get("direccion"),
                    "persona_contacto": r.get("persona_contacto"),
                    "telefono": r.get("telefono"),
                    "link_whatsapp": r.get("link_whatsapp"),
                    "ultima_compra": r.get("ultima_compra"),
                    "dias_sin_comprar": r.get("dias_sin_comprar"),
                    "venta_mtd": r.get("venta_mtd"),
                    "venta_mensual": r.get("venta_mensual"),
                    "venta_historica": r.get("venta_historica"),
                    "estado_fuga": r.get("estado_fuga"),
                    "estado_texto": r.get("estado_texto"),
                    "productos_top": r.get("productos_top"),
                    "oferta_real": r.get("oferta_real"),
                    "sku_detalle": r.get("sku_detalle"),
                    "lat": r.get("lat"),
                    "lng": r.get("lng"),
                    "fecha_snapshot": r.get("fecha_snapshot"),
                    "es_nuevo_mes": r.get("es_nuevo_mes"),
                }
            )
        # limpiar cartera de ejecutivos de terreno antes de subir (evita filas huérfanas/duplicadas visuales)
        eids = list({r.get("ejecutivo_id") for r in cartera_pub if r.get("ejecutivo_id")})
        for eid in eids:
            try:
                sb.table("cartera").delete().eq("ejecutivo_id", eid).execute()
            except Exception as e:
                print("  cartera delete warn:", str(e)[:80])
        upsert(sb, "cartera", cartera_pub, on_conflict="ejecutivo_id,cliente_key")

        # --- STOCK (sku_canon, producto_nombre, stock_operativo, ...) ---
        try:
            sb.table("stock").delete().neq("sku_canon", "__none__").execute()
        except Exception as e:
            print("  stock delete warn:", str(e)[:80])
        upsert(sb, "stock", stock_rows, on_conflict="sku_canon")

        # --- TENDENCIA ---
        if tend_rows:
            try:
                sb.table("tendencia").delete().neq("mes", "___impossible___").execute()
            except Exception:
                pass
            upsert(sb, "tendencia", tend_rows, on_conflict="mes")

        # --- GERENCIA (ejecutivo texto) ---
        # Limpia canales viejos (OTROS, etc.) para no duplicar en la UI
        try:
            sb.table("gerencia").delete().neq("ejecutivo", "__none__").execute()
            print("  gerencia: clear previo OK")
        except Exception as e:
            print("  gerencia clear:", str(e)[:80])
        # quitar campos internos
        ger_pub = [{k: v for k, v in r.items() if not str(k).startswith("_")} for r in ger_rows]
        upsert(sb, "gerencia", ger_pub, on_conflict="ejecutivo")
        # gerencia_clientes (detalle por canal) — tolerante si la tabla no existe
        if gerencia_clientes_rows:
            try:
                sb.table("gerencia_clientes").delete().neq("cliente_key", "__none__").execute()
            except Exception as e:
                print("  gerencia_clientes clear:", str(e)[:80])
            try:
                upsert(sb, "gerencia_clientes", gerencia_clientes_rows, on_conflict="ejecutivo,cliente_key")
                print(f"  gerencia_clientes: upsert ~{len(gerencia_clientes_rows)}")
            except Exception as e:
                print("  gerencia_clientes FAIL (crear tabla SQL):", str(e)[:120])

        # --- METAS (ejecutivo_id + mes) ---
        if metas_rows:
            metas_pub = []
            for m in metas_rows:
                if not m.get("ejecutivo_id"):
                    continue
                metas_pub.append(
                    {
                        "ejecutivo_id": m["ejecutivo_id"],
                        "mes": m.get("mes"),
                        "venta_mtd": m.get("venta_mtd"),
                        "meta_mensual": m.get("meta_mensual"),
                        "pct_avance": m.get("pct_avance"),
                        "brecha": m.get("brecha"),
                        "fecha_snapshot": m.get("fecha_snapshot"),
                    }
                )
            upsert(sb, "metas", metas_pub, on_conflict="ejecutivo_id,mes")

        # --- FOCOS ---
        if focos_rows:
            focos_pub = []
            for f in focos_rows:
                if not f.get("ejecutivo_id"):
                    continue
                focos_pub.append(
                    {
                        "ejecutivo_id": f.get("ejecutivo_id"),
                        "foco": f.get("foco"),
                        "unidad_meta": f.get("unidad_meta"),
                        "meta_unidad": f.get("meta_unidad"),
                        "vendido_unidad": f.get("vendido_unidad") or 0,
                        "pct_avance": f.get("pct_avance"),
                        "estado_ritmo": f.get("estado_ritmo") or "SIN_DATO",
                        "fecha_snapshot": f.get("fecha_snapshot") or date.today().isoformat(),
                    }
                )
            upsert(sb, "focos", focos_pub, on_conflict="ejecutivo_id,foco")

        # --- PROSPECTOS (cliente_key = place_id) ---
        if prospectos_rows:
            # Borrar prospectos anteriores por zona antes de insertar
            for z, eid in ejecutivos_map.items():
                if z not in ZONAS_TERRENO:
                    continue
                try:
                    # Borrar por ejecutivo_id Y por zona (para limpiar ambas columnas)
                    sb.table("prospectos").delete().eq("ejecutivo_id", eid).execute()
                    sb.table("prospectos").delete().eq("zona", z).execute()
                except Exception:
                    pass
            # Insertar en lotes por zona para mejor trazabilidad
            for zona_p in ZONAS_TERRENO:
                lote = [r for r in prospectos_rows if r.get("zona") == zona_p]
                if not lote:
                    print(f"  prospectos {zona_p}: 0 filas")
                    continue
                try:
                    # Insertar en chunks de 400
                    for i in range(0, len(lote), 400):
                        sb.table("prospectos").insert(lote[i:i+400]).execute()
                    print(f"  prospectos {zona_p}: {len(lote)} filas ✓")
                except Exception as e:
                    print(f"  prospectos {zona_p}: ERROR {str(e)[:80]}")

    print("\n" + "=" * 72)
    try:
        mes_fin_s = (mes_inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
        mtd_s = 0.0
        if ventas is not None and not ventas.empty:
            mtd_s = float(
                ventas[(ventas["fecha_d"] >= mes_inicio) & (ventas["fecha_d"] < mes_fin_s)]["venta_neta_clp"]
                .fillna(0).sum()
            )
        save_snapshot_meta(sb, mes_inicio, mtd_s, len(ventas) if ventas is not None else 0, VERSION)
    except Exception as e:
        print("  snapshot_meta skip:", str(e)[:100])

    print(f"LISTO {VERSION} | mes={mes_inicio} | cartera_terreno={len(cartera_terreno)}")
    print(f"  stock={len(stock_rows)} prospectos={len(prospectos_rows)} gerencia_zonas={len(ger_rows)}")
    print("App: hard refresh → Cartera / Ruta / Stock / Gerencia")
    print("=" * 72)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise

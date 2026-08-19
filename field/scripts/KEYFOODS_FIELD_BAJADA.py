# -*- coding: utf-8 -*-
"""
=============================================================================
KEYFOODS FIELD — Bajada COMPLETA v8.14
=============================================================================

UN SOLO SCRIPT que carga TODO para las 3 zonas:

  1. Rutas + visitas (por ejecutivo)
  2. Cartera 3 zonas (con productos, oferta, dirección, coords validadas)
  3. Metas por ejecutivo
  4. Focos por ejecutivo
  5. Stock global
  6. Gerencia (3 ejecutivos)
  7. Tendencia (12 meses)
  8. Prospectos por zona (NOR-ORIENTE de BQ, otras zonas de Excel si existe)
  9. Geo: valida coords contra comuna, prefiere Supabase geocodificado

NO PISA: notas_cliente, pedidos, checkins, rutas manuales.

TABLAS GOLD USADAS:
  looker_03_ruta_diaria_final
  looker_07_salud_cartera_final
  ventas_operativas_final
  looker_02_contactabilidad_clientes_actual
  looker_04_stock_decision_final
  looker_01_header_operativo_final   (metas)
  looker_00_focos_mensuales_final
  looker_05_gerencia_final
  looker_05_tendencia_negocio_final
  tbl_03_prospectos_unificados_ruta_actual
  geo_clientes_multizona_v23

PROSPECTOS EXTERNOS (opcional):
  Si existe un archivo Excel de prospectos por zona en Drive, lo carga.
  Ruta: /content/drive/MyDrive/Keyfoods/prospectos_zonas.xlsx
  Formato esperado: columnas nombre, direccion, comuna, zona, lat, lng

COLAB:
  1. Secrets → SUPABASE_SERVICE_KEY (service_role, Notebook access ON)
  2. !pip install -q supabase openpyxl
  3. Auth Google (OBLIGATORIO si ves metadata.google.internal):
       from google.colab import auth
       auth.authenticate_user()
  4. %run "KEYFOODS_FIELD_BAJADA_v8_14.py"
     Debe imprimir VERSION = FIELD_BAJADA_v8.14c y "BigQuery: auth Colab OK"
     Si TODAS las secciones fallan con metadata.google.internal, la bajada
     NO actualizó nada: el checklist solo refleja lo que ya había en Supabase.
=============================================================================
"""
from __future__ import annotations

VERSION = "FIELD_BAJADA_v8.14c"

from datetime import date
import math, re, os
from google.cloud import bigquery

SUPABASE_URL = "https://ihhnfouwviuyycltgafc.supabase.co"
BQ_PROJECT = "keyfoods-intelligence-hub"
BQ_LOCATION = "southamerica-west1"

# Ruta opcional a un Excel de prospectos por zona en Drive
PROSPECTOS_EXCEL = "/content/drive/MyDrive/Keyfoods/prospectos_zonas.xlsx"

FECHA_OBJETIVO = date.today()


def T(name):
    return f"{BQ_PROJECT}.gold.{name}"


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _key():
    try:
        from google.colab import userdata
        k = userdata.get("SUPABASE_SERVICE_KEY")
        if not k: raise ValueError()
        return k
    except Exception:
        raise SystemExit("Falta SUPABASE_SERVICE_KEY en Secrets de Colab.")


def _c(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    try:
        import pandas as pd
        if pd.isna(v): return None
    except Exception: pass
    return v


def _solo_digitos(x):
    return re.sub(r"[^0-9]", "", str(x or ""))


def _limpia_prod(nombre):
    s = str(nombre)
    return s.split("|", 1)[1] if "|" in s else s


def pick_col(df, *cands):
    lower = {c.lower(): c for c in df.columns}
    for c in cands:
        if c.lower() in lower: return lower[c.lower()]
    for c in cands:
        for k, orig in lower.items():
            if c.lower() in k: return orig
    return None


def batch_insert(sb, table, filas, size=500):
    for i in range(0, len(filas), size):
        sb.table(table).insert(filas[i:i+size]).execute()


def safe_insert(sb, table, filas, size=400):
    """Insert with automatic retry: drops unknown columns up to 5 times."""
    if not filas: return
    dropped = set()
    for attempt in range(6):
        try:
            batch_insert(sb, table, filas, size); return
        except Exception as e:
            msg = str(e)
            m = re.search(r"'([a-z_0-9]+)' column", msg, re.I)
            col = m.group(1) if m else None
            if not col or col in dropped or attempt >= 5:
                print(f"  {table}: FAIL after {attempt+1} tries ({msg[:80]})")
                raise
            dropped.add(col)
            print(f"  {table}: dropping column '{col}' (attempt {attempt+1})")
            filas = [{k: v for k, v in row.items() if k not in dropped} for row in filas]


def safe_upsert(sb, table, filas, on_conflict, size=400):
    """Upsert with automatic retry: drops unknown columns up to 5 times."""
    if not filas: return
    dropped = set()
    for attempt in range(6):
        try:
            for i in range(0, len(filas), size):
                sb.table(table).upsert(filas[i:i+size], on_conflict=on_conflict).execute()
            return
        except Exception as e:
            msg = str(e)
            m = re.search(r"'([a-z_0-9]+)' column", msg, re.I)
            col = m.group(1) if m else None
            if not col or col in dropped or attempt >= 5:
                print(f"  {table}: upsert FAIL after {attempt+1} tries ({msg[:80]})")
                raise
            dropped.add(col)
            print(f"  {table}: upsert dropping '{col}' (attempt {attempt+1})")
            filas = [{k: v for k, v in row.items() if k not in dropped} for row in filas]


# ═══════════════════════════════════════════════════════════════════════════
# Validación de coordenadas
# ═══════════════════════════════════════════════════════════════════════════

BBOX_COMUNAS = {
    "LO BARNECHEA": (-33.42,-33.28,-70.58,-70.42), "VITACURA": (-33.41,-33.35,-70.63,-70.54),
    "LAS CONDES": (-33.44,-33.35,-70.61,-70.49), "PROVIDENCIA": (-33.46,-33.41,-70.65,-70.58),
    "ÑUÑOA": (-33.48,-33.43,-70.63,-70.57), "LA REINA": (-33.47,-33.42,-70.58,-70.51),
    "PEÑALOLÉN": (-33.52,-33.45,-70.57,-70.49), "LA FLORIDA": (-33.58,-33.50,-70.60,-70.52),
    "PUENTE ALTO": (-33.65,-33.55,-70.60,-70.52), "MAIPÚ": (-33.55,-33.47,-70.80,-70.72),
    "SAN BERNARDO": (-33.65,-33.55,-70.75,-70.65), "SANTIAGO": (-33.48,-33.42,-70.68,-70.63),
    "RECOLETA": (-33.42,-33.38,-70.66,-70.62), "HUECHURABA": (-33.38,-33.34,-70.68,-70.62),
    "QUILICURA": (-33.38,-33.33,-70.76,-70.68), "COLINA": (-33.25,-33.15,-70.72,-70.60),
    "MACUL": (-33.52,-33.47,-70.62,-70.57), "SAN JOAQUÍN": (-33.52,-33.48,-70.65,-70.61),
    "SAN MIGUEL": (-33.51,-33.48,-70.67,-70.63), "CERRILLOS": (-33.52,-33.48,-70.74,-70.69),
    "PUDAHUEL": (-33.48,-33.38,-70.85,-70.73), "RENCA": (-33.42,-33.38,-70.74,-70.68),
    "INDEPENDENCIA": (-33.43,-33.40,-70.68,-70.64), "CONCHALÍ": (-33.40,-33.37,-70.68,-70.64),
}
RM_BOX = (-33.75, -33.15, -70.95, -70.25)

def _coords_ok(comuna, lat, lng):
    if lat is None or lng is None: return False
    try: la, lo = float(lat), float(lng)
    except: return False
    c = str(comuna or "").upper().strip()
    b = BBOX_COMUNAS.get(c, RM_BOX)
    return b[0] <= la <= b[1] and b[2] <= lo <= b[3]

def _in_rm(lat, lng):
    try: la, lo = float(lat), float(lng)
    except: return False
    return RM_BOX[0] <= la <= RM_BOX[1] and RM_BOX[2] <= lo <= RM_BOX[3]



def _bq_client():
    """BigQuery client con auth de Colab (user) o ADC local.
    El error metadata.google.internal = sesión Colab sin authenticate_user().
    """
    # 1) Colab: forzar login de usuario de Google
    try:
        from google.colab import auth as colab_auth
        colab_auth.authenticate_user()
        print("  BigQuery: auth Colab (authenticate_user) OK")
    except ImportError:
        pass  # no estamos en Colab
    except Exception as e:
        print(f"  BigQuery: warn auth Colab ({str(e)[:80]})")

    # 2) Intentar client normal
    try:
        client = bigquery.Client(project=BQ_PROJECT, location=BQ_LOCATION)
        # Smoke test: no consulta pesada, solo list datasets
        list(client.list_datasets(max_results=1))
        return client
    except Exception as e1:
        msg = str(e1)
        # 3) Fallback: service account JSON en Secrets
        try:
            from google.colab import userdata
            import json
            from google.oauth2 import service_account
            raw = None
            for secret_name in ("BQ_SERVICE_ACCOUNT_JSON", "GOOGLE_APPLICATION_CREDENTIALS_JSON", "GCP_SA_JSON"):
                try:
                    raw = userdata.get(secret_name)
                    if raw:
                        break
                except Exception:
                    continue
            if raw:
                info = json.loads(raw) if isinstance(raw, str) else raw
                creds = service_account.Credentials.from_service_account_info(
                    info,
                    scopes=["https://www.googleapis.com/auth/cloud-platform"],
                )
                client = bigquery.Client(project=BQ_PROJECT, credentials=creds, location=BQ_LOCATION)
                list(client.list_datasets(max_results=1))
                print("  BigQuery: auth service account (secret) OK")
                return client
        except Exception as e2:
            print(f"  BigQuery: SA fallback falló ({str(e2)[:80]})")

        raise SystemExit(
            "BigQuery NO autenticado.\n"
            "En Colab corré ANTES:\n"
            "  from google.colab import auth\n"
            "  auth.authenticate_user()\n"
            "O guardá el JSON de service account en Secrets como BQ_SERVICE_ACCOUNT_JSON.\n"
            f"Error original: {msg[:200]}"
        )

# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def correr(fecha=FECHA_OBJETIVO):
    print("=" * 60)
    print(f"VERSION = {VERSION}")
    print("sku_detalle V1.4: nombre||prom||mtd||clp||clp_mtd||ultima||ciclo_dias||n_compras")
    print("ciclo_dias = mediana de gaps entre fechas de compra (NO inventado)")
    print("Un solo script. 3 zonas. Todo incluido.")
    print("=" * 60)

    from supabase import create_client
    sb = create_client(SUPABASE_URL, _key())
    bq = _bq_client()
    fstr = fecha.isoformat()

    # ── Ejecutivos ──────────────────────────────────────────────────
    ejes = sb.table("ejecutivos").select("id,email,zona,nombre").execute().data
    if not ejes:
        raise SystemExit("No hay ejecutivos en Supabase.")
    por_zona = {}
    for e in ejes:
        if e.get("zona"): por_zona[e["zona"]] = e["id"]
        if e.get("nombre"): por_zona.setdefault(e["nombre"], e["id"])
    print(f"Ejecutivos: {list(por_zona.keys())}")
    eids_activos = set(por_zona.values())

    # ── 1. RUTAS + VISITAS ──────────────────────────────────────────
    try:
        df = bq.query(f"""
            SELECT * FROM `{T('looker_03_ruta_diaria_final')}`
            WHERE fecha_ruta BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                                AND DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY)
               OR fecha_ruta IS NULL
            ORDER BY fecha_ruta, ejecutivo, orden_parada
        """, location=BQ_LOCATION).to_dataframe()
        if not df.empty and "ejecutivo" in df.columns:
            # Normalizar fecha
            if "fecha_ruta" not in df.columns:
                df["fecha_ruta"] = fstr
            df["fecha_ruta"] = df["fecha_ruta"].astype(str).str[:10]
            for (zona, f_ruta), g in df.groupby(["ejecutivo", "fecha_ruta"]):
                eid = por_zona.get(zona)
                if not eid:
                    print(f"  ruta {zona}: sin eid → skip")
                    continue
                if not f_ruta or f_ruta == "NaT" or f_ruta == "None":
                    f_ruta = fstr
                safe_upsert(sb, "rutas", [{
                    "ejecutivo_id": eid, "fecha": f_ruta, "estado": "pendiente",
                    "plan_id_bq": f"P3_{zona}_{f_ruta}",
                }], on_conflict="ejecutivo_id,fecha")
                rutas = sb.table("rutas").select("id").eq("ejecutivo_id", eid).eq("fecha", f_ruta).limit(1).execute().data
                if not rutas: continue
                rid = rutas[0]["id"]
                sb.table("visitas").delete().eq("ruta_id", rid).execute()
                filas = []
                for _, r in g.iterrows():
                    filas.append({
                        "ruta_id": rid, "ejecutivo_id": eid,
                        "orden": int(r["orden_parada"]) if r.get("orden_parada") == r.get("orden_parada") and r.get("orden_parada") is not None else 1,
                        "punto_id_bq": _c(r.get("punto_id")),
                        "nombre_local": _c(r.get("nombre_entidad")),
                        "direccion": _c(r.get("direccion") or r.get("address")),
                        "comuna": _c(r.get("comuna") or r.get("comuna_geografica")),
                        "lat": _c(r.get("lat")), "lng": _c(r.get("lng")),
                        "segmento": _c(r.get("segmento")),
                        "oferta": _c(r.get("oferta") or r.get("oferta_sugerida") or r.get("producto_foco")),
                        "potencial": float(r.get("potencial") or r.get("potencial_estimado_modelo_clp") or 0),
                        "score": float(r.get("score_prioridad") or r.get("score") or 0),
                        "estado": "pendiente",
                    })
                safe_insert(sb, "visitas", filas, 500)
                print(f"  ruta {zona} {f_ruta}: {len(filas)} visitas")
    except Exception as e:
        print(f"  rutas: {str(e)[:80]}")

    # ── 2. CARTERA (3 zonas) ────────────────────────────────────────
    try:
        # Productos por cliente
        prod_por_cliente = {}
        sku_detalle_por_cliente = {}
        try:
            pq = bq.query(f"""
                SELECT cliente_key, producto_nombre, venta_neta_clp, cantidad_unidad, fecha
                FROM `{T('ventas_operativas_final')}`
                WHERE fecha >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
                  AND venta_neta_clp IS NOT NULL AND venta_neta_clp > 0
                LIMIT 600000
            """, location=BQ_LOCATION).to_dataframe()
            # Detect columns (BQ may rename them slightly)
            p_ck   = pick_col(pq, "cliente_key", "rut_cliente", "rut")
            p_prod = pick_col(pq, "producto_nombre", "nombre_producto", "sku_nombre", "producto")
            p_vn   = pick_col(pq, "venta_neta_clp", "venta_neta", "venta")
            p_cant = pick_col(pq, "cantidad_unidad", "cantidad", "unidades")
            print(f"  ventas cols: ck={p_ck} prod={p_prod} vn={p_vn} rows={len(pq)}")
            if p_ck and p_prod and len(pq) > 0:
                import pandas as _pd
                from datetime import date as _date
                p_fecha = pick_col(pq, "fecha", "fecha_venta")
                use_cols = [p_ck, p_prod] + ([p_vn] if p_vn else []) + ([p_cant] if p_cant else []) + ([p_fecha] if p_fecha else [])
                pq2 = pq[use_cols].copy()
                pq2 = pq2.rename(columns={p_ck: "_ck", p_prod: "_prod"})
                if p_vn: pq2 = pq2.rename(columns={p_vn: "_vn"})
                else: pq2["_vn"] = 0.0
                if p_cant: pq2 = pq2.rename(columns={p_cant: "_cant"})
                else: pq2["_cant"] = 0.0
                if p_fecha: pq2 = pq2.rename(columns={p_fecha: "_fecha"})
                else: pq2["_fecha"] = _pd.NaT
                pq2["_ck"] = pq2["_ck"].astype(str)
                pq2["_prod"] = pq2["_prod"].fillna("").astype(str)
                pq2["_vn"] = pq2["_vn"].fillna(0).astype(float)
                pq2["_cant"] = pq2["_cant"].fillna(0).astype(float)
                pq2["_fecha"] = _pd.to_datetime(pq2["_fecha"], errors="coerce")
                mes_ini = _pd.Timestamp(_date.today().replace(day=1))
                es_mtd = pq2["_fecha"] >= mes_ini
                prev = pq2.loc[~es_mtd & (pq2["_prod"] != "")]
                mtd = pq2.loc[es_mtd & (pq2["_prod"] != "")]
                n_meses_prev = int(prev["_fecha"].dt.to_period("M").nunique()) if len(prev) else 0
                n_meses_prev = max(n_meses_prev, 1)
                def _agg(df):
                    if df.empty:
                        return _pd.DataFrame(columns=["_ck","_prod","_vn","_cant"])
                    return df.groupby(["_ck","_prod"], as_index=False).agg(_vn=("_vn","sum"), _cant=("_cant","sum"))
                a_prev, a_mtd = _agg(prev), _agg(mtd)
                merged = a_prev.merge(a_mtd, on=["_ck","_prod"], how="outer", suffixes=("_prev","_mtd")).fillna(0)
                merged["prom_vn"] = merged["_vn_prev"] / float(n_meses_prev)
                merged["prom_cant"] = merged["_cant_prev"] / float(n_meses_prev)

                # Ciclo real: mediana de días entre fechas de compra distintas por cliente+SKU
                # (no inventar frecuencia desde unidades/mes)
                ciclo_map = {}  # (ck, prod) -> (ultima_iso, ciclo_dias, n_compras)
                try:
                    hist = pq2.loc[pq2["_prod"] != ""].copy()
                    hist = hist.dropna(subset=["_fecha"])
                    if not hist.empty:
                        # una fila por día de compra (suma del día no importa para el gap)
                        days = (
                            hist.groupby(["_ck", "_prod", hist["_fecha"].dt.normalize()])
                            .size()
                            .reset_index(name="_n")
                        )
                        for (ck_h, prod_h), gdays in days.groupby(["_ck", "_prod"]):
                            fechas = sorted(gdays["_fecha"].tolist())
                            n_comp = len(fechas)
                            ultima = fechas[-1]
                            ciclo = None
                            if n_comp >= 2:
                                gaps = [(fechas[i] - fechas[i - 1]).days for i in range(1, len(fechas))]
                                gaps = [g for g in gaps if g > 0]
                                if gaps:
                                    gaps_s = sorted(gaps)
                                    mid = len(gaps_s) // 2
                                    ciclo = gaps_s[mid] if len(gaps_s) % 2 else int(round((gaps_s[mid - 1] + gaps_s[mid]) / 2))
                                    ciclo = int(max(1, min(120, ciclo)))  # sanity
                            ciclo_map[(str(ck_h), str(prod_h))] = (
                                ultima.strftime("%Y-%m-%d") if hasattr(ultima, "strftime") else str(ultima)[:10],
                                ciclo,
                                n_comp,
                            )
                except Exception as _ce:
                    print(f"  ciclo real: warn ({str(_ce)[:50]})")

                merged = merged.sort_values(["_ck","_vn_mtd","prom_vn"], ascending=[True, False, False])
                for ck_v, g in merged.groupby("_ck"):
                    top = g.head(5)
                    prod_por_cliente[str(ck_v)] = " · ".join(_limpia_prod(r["_prod"]) for _, r in top.iterrows())
                    # V1.4: nombre||prom_ud||ud_mtd||prom_clp||clp_mtd||ultima||ciclo_dias||n_compras
                    lines = []
                    for _, r in top.iterrows():
                        prod_raw = str(r["_prod"])
                        ult, cic, ncom = ciclo_map.get((str(ck_v), prod_raw), (None, None, 0))
                        cic_s = "" if cic is None else str(int(cic))
                        ult_s = ult or ""
                        ncom_s = str(int(ncom or 0))
                        lines.append(
                            f"{_limpia_prod(prod_raw)}||{round(float(r['prom_cant']),1)}||{round(float(r['_cant_mtd']),1)}"
                            f"||{round(float(r['prom_vn']),0)}||{round(float(r['_vn_mtd']),0)}"
                            f"||{ult_s}||{cic_s}||{ncom_s}"
                        )
                    sku_detalle_por_cliente[str(ck_v)] = "\n".join(lines)
                print(f"  productos por cliente: {len(prod_por_cliente)} (V1.4 ciclo real, meses_prev={n_meses_prev}, ciclos={len(ciclo_map)})")
        except Exception as e:
            print(f"  productos: {str(e)[:60]}")

        # Direcciones
        dir_por_cliente = {}
        dir_norm = {}
        try:
            dq = bq.query(f"""
                SELECT DISTINCT cliente_key, direccion, comuna
                FROM `{T('ventas_operativas_final')}`
                WHERE direccion IS NOT NULL
            """, location=BQ_LOCATION).to_dataframe()
            for _, r in dq.iterrows():
                ck = str(r["cliente_key"])
                d = _c(r.get("direccion"))
                if d: dir_por_cliente[ck] = d
            print(f"  direcciones (de ventas): {len(dir_por_cliente)}")
        except: pass
        try:
            mq = bq.query(f"""
                SELECT CAST(cliente_key_join AS STRING) AS ck, direccion_maestra, comuna_maestra
                FROM `{T('looker_02_contactabilidad_clientes_actual')}`
                WHERE direccion_maestra IS NOT NULL AND TRIM(direccion_maestra) != ''
            """, location=BQ_LOCATION).to_dataframe()
            for _, r in mq.iterrows():
                d = _c(r.get("direccion_maestra"))
                if d:
                    dir_norm[_solo_digitos(r["ck"])] = d
            print(f"  direcciones maestra (respaldo): {len(dir_norm)}")
        except: pass

        # Coordenadas validadas
        coords_por_cliente = {}
        coords_supabase = {}
        try:
            existing = sb.table("cartera").select("cliente_key,lat,lng,comuna").execute().data
            for row in (existing or []):
                if row.get("lat") is not None and row.get("lng") is not None:
                    coords_supabase[str(row["cliente_key"])] = (float(row["lat"]), float(row["lng"]), row.get("comuna"))
        except: pass

        comunas_por_cliente = {}
        try:
            cq = bq.query(f"""SELECT DISTINCT cliente_key, comuna FROM `{T('looker_07_salud_cartera_final')}` WHERE cliente_key IS NOT NULL""", location=BQ_LOCATION).to_dataframe()
            for _, r in cq.iterrows():
                comunas_por_cliente[str(r["cliente_key"])] = str(r.get("comuna") or "").upper().strip()
        except: pass

        descartados = 0
        try:
            gdf = bq.query(f"""
                SELECT cliente_key, lat, lng,
                       ROW_NUMBER() OVER (PARTITION BY cliente_key ORDER BY lat) AS rn
                FROM `{T('geo_clientes_multizona_v23')}`
                WHERE lat IS NOT NULL AND lng IS NOT NULL
                  AND SAFE_CAST(lat AS FLOAT64) BETWEEN -34.5 AND -32.5
                  AND SAFE_CAST(lng AS FLOAT64) BETWEEN -71.5 AND -70.0
                QUALIFY rn = 1
            """, location=BQ_LOCATION).to_dataframe()
            for _, r in gdf.iterrows():
                ck = str(r["cliente_key"])
                try: lat, lng = float(r["lat"]), float(r["lng"])
                except: continue
                if ck in coords_supabase:
                    coords_por_cliente[ck] = (coords_supabase[ck][0], coords_supabase[ck][1])
                elif _coords_ok(comunas_por_cliente.get(ck, ""), lat, lng):
                    coords_por_cliente[ck] = (lat, lng)
                else:
                    descartados += 1
            for ck, (la, lo, _) in coords_supabase.items():
                if ck not in coords_por_cliente:
                    coords_por_cliente[ck] = (la, lo)
            print(f"  coordenadas de clientes: {len(coords_por_cliente)} con lat/lng ({descartados} descartados por incoherencia)")
        except Exception as e:
            for ck, (la, lo, _) in coords_supabase.items():
                coords_por_cliente[ck] = (la, lo)
            print(f"  coordenadas: fallback supabase {len(coords_por_cliente)} ({str(e)[:60]})")

        # Oferta real
        oferta_por_cliente = {}
        try:
            # Load stock table to get foco products (no cliente_key in this table)
            oq_raw = bq.query(f"""
                SELECT * FROM `{T('looker_04_stock_decision_final')}`
            """, location=BQ_LOCATION).to_dataframe()
            foco_col  = pick_col(oq_raw, "es_sku_foco_mes", "es_sku_foco", "es_foco_mes", "es_foco")
            stock_col = pick_col(oq_raw, "stock_unidad_origen", "stock_operativo", "stock")
            prod_col  = pick_col(oq_raw, "producto_nombre", "producto", "sku_nombre")
            # Build foco product set (products in foco with stock > 0)
            focos_set = set()
            if foco_col and prod_col:
                mask = oq_raw[foco_col].fillna(False).astype(bool)
                if stock_col:
                    mask = mask & (oq_raw[stock_col].fillna(0).astype(float) > 0)
                focos_set = set(oq_raw[mask][prod_col].dropna().astype(str).unique())
            print(f"    focos con stock: {len(focos_set)} productos")
            # Build oferta per client: intersect their buying history with foco set
            oq_por_cliente = {}
            if focos_set and prod_por_cliente:
                for ck_v, prods_str in prod_por_cliente.items():
                    prods = [p.strip() for p in prods_str.split(" · ")]
                    match = [p for p in prods if p in focos_set]
                    if match:
                        oq_por_cliente[ck_v] = " · ".join(match[:3])
                    else:
                        # Client buys something but nothing is in foco → offer top foco products
                        oq_por_cliente[ck_v] = " · ".join(list(focos_set)[:2])
            elif focos_set:
                # No purchase history but focos exist → assign top focos to everyone
                foco_str = " · ".join(list(focos_set)[:3])
                # Will be assigned in cartera loop below
                pass
            # Build oq dataframe for compatibility with downstream code
            import pandas as _pd
            if oq_por_cliente:
                oq = _pd.DataFrame(list(oq_por_cliente.items()), columns=["cliente_key","oferta"])
            else:
                oq = oq_raw.head(0)
            if not oq.empty and "cliente_key" in oq.columns:
                for _, r in oq.iterrows():
                    oferta_por_cliente[str(r["cliente_key"])] = _c(r.get("oferta"))
            print(f"  oferta real por cliente: {len(oferta_por_cliente)}")
        except Exception as e:
            print(f"  oferta: {str(e)[:60]}")

        # ── Venta MTD del mes (looker_07 NO trae venta_mtd) ──────────────
        mtd_por_cliente = {}
        try:
            mtd_q = bq.query(f"""
                SELECT CAST(cliente_key AS STRING) AS ck,
                       SUM(venta_neta_clp) AS venta_mtd
                FROM `{T('ventas_operativas_final')}`
                WHERE fecha >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                  AND fecha <= CURRENT_DATE()
                  AND venta_neta_clp IS NOT NULL
                GROUP BY 1
            """, location=BQ_LOCATION).to_dataframe()
            for _, r in mtd_q.iterrows():
                ck = str(r["ck"] or "")
                if ck:
                    mtd_por_cliente[ck] = float(r["venta_mtd"] or 0)
            print(f"  venta_mtd mes: {len(mtd_por_cliente)} clientes · total ${sum(mtd_por_cliente.values()):,.0f}")
        except Exception as e:
            print(f"  venta_mtd: {str(e)[:80]}")

        # Cartera: 3 zonas
        cdf = bq.query(f"""
            SELECT *, ANY_VALUE(telefono) OVER (PARTITION BY cliente_key) AS tel,
                   ANY_VALUE(link_whatsapp) OVER (PARTITION BY cliente_key) AS wsp
            FROM `{T('looker_07_salud_cartera_final')}`
        """, location=BQ_LOCATION).to_dataframe()
        n = 0
        for zona, g in (cdf.groupby("ejecutivo") if "ejecutivo" in cdf.columns else []):
            eid = por_zona.get(zona)
            if not eid:
                print(f"  cartera {zona}: sin eid → no pisa")
                continue
            filas = []
            for _, r in g.iterrows():
                ck = str(r.get("cliente_key") or "")
                if not ck: continue
                filas.append({
                    "ejecutivo_id": eid,
                    "cliente_key": ck,
                    "nombre_cliente": _c(r.get("nombre_cliente")),
                    "comuna": _c(r.get("comuna")),
                    "canal": _c(r.get("canal")),
                    "estado_fuga": _c(r.get("estado_fuga")),
                    "dias_sin_comprar": _c(r.get("dias_sin_comprar")),
                    "venta_mtd": mtd_por_cliente.get(ck) or 0,
                    "venta_mensual": _c(r.get("venta_mensual_historica_clp")),
                    "es_bloqueado": bool(r.get("es_bloqueado_venta") or r.get("es_bloqueado")),
                    "es_nuevo_mes": bool(
                        (mtd_por_cliente.get(ck) or 0) > 0
                        and str(r.get("estado_fuga") or "").startswith("0_")
                    ),
                    "telefono": _c(r.get("tel") or r.get("telefono")),
                    "link_whatsapp": _c(r.get("wsp") or r.get("link_whatsapp")),
                    "productos_top": prod_por_cliente.get(ck),
                    "sku_detalle": sku_detalle_por_cliente.get(ck),
                    "oferta_real": oferta_por_cliente.get(ck),
                    "direccion": dir_por_cliente.get(ck) or dir_norm.get(_solo_digitos(ck)),
                    "lat": coords_por_cliente.get(ck, (None, None))[0],
                    "lng": coords_por_cliente.get(ck, (None, None))[1],
                    "fecha_snapshot": fstr,
                })
            if filas:
                # Delete old ONLY after building new rows successfully
                sb.table("cartera").delete().eq("ejecutivo_id", eid).execute()
                safe_insert(sb, "cartera", filas, 500)
                n += len(filas)
                print(f"  cartera {zona}: {len(filas)}")
        print(f"  cartera total: {n}")
    except Exception as e:
        print(f"  cartera ERROR: {str(e)[:120]}")

    # ── 3. METAS ────────────────────────────────────────────────────
    try:
        h = bq.query(f"SELECT * FROM `{T('looker_01_header_operativo_final')}`", location=BQ_LOCATION).to_dataframe()
        if not h.empty and "ejecutivo" in h.columns:
            vm_col  = pick_col(h, "venta_mtd", "venta_mtd_oficial_clp", "venta_mtd_clp", "venta_mes")
            met_col = pick_col(h, "meta_mensual", "meta_mensual_clp", "meta_clp", "meta_mes")
            pct_col = pick_col(h, "pct_avance", "pct_avance_meta", "avance_pct")
            bre_col = pick_col(h, "brecha", "brecha_clp", "brecha_meta")
            for _, r in h.iterrows():
                eid = por_zona.get(str(r["ejecutivo"]))
                if not eid: continue
                safe_upsert(sb, "metas", [{
                    "ejecutivo_id": eid,
                    "mes": fstr[:7] + "-01",
                    "venta_mtd":   _c(r.get(vm_col))  if vm_col  else None,
                    "meta_mensual":_c(r.get(met_col)) if met_col else None,
                    "pct_avance":  _c(r.get(pct_col)) if pct_col else None,
                    "brecha":      _c(r.get(bre_col)) if bre_col else None,
                    "fecha_snapshot": fstr,
                }], on_conflict="ejecutivo_id,mes")
            print(f"  metas: {len(h)} ejecutivos (vm={vm_col}, meta={met_col})")
    except Exception as e:
        print(f"  metas: {str(e)[:80]}")

    # ── 4. FOCOS ────────────────────────────────────────────────────
    try:
        f = bq.query(f"SELECT * FROM `{T('looker_00_focos_mensuales_final')}`", location=BQ_LOCATION).to_dataframe()
        if not f.empty and "ejecutivo" in f.columns:
            mu_col  = pick_col(f, "meta_unidad", "meta_unidad_mes", "meta_kg", "meta_lt")
            vu_col  = pick_col(f, "vendido_unidad", "vendido_unidad_mtd", "vendido_kg", "vendido_lt")
            un_col  = pick_col(f, "unidad_meta", "unidad")
            pct_col = pick_col(f, "pct_avance", "pct_avance_unidad")
            er_col  = pick_col(f, "estado_ritmo", "estado_ritmo_foco")
            for zona, g in f.groupby("ejecutivo"):
                eid = por_zona.get(zona)
                if not eid: continue
                sb.table("focos").delete().eq("ejecutivo_id", eid).execute()
                filas = [{
                    "ejecutivo_id":  eid,
                    "foco":          _c(r.get("foco")),
                    "unidad_meta":   _c(r.get(un_col))  if un_col  else None,
                    "meta_unidad":   _c(r.get(mu_col))  if mu_col  else None,
                    "vendido_unidad":_c(r.get(vu_col))  if vu_col  else None,
                    "pct_avance":    _c(r.get(pct_col)) if pct_col else None,
                    "estado_ritmo":  _c(r.get(er_col))  if er_col  else None,
                    "fecha_snapshot": fstr,
                } for _, r in g.iterrows()]
                safe_insert(sb, "focos", filas, 200)
            print(f"  focos: ok (meta={mu_col}, vendido={vu_col})")
    except Exception as e:
        print(f"  focos: {str(e)[:80]}")

    # ── 5. STOCK ────────────────────────────────────────────────────
    try:
        # Re-use oq_raw if available, otherwise re-query
        try:
            s = oq_raw
        except NameError:
            s = bq.query(f"SELECT * FROM `{T('looker_04_stock_decision_final')}`", location=BQ_LOCATION).to_dataframe()
        if not s.empty:
            sb.table("stock").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            sc_col = pick_col(s, "sku_canon_key", "sku_canon", "sku", "codigo_producto")
            pn_col = pick_col(s, "producto_nombre", "producto", "nombre_producto", "descripcion")
            sf_col = pick_col(s, "subfamilia", "familia", "categoria")
            so_col = pick_col(s, "stock_unidad_origen", "stock_operativo", "stock")
            cd_col = pick_col(s, "cobertura_dias", "dias_cobertura", "dias_stock")
            es_col = pick_col(s, "estado_stock", "estado_sku", "estado")
            fc_col = pick_col(s, "es_sku_foco_mes", "es_sku_foco", "es_foco_mes", "es_foco")
            filas = []
            for _, r in s.iterrows():
                sku = _c(r.get(sc_col)) if sc_col else None
                if not sku: continue
                filas.append({
                    "sku_canon": sku,
                    "producto_nombre": _c(r.get(pn_col)) if pn_col else sku,
                    "subfamilia": _c(r.get(sf_col)) if sf_col else None,
                    "stock_operativo": _c(r.get(so_col)) if so_col else None,
                    "cobertura_dias": _c(r.get(cd_col)) if cd_col else None,
                    "estado_stock": _c(r.get(es_col)) if es_col else None,
                    "es_foco_mes": bool(r.get(fc_col)) if fc_col else False,
                    "fecha_snapshot": fstr,
                })
            safe_insert(sb, "stock", filas, 400)
            print(f"  stock: {len(filas)} SKU")
    except Exception as e:
        print(f"  stock: {str(e)[:80]}")

    # ── 6. GERENCIA (UNA sola fuente: ventas_operativas_final) ───────
    # Venta MTD por canal de asignación maestra + meta solo para 3 zonas terreno.
    # Evita mezclar looker_05.venta_mtd con ventas (doble conteo / descuadre).
    try:
        metas_zona = {}
        try:
            gmeta = bq.query(f"SELECT * FROM `{T('looker_05_gerencia_final')}`", location=BQ_LOCATION).to_dataframe()
            if not gmeta.empty and "ejecutivo" in gmeta.columns:
                met_col = pick_col(gmeta, "meta_mensual", "meta_mensual_clp", "meta_clp", "meta_mes")
                ac_col = pick_col(gmeta, "accion", "accion_recomendada")
                for _, r in gmeta.iterrows():
                    z = str(_c(r.get("ejecutivo")) or "").strip()
                    if not z: continue
                    metas_zona[z.upper()] = {
                        "meta": _c(r.get(met_col)) if met_col else None,
                        "accion": _c(r.get(ac_col)) if ac_col else None,
                    }
        except Exception as e:
            print(f"  gerencia metas looker_05: {str(e)[:60]}")

        # Asignación: looker_07 + dim_clientes (join por dígitos del RUT) + ventas
        # SEGUN_MAESTRA en ventas NO es zona → se resuelve por cartera/dim
        ch = bq.query(f"""
            WITH ventas_mes AS (
              SELECT
                CAST(cliente_key AS STRING) AS ck,
                REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') AS ck_dig,
                venta_neta_clp,
                zona_comercial_asignacion,
                ejecutivo_asignacion
              FROM `{T('ventas_operativas_final')}`
              WHERE fecha >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                AND fecha <= CURRENT_DATE()
                AND venta_neta_clp IS NOT NULL
            ),
            cartera_z AS (
              SELECT
                REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') AS ck_dig,
                UPPER(TRIM(CAST(ejecutivo AS STRING))) AS zona_cartera
              FROM `{T('looker_07_salud_cartera_final')}`
              WHERE ejecutivo IS NOT NULL AND TRIM(CAST(ejecutivo AS STRING)) != ''
              QUALIFY ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') ORDER BY ejecutivo) = 1
            ),
            dim_z AS (
              SELECT
                REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') AS ck_dig,
                UPPER(TRIM(CAST(ejecutivo AS STRING))) AS zona_dim
              FROM `{T('dim_clientes')}`
              WHERE ejecutivo IS NOT NULL AND TRIM(CAST(ejecutivo AS STRING)) != ''
              QUALIFY ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') ORDER BY ejecutivo) = 1
            )
            SELECT
              CASE
                WHEN c.zona_cartera IS NOT NULL AND c.zona_cartera NOT IN ('', 'NULL', 'NONE', 'SEGUN_MAESTRA')
                  THEN c.zona_cartera
                WHEN d.zona_dim IS NOT NULL AND d.zona_dim NOT IN ('', 'NULL', 'NONE', 'SEGUN_MAESTRA')
                  THEN d.zona_dim
                WHEN v.zona_comercial_asignacion IS NOT NULL
                     AND TRIM(CAST(v.zona_comercial_asignacion AS STRING)) != ''
                     AND UPPER(TRIM(CAST(v.zona_comercial_asignacion AS STRING))) NOT IN
                         ('SEGUN_MAESTRA', 'SIN_ASIGNAR', 'NULL', 'NONE', 'SIN ASIGNAR')
                  THEN UPPER(TRIM(CAST(v.zona_comercial_asignacion AS STRING)))
                WHEN v.ejecutivo_asignacion IS NOT NULL
                     AND TRIM(CAST(v.ejecutivo_asignacion AS STRING)) != ''
                     AND UPPER(TRIM(CAST(v.ejecutivo_asignacion AS STRING))) NOT IN
                         ('SEGUN_MAESTRA', 'SIN_ASIGNAR', 'NULL', 'NONE')
                  THEN UPPER(TRIM(CAST(v.ejecutivo_asignacion AS STRING)))
                ELSE 'NO_ASIGNADOS'
              END AS canal,
              SUM(v.venta_neta_clp) AS venta_mtd,
              COUNT(DISTINCT v.ck) AS clientes_mtd
            FROM ventas_mes v
            LEFT JOIN cartera_z c ON c.ck_dig = v.ck_dig
            LEFT JOIN dim_z d ON d.ck_dig = v.ck_dig
            GROUP BY 1
            HAVING SUM(v.venta_neta_clp) > 0
            ORDER BY 2 DESC
        """, location=BQ_LOCATION).to_dataframe()

        # Normalizar nombres de las 3 zonas terreno
        def _norm_zona(s):
            u = str(s or "").upper().strip().replace("_", " ").replace("  ", " ")
            if "NOR" in u and "ORIENT" in u: return "NOR-ORIENTE"
            if "NOR" in u and "PONIENT" in u: return "NOR-PONIENTE"
            if "SUR" in u and ("ZONA" in u or u == "SUR"): return "ZONA SUR"
            if "TELEVENTA" in u or "TELE VENTA" in u: return "TELEVENTA"
            if "KAM" in u: return "KAM CADENAS"
            if "JEFE" in u and "VENTA" in u: return "JEFE DE VENTAS"
            if u in ("NO_ASIGNADOS", "NO ASIGNADOS", "SIN ASIGNAR", "SIN_ASIGNAR"): return "NO_ASIGNADOS"
            return str(s or "").strip()

        # Agregar por canal ya normalizado (evita ON CONFLICT "row a second time")
        agg = {}
        for _, r in ch.iterrows():
            canal = _norm_zona(r["canal"])
            if not canal:
                continue
            key = canal.upper()
            if key not in agg:
                agg[key] = {"ejecutivo": canal, "venta_mtd": 0.0, "clientes_mtd": 0}
            agg[key]["venta_mtd"] += float(r["venta_mtd"] or 0)
            agg[key]["clientes_mtd"] += int(r["clientes_mtd"] or 0)

        filas_g = []
        total_v = 0.0
        for key, v in sorted(agg.items(), key=lambda x: -x[1]["venta_mtd"]):
            canal = v["ejecutivo"]
            venta = v["venta_mtd"]
            ncli = v["clientes_mtd"]
            total_v += venta
            meta_info = metas_zona.get(canal.upper()) or metas_zona.get(key) or {}
            meta = meta_info.get("meta")
            brecha = None
            if meta is not None:
                try:
                    brecha = float(meta) - venta
                except Exception:
                    brecha = None
            accion = meta_info.get("accion")
            if not accion:
                accion = f"{ncli} clientes con venta en el mes"
            else:
                accion = f"{accion} · {ncli} clientes MTD"
            filas_g.append({
                "ejecutivo": canal,
                "venta_mtd": round(venta, 0),
                "meta_mensual": meta,
                "brecha": brecha,
                "accion": accion,
                "fecha_snapshot": fstr,
            })

        if filas_g:
            # Borrar e insertar (más seguro que upsert con posibles dupes residuales)
            try:
                sb.table("gerencia").delete().neq("ejecutivo", "___").execute()
            except Exception as e:
                print(f"  gerencia delete: {str(e)[:60]}")
            # insert en lotes sin on_conflict
            try:
                for i in range(0, len(filas_g), 50):
                    sb.table("gerencia").upsert(filas_g[i:i+50], on_conflict="ejecutivo").execute()
            except Exception as e1:
                print(f"  gerencia upsert retry insert: {str(e1)[:80]}")
                try:
                    sb.table("gerencia").insert(filas_g).execute()
                except Exception as e2:
                    print(f"  gerencia insert FAIL: {str(e2)[:80]}")
            print(f"  gerencia UNIFICADA: {len(filas_g)} canales · total ${total_v:,.0f}")
            for f in filas_g[:10]:
                print(f"    {f['ejecutivo']}: ${float(f['venta_mtd']):,.0f}")

            # Detalle clientes por canal (para actualizar maestra / ver NO_ASIGNADOS)
            try:
                det = bq.query(f"""
                    WITH ventas_mes AS (
                      SELECT
                        CAST(cliente_key AS STRING) AS ck,
                        REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') AS ck_dig,
                        venta_neta_clp
                      FROM `{T('ventas_operativas_final')}`
                      WHERE fecha >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                        AND fecha <= CURRENT_DATE()
                        AND venta_neta_clp IS NOT NULL
                    ),
                    cartera_z AS (
                      SELECT
                        REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') AS ck_dig,
                        UPPER(TRIM(CAST(ejecutivo AS STRING))) AS zona_cartera,
                        ANY_VALUE(nombre_cliente) AS nombre_cliente,
                        ANY_VALUE(comuna) AS comuna
                      FROM `{T('looker_07_salud_cartera_final')}`
                      GROUP BY 1, 2
                    ),
                    dim_z AS (
                      SELECT
                        REGEXP_REPLACE(CAST(cliente_key AS STRING), r'[^0-9]', '') AS ck_dig,
                        UPPER(TRIM(CAST(ejecutivo AS STRING))) AS zona_dim,
                        ANY_VALUE(nombre_cliente) AS nombre_cliente,
                        ANY_VALUE(comuna) AS comuna
                      FROM `{T('dim_clientes')}`
                      GROUP BY 1, 2
                    ),
                    tagged AS (
                      SELECT
                        v.ck,
                        SUM(v.venta_neta_clp) AS venta_mtd,
                        COALESCE(
                          NULLIF(c.zona_cartera, ''),
                          NULLIF(d.zona_dim, ''),
                          'NO_ASIGNADOS'
                        ) AS canal,
                        COALESCE(c.nombre_cliente, d.nombre_cliente, v.ck) AS nombre_cliente,
                        COALESCE(c.comuna, d.comuna) AS comuna
                      FROM ventas_mes v
                      LEFT JOIN cartera_z c ON c.ck_dig = v.ck_dig
                      LEFT JOIN dim_z d ON d.ck_dig = v.ck_dig
                      GROUP BY 1, 3, 4, 5
                    )
                    SELECT canal, ck AS cliente_key, nombre_cliente, comuna, venta_mtd
                    FROM tagged
                    ORDER BY venta_mtd DESC
                    LIMIT 800
                """, location=BQ_LOCATION).to_dataframe()
                filas_d = []
                for _, r in det.iterrows():
                    filas_d.append({
                        "canal": str(r["canal"] or "NO_ASIGNADOS"),
                        "cliente_key": str(r["cliente_key"] or ""),
                        "nombre_cliente": _c(r.get("nombre_cliente")),
                        "comuna": _c(r.get("comuna")),
                        "venta_mtd": float(r["venta_mtd"] or 0),
                        "fecha_snapshot": fstr,
                    })
                if filas_d:
                    try:
                        sb.table("gerencia_clientes").delete().neq("canal", "___").execute()
                    except Exception:
                        pass
                    try:
                        for i in range(0, len(filas_d), 200):
                            sb.table("gerencia_clientes").upsert(
                                filas_d[i:i+200], on_conflict="canal,cliente_key"
                            ).execute()
                        print(f"  gerencia_clientes: {len(filas_d)} filas (detalle por canal)")
                    except Exception as e:
                        print(f"  gerencia_clientes: tabla ausente o error ({str(e)[:70]})")
                        print("  → Ejecutá SUPABASE_FIX_PROSPECTOS_RLS.sql en Supabase SQL Editor")
            except Exception as e:
                print(f"  gerencia_clientes detail: {str(e)[:80]}")
    except Exception as e:
        print(f"  gerencia: {str(e)[:100]}")

    # ── 7. TENDENCIA ────────────────────────────────────────────────
    try:
        t = bq.query(f"SELECT * FROM `{T('looker_05_tendencia_negocio_final')}` ORDER BY mes", location=BQ_LOCATION).to_dataframe()
        if not t.empty:
            sb.table("tendencia").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            filas = [{
                "mes": str(r.get("mes")) if r.get("mes") is not None else None,
                "venta_clp": _c(r.get("venta_clp")),
                "fecha_snapshot": fstr,
            } for _, r in t.iterrows()]
            safe_insert(sb, "tendencia", filas, 200)
            print(f"  tendencia: {len(filas)} meses")
    except Exception as e:
        print(f"  tendencia: {str(e)[:80]}")

    # ── 8. PROSPECTOS ───────────────────────────────────────────────
    # Preferir ext_prospectos_field_app (Places 3 zonas) si tiene datos.
    # Si no, banco tbl_03. NO borrar zonas que Places cargó si usamos solo BQ banco.
    try:
        pdf = None
        fuente_p = None
        try:
            pdf = bq.query(f"""
                SELECT * FROM `{T('ext_prospectos_field_app')}`
                WHERE lat IS NOT NULL AND lng IS NOT NULL
                LIMIT 8000
            """, location=BQ_LOCATION).to_dataframe()
            if pdf is not None and len(pdf) > 0:
                fuente_p = "ext_prospectos_field_app (Places)"
        except Exception as e:
            print(f"  prospectos Places table: {str(e)[:50]}")
            pdf = None
        if pdf is None or pdf.empty:
            pdf = bq.query(f"SELECT * FROM `{T('tbl_03_prospectos_unificados_ruta_actual')}` LIMIT 5000", location=BQ_LOCATION).to_dataframe()
            fuente_p = "tbl_03_prospectos_unificados_ruta_actual"
        print(f"  prospectos fuente: {fuente_p} ({len(pdf)} filas)")

        c_key = pick_col(pdf, "place_id", "punto_id", "cliente_key", "prospecto_id")
        c_nom = pick_col(pdf, "nombre_prospecto", "nombre_cliente", "nombre_entidad", "nombre")
        c_dir = pick_col(pdf, "direccion", "address")
        c_com = pick_col(pdf, "comuna", "comuna_geografica")
        c_lat = pick_col(pdf, "lat", "latitude", "latitud")
        c_lng = pick_col(pdf, "lng", "longitude", "longitud")
        c_ofe = pick_col(pdf, "producto_foco", "oferta", "sku_foco")
        c_sco = pick_col(pdf, "score_prioridad", "score")
        c_pot = pick_col(pdf, "potencial", "potencial_estimado_modelo_clp")
        c_zon = pick_col(pdf, "zona", "ejecutivo", "zona_ejecutivo")

        # Determinar zona de cada prospecto
        eid_default = next(iter(eids_activos))
        for z, eid in por_zona.items():
            if "NOR" in str(z).upper() and "ORI" in str(z).upper():
                eid_default = eid; break

        # Borrar prospectos viejos de todas las zonas
        for eid in eids_activos:
            try: sb.table("prospectos").delete().eq("ejecutivo_id", eid).execute()
            except: pass

        filas, seen = [], set()
        for _, r in pdf.iterrows():
            key = str((_c(r.get(c_key)) if c_key else None) or (_c(r.get(c_nom)) if c_nom else None) or "")
            if not key or key in seen: continue
            seen.add(key)
            lat = _c(r.get(c_lat)) if c_lat else None
            lng = _c(r.get(c_lng)) if c_lng else None
            try: lat, lng = float(lat), float(lng)
            except: lat, lng = None, None
            if lat is not None and not _in_rm(lat, lng):
                lat, lng = None, None

            # Asignar zona
            zona_p = str(_c(r.get(c_zon)) if c_zon else "NOR-ORIENTE" or "NOR-ORIENTE").upper()
            eid_p = por_zona.get(zona_p, eid_default)

            filas.append({
                "ejecutivo_id": eid_p,
                "zona": zona_p if zona_p in por_zona else "NOR-ORIENTE",
                "cliente_key": key,
                "nombre_cliente": (_c(r.get(c_nom)) if c_nom else None) or key,
                "direccion": _c(r.get(c_dir)) if c_dir else None,
                "comuna": _c(r.get(c_com)) if c_com else None,
                "lat": lat, "lng": lng,
                "segmento": "PROSPECTO",
                "oferta": _c(r.get(c_ofe)) if c_ofe else None,
                "score": _c(r.get(c_sco)) if c_sco else None,
                "potencial": _c(r.get(c_pot)) if c_pot else None,
                "estado": "PROSPECTO",
            })
        n_bq = len(filas)
        from collections import Counter
        cz = Counter(f.get("zona") or "?" for f in filas)
        print(f"  prospectos armados: {n_bq} · por zona: {dict(cz)}")


        # 8b. Prospectos de Excel (si existe el archivo en Drive)
        n_xl = 0
        if os.path.exists(PROSPECTOS_EXCEL):
            try:
                import pandas as pd
                xl = pd.read_excel(PROSPECTOS_EXCEL)
                xl.columns = [c.strip().lower().replace(" ", "_") for c in xl.columns]
                for _, r in xl.iterrows():
                    nom = str(_c(r.get("nombre")) or _c(r.get("nombre_cliente")) or "").strip()
                    if not nom or nom in seen: continue
                    seen.add(nom)
                    zona_x = str(_c(r.get("zona")) or "").upper().strip()
                    eid_x = por_zona.get(zona_x, eid_default)
                    lat_x = _c(r.get("lat") or r.get("latitud"))
                    lng_x = _c(r.get("lng") or r.get("longitud"))
                    try: lat_x, lng_x = float(lat_x), float(lng_x)
                    except: lat_x, lng_x = None, None
                    if lat_x is not None and not _in_rm(lat_x, lng_x):
                        lat_x, lng_x = None, None
                    filas.append({
                        "ejecutivo_id": eid_x,
                        "zona": zona_x or "SIN_ZONA",
                        "cliente_key": nom,
                        "nombre_cliente": nom,
                        "direccion": _c(r.get("direccion")),
                        "comuna": _c(r.get("comuna")),
                        "lat": lat_x, "lng": lng_x,
                        "segmento": "PROSPECTO",
                        "oferta": _c(r.get("oferta") or r.get("producto_foco")),
                        "score": _c(r.get("score")),
                        "potencial": _c(r.get("potencial")),
                        "estado": "PROSPECTO",
                    })
                    n_xl += 1
                print(f"  prospectos Excel: {n_xl} de {PROSPECTOS_EXCEL}")
            except Exception as e:
                print(f"  prospectos Excel error: {str(e)[:80]}")
        else:
            print(f"  prospectos Excel: no encontrado en {PROSPECTOS_EXCEL} (solo BQ)")

        safe_insert(sb, "prospectos", filas, 400)
        print(f"  prospectos total: {len(filas)}")
    except Exception as e:
        print(f"  prospectos: {str(e)[:90]}")

    # ── RESUMEN ─────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"BAJADA COMPLETA {VERSION} para {fstr}")
    print(f"Zonas: {list(por_zona.keys())}")
    print("No se tocaron: notas_cliente, pedidos, checkins, auth.")
    print("=" * 60)

    # Checklist automático
    print()
    print("CHECKLIST POST-BAJADA:")
    for zona, eid in por_zona.items():
        if eid not in eids_activos: continue
        cart = sb.table("cartera").select("id", count="exact").eq("ejecutivo_id", eid).execute()
        meta = sb.table("metas").select("id", count="exact").eq("ejecutivo_id", eid).execute()
        foco = sb.table("focos").select("id", count="exact").eq("ejecutivo_id", eid).execute()
        pros = sb.table("prospectos").select("id", count="exact").eq("ejecutivo_id", eid).execute()
        geo = sb.table("cartera").select("id", count="exact").eq("ejecutivo_id", eid).not_.is_("lat", "null").execute()
        nc = cart.count if hasattr(cart, 'count') else '?'
        nm = meta.count if hasattr(meta, 'count') else '?'
        nf = foco.count if hasattr(foco, 'count') else '?'
        np = pros.count if hasattr(pros, 'count') else '?'
        ng = geo.count if hasattr(geo, 'count') else '?'
        print(f"  {zona}: cartera={nc} metas={nm} focos={nf} prospectos={np} con_geo={ng}")
    print()


correr()

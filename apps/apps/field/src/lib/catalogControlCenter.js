/**
 * V11.3.8 — Catalog Control Center
 *
 * Pure, side-effect-free business logic for:
 * CSV preview -> diff -> validation -> explicit apply plan -> audit.
 *
 * IMPORTANT:
 * This module NEVER writes to Supabase. The UI/server adapter must consume
 * the returned applyPlan only after explicit user confirmation.
 */

const FIELDS = [
  "sku_canon","producto_nombre","precio_unidad","precio_caja","precio_kilo",
  "imagen_url","ficha_url","resena","stock_operativo","marca"
];

const PRICE_FIELDS = ["precio_unidad","precio_caja","precio_kilo"];
const MEDIA_FIELDS = ["imagen_url","ficha_url","resena"];

export const CATALOG_CONTROL_VERSION = "v-BS-PLATFORM-V11.3.8";

export function normalizeSku(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const s = String(value).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeRow(row) {
  const out = {};
  for (const k of FIELDS) out[k] = row?.[k] ?? "";
  out.sku_canon = normalizeSku(out.sku_canon);
  for (const k of PRICE_FIELDS.concat(["stock_operativo"])) {
    const n = parseNumber(out[k]);
    out[k] = n === null ? null : n;
  }
  for (const k of MEDIA_FIELDS.concat(["producto_nombre","marca"])) {
    out[k] = String(out[k] ?? "").trim();
  }
  return out;
}

function equalValue(a, b) {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "";
  if (b === null || b === undefined || b === "") return false;
  return String(a) === String(b);
}

function validUrl(value) {
  if (value === null || value === undefined || String(value).trim() === "") return true;
  try {
    const u = new URL(String(value).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

export function validateCatalogRows(rows, existingSkus, { maxRows = 400 } = {}) {
  const errors = [];
  const normalized = (rows || []).map(normalizeRow);

  if (normalized.length > maxRows) {
    errors.push({ code:"MAX_ROWS", message:`El archivo contiene ${normalized.length} filas; máximo ${maxRows}.`, row:null });
  }

  const seen = new Map();
  normalized.forEach((r, i) => {
    const row = i + 2;
    if (!r.sku_canon) errors.push({code:"SKU_REQUIRED", message:"SKU vacío.", row});
    if (r.sku_canon) {
      if (seen.has(r.sku_canon)) errors.push({code:"DUPLICATE_SKU", message:`SKU duplicado; también aparece en fila ${seen.get(r.sku_canon)}.`, row});
      else seen.set(r.sku_canon, row);
    }
    for (const f of PRICE_FIELDS.concat(["stock_operativo"])) {
      if (Number.isNaN(r[f])) errors.push({code:"INVALID_NUMBER", message:`${f} no es un número válido.`, row});
    }
    for (const f of ["imagen_url","ficha_url"]) {
      if (!validUrl(r[f])) errors.push({code:"INVALID_URL", message:`${f} no es una URL http/https válida.`, row});
    }
  });

  const existing = new Set((existingSkus || []).map(normalizeSku));
  for (const [sku, row] of seen) {
    if (!existing.has(sku)) {
      errors.push({code:"SKU_NOT_FOUND", message:`SKU ${sku} no existe en stock.`, row});
    }
  }
  return { ok: errors.length === 0, errors, normalized };
}

export function diffCatalog(importRows, currentRows) {
  const current = new Map((currentRows || []).map(r => [normalizeSku(r.sku_canon), normalizeRow(r)]));
  const diffs = [];
  const counts = {
    SIN_CAMBIO:0, PRECIO_CAMBIO:0, STOCK_CAMBIO:0,
    MEDIA_NUEVA:0, MEDIA_MODIFICADA:0, MEDIA_ELIMINADA:0,
    DATO_NUEVO:0, ERROR:0
  };

  for (const raw of importRows || []) {
    const next = normalizeRow(raw);
    const prev = current.get(next.sku_canon);
    if (!prev) {
      counts.ERROR++;
      diffs.push({ sku:next.sku_canon, status:"ERROR", reason:"SKU_NOT_FOUND", before:null, after:next, changes:[] });
      continue;
    }

    const changes = [];
    for (const f of FIELDS.filter(x => x !== "sku_canon")) {
      if (!equalValue(prev[f], next[f])) changes.push({field:f, before:prev[f] ?? "", after:next[f] ?? ""});
    }

    if (!changes.length) {
      counts.SIN_CAMBIO++;
      diffs.push({sku:next.sku_canon, status:"SIN_CAMBIO", before:prev, after:next, changes:[]});
      continue;
    }

    const price = changes.some(x => PRICE_FIELDS.includes(x.field));
    const stock = changes.some(x => x.field === "stock_operativo");
    const mediaAdded = changes.some(x => MEDIA_FIELDS.includes(x.field) && !x.before && x.after);
    const mediaChanged = changes.some(x => MEDIA_FIELDS.includes(x.field) && x.before && x.after);
    const mediaDeleted = changes.some(x => MEDIA_FIELDS.includes(x.field) && x.before && !x.after);
    const other = changes.some(x => ["producto_nombre","marca"].includes(x.field));

    if (price) counts.PRECIO_CAMBIO++;
    if (stock) counts.STOCK_CAMBIO++;
    if (mediaAdded) counts.MEDIA_NUEVA++;
    if (mediaChanged) counts.MEDIA_MODIFICADA++;
    if (mediaDeleted) counts.MEDIA_ELIMINADA++;
    if (other) counts.DATO_NUEVO++;

    const status = price ? "PRECIO_CAMBIO" :
      stock ? "STOCK_CAMBIO" :
      mediaAdded ? "MEDIA_NUEVA" :
      mediaChanged ? "MEDIA_MODIFICADA" :
      mediaDeleted ? "MEDIA_ELIMINADA" : "DATO_NUEVO";

    diffs.push({sku:next.sku_canon, status, before:prev, after:next, changes});
  }

  return { diffs, counts };
}

export function buildApplyPlan(diffs, errors = []) {
  const blocked = errors.length > 0 || diffs.some(d => d.status === "ERROR");
  const changes = diffs.filter(d => d.status !== "SIN_CAMBIO" && d.status !== "ERROR");
  return {
    version: CATALOG_CONTROL_VERSION,
    blocked,
    canApply: !blocked && changes.length > 0,
    totalRows: diffs.length,
    changes,
    blockedErrors: errors.concat(
      diffs.filter(d => d.status === "ERROR").map(d => ({code:d.reason, message:d.reason, row:null, sku:d.sku}))
    )
  };
}

export function buildImportAudit({filename, userId, plan, startedAt = new Date().toISOString()}) {
  return {
    import_version: CATALOG_CONTROL_VERSION,
    filename: filename || null,
    user_id: userId || null,
    started_at: startedAt,
    total_rows: plan?.totalRows || 0,
    change_rows: plan?.changes?.length || 0,
    blocked: !!plan?.blocked,
    status: plan?.blocked ? "BLOCKED" : "READY_TO_APPLY"
  };
}

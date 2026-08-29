// Reescrito de vitest a node:test. El original usaba `vitest`, que NO
// es dependencia de este proyecto: el archivo se veía como cobertura y
// no corría nunca. Es el mismo patrón de "test que no puede fallar" que
// ya nos costó confianza falsa antes.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCatalogRows, diffCatalog, buildApplyPlan, buildImportAudit,
  CATALOG_CONTROL_VERSION
} from "./catalogControlCenter.js";

describe("V11.3.8 Catalog Control Center", () => {
  const current = [{
    sku_canon:"ABC1", producto_nombre:"BBQ 1L", precio_unidad:4990,
    precio_caja:0, precio_kilo:0, imagen_url:"", ficha_url:"",
    resena:"", stock_operativo:10, marca:"Hanks"
  }];

  test("blocks duplicate SKUs", () => {
    const r = validateCatalogRows([
      {sku_canon:"ABC1"}, {sku_canon:"ABC1"}
    ], ["ABC1"]);
    assert.deepEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.code === "DUPLICATE_SKU"), "falta el error DUPLICATE_SKU");
  });

  test("blocks unknown SKUs before apply", () => {
    const r = validateCatalogRows([{sku_canon:"NOPE"}], ["ABC1"]);
    assert.ok(r.errors.some(e => e.code === "SKU_NOT_FOUND"), "falta el error SKU_NOT_FOUND");
  });

  test("detects a price change without writing anything", () => {
    const d = diffCatalog([{...current[0], precio_unidad:"5290"}], current);
    assert.deepEqual(d.counts.PRECIO_CAMBIO, 1);
    assert.deepEqual(d.diffs[0].changes[0].before, 4990);
    assert.deepEqual(d.diffs[0].changes[0].after, 5290);
  });

  test("blocks the whole plan when there is an error", () => {
    const d = diffCatalog([{sku_canon:"NOPE"}], current);
    const p = buildApplyPlan(d.diffs);
    assert.deepEqual(p.blocked, true);
    assert.deepEqual(p.canApply, false);
  });

  test("creates an auditable ready-to-apply plan", () => {
    const d = diffCatalog([{...current[0], imagen_url:"https://example.com/a.jpg"}], current);
    const p = buildApplyPlan(d.diffs);
    const a = buildImportAudit({filename:"catalogo.csv", userId:"admin", plan:p});
    assert.deepEqual(a.import_version, CATALOG_CONTROL_VERSION);
    assert.deepEqual(a.status, "READY_TO_APPLY");
    assert.deepEqual(a.change_rows, 1);
  });
});

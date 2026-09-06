/**
 * EL CONTRATO ES LA BARRERA DE INGESTA.
 *
 * Hasta acá, un Excel con la columna mal escrita subía igual: el ciclo
 * la leía como NULL y el error aparecía tres pantallas después como
 * "cliente sin zona" o "producto sin precio", con la causa a diez capas
 * de distancia.
 *
 * Estos tests fijan que el archivo se rechaza EN EL BORDE, con el
 * motivo, y que el contrato no puede endurecerse sin querer.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validarEsquema, validarTipos, validarArchivo,
  normalizarEncabezado, resolverColumna, CONTRATO,
} from './validarContrato.js'

describe('los encabezados se reconocen aunque vengan distintos', () => {
  test('ignora tildes, espacios y mayúsculas', () => {
    // "Categoría " con tilde y espacio final es lo que trae el Excel real.
    assert.equal(normalizarEncabezado('Categoría '), 'CATEGORIA')
    assert.equal(normalizarEncabezado('COD CLIENTE'), 'CODCLIENTE')
    assert.equal(normalizarEncabezado('Precio Unidad'), 'PRECIOUNIDAD')
  })

  test('los alias funcionan en orden', () => {
    const def = { alias: ['CODIGO', 'SKU', 'COD'] }
    assert.equal(resolverColumna('sku', def, ['SKU', 'OTRA']), 'SKU')
    assert.equal(resolverColumna('sku', def, ['Codigo']), 'Codigo')
    assert.equal(resolverColumna('sku', def, ['NADA']), null)
  })
})

describe('esquema · lo obligatorio bloquea', () => {
  test('🔴 sin SKU la lista de precios se rechaza', () => {
    const r = validarEsquema('precios', ['Descripcion', 'Precio Unidad'])
    assert.equal(r.ok, false)
    assert.match(r.errores.join(' '), /sku/i)
  })

  test('el error dice CON QUÉ NOMBRES se acepta', () => {
    // Sin esto, el cliente no sabe cómo arreglarlo.
    const r = validarEsquema('precios', ['Descripcion'])
    assert.match(r.errores.join(' '), /Código|CODIGO|SKU/)
  })

  test('el archivo REAL de KeyFoods pasa', () => {
    const reales = [
      'Categoría ', 'Marca', 'Código', 'Descripcion', 'Unidad de Venta',
      'Unidades por Caja', 'Kilogramos por Unidad', 'Kilogramos por Caja',
      'Precio Kilo ', 'Precio Caja', 'Precio Unidad',
    ]
    const r = validarEsquema('precios', reales)
    assert.equal(r.ok, true, r.errores.join(' · '))
    assert.equal(r.mapeo.sku, 'Código')
    assert.equal(r.mapeo.nombre, 'Descripcion')
  })
})

describe('esquema · "uno de" para el precio', () => {
  test('con precio por unidad alcanza', () => {
    assert.equal(validarEsquema('precios', ['Código', 'Descripcion', 'Precio Unidad']).ok, true)
  })

  test('con precio por caja también', () => {
    assert.equal(validarEsquema('precios', ['Código', 'Descripcion', 'Precio Caja']).ok, true)
  })

  test('🔴 sin ninguno de los dos, no', () => {
    // Un producto sin precio no se puede vender: es el bug del catálogo
    // que mostraba productos en $0.
    const r = validarEsquema('precios', ['Código', 'Descripcion'])
    assert.equal(r.ok, false)
    assert.match(r.errores.join(' '), /precio_unidad o precio_caja/)
  })
})

describe('esquema · las opcionales avisan lo que se pierde', () => {
  test('sin comuna se dice que el cliente no sale en el mapa', () => {
    const r = validarEsquema('maestra', ['rut', 'EJECUTIVO', 'zona'])
    assert.equal(r.ok, true, 'las opcionales NO bloquean')
    assert.match(r.avisos.join(' '), /MAPA/i)
  })

  test('las columnas de más no son error', () => {
    // El cliente puede traer lo que quiera. Sólo se informan, por si
    // una es un nombre mal escrito de una obligatoria.
    const r = validarEsquema('stock', ['CODIGO', 'STOCK', 'COLUMNA_RARA'])
    assert.equal(r.ok, true)
    assert.ok(r.extra.includes('COLUMNA_RARA'))
  })
})

describe('tipos · el número tiene que ser número', () => {
  test('🔴 texto en una columna de precio se detecta', () => {
    const r = validarTipos('precios',
      [{ P: 'diez mil' }, { P: 'consultar' }, { P: 'a pedido' }],
      { precio_unidad: 'P' })
    assert.equal(r.ok, false)
    assert.match(r.errores.join(' '), /numero|número/)
  })

  test('el formato chileno 1.234,56 es válido', () => {
    const r = validarTipos('precios',
      [{ P: '10.250' }, { P: '1.234,56' }], { precio_unidad: 'P' })
    assert.equal(r.ok, true)
  })

  test('🔴 fechas futuras avisan del día/mes invertido', () => {
    // El error clásico de un Excel exportado con formato de otro país.
    const r = validarTipos('ventas', [{ F: '2099-01-01' }], { fecha: 'F' })
    assert.equal(r.ok, false)
    assert.match(r.errores.join(' '), /futuras/)
  })

  test('las celdas vacías no cuentan como error de tipo', () => {
    const r = validarTipos('precios',
      [{ P: '' }, { P: null }, { P: 100 }], { precio_unidad: 'P' })
    assert.equal(r.ok, true)
  })
})

describe('negocio · informa sin bloquear', () => {
  test('SKU vendido que no está en la lista se avisa', () => {
    const r = validarArchivo('ventas',
      ['COD CLIENTE', 'FECHA', 'CODIGO', 'NETO', 'CANTIDAD'],
      [{ 'COD CLIENTE': '1-9', FECHA: '2026-08-01', CODIGO: 'XXX', NETO: 100, CANTIDAD: 1 }],
      { skusConocidos: new Set(['AAA']) })
    // La venta OCURRIÓ: se carga igual.
    assert.equal(r.ok, true)
    assert.match(r.avisos.join(' '), /no están en la lista/)
  })

  test('sin columna de documento se advierte la duplicación', () => {
    const r = validarArchivo('ventas',
      ['COD CLIENTE', 'FECHA', 'CODIGO', 'NETO', 'CANTIDAD'],
      [{ 'COD CLIENTE': '1-9', FECHA: '2026-08-01', CODIGO: 'A', NETO: 1, CANTIDAD: 1 }])
    assert.match(r.avisos.join(' '), /duplican/)
  })

  test('zonas nuevas de la maestra se avisan antes del ciclo', () => {
    const r = validarArchivo('maestra',
      ['rut', 'EJECUTIVO', 'zona'],
      [{ rut: '1-9', EJECUTIVO: 'Ana', zona: 'ESTE' }],
      { zonasConocidas: new Set(['NORTE']) })
    assert.match(r.avisos.join(' '), /ESTE/)
  })
})

describe('el contrato no se endurece sin querer', () => {
  test('el mínimo para arrancar son 13 columnas', () => {
    // Si alguien agrega una obligatoria, este test lo frena: cada
    // obligatoria nueva rompe a TODOS los clientes existentes.
    assert.equal(CONTRATO.minimo_para_arrancar.total_columnas, 13)
  })

  test('los cuatro archivos están definidos', () => {
    assert.deepEqual(
      Object.keys(CONTRATO.archivos).sort(),
      ['maestra', 'precios', 'stock', 'ventas']
    )
  })

  test('cada archivo dice qué pasa si falta', () => {
    for (const [k, a] of Object.entries(CONTRATO.archivos)) {
      assert.ok(a.sin_esto, `${k} no dice qué se pierde sin él`)
      assert.ok(a.define, `${k} no dice qué define`)
    }
  })

  test('toda obligatoria tiene al menos un alias', () => {
    // Sin alias, el cliente tiene que llamar la columna exactamente
    // como nosotros — que es pedirle que se adapte al sistema.
    for (const [ka, a] of Object.entries(CONTRATO.archivos)) {
      for (const [kc, c] of Object.entries(a.campos)) {
        if (c.obligatorio) {
          assert.ok((c.alias || []).length > 0, `${ka}.${kc} sin alias`)
        }
      }
    }
  })
})

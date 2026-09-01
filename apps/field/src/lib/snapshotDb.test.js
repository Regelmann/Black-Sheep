/**
 * snapshotDb — persistencia durable del snapshot de cartera.
 *
 * Cubre lo mismo que outboxDb para la cola, pero para el snapshot:
 *   · migración de localStorage a IndexedDB al actualizar la app
 *   · que un snapshot guardado sobrevive a cerrar y reabrir
 *   · lectura síncrona (la API de Cartera no cambia)
 *
 * Corre sobre fake-indexeddb, el mismo motor que en el teléfono.
 */
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}

const snapshotDb = await import('./snapshotDb.js')
const {
  initSnapshotStorage, initSnapshotReady, loadSnapshot, saveSnapshot, estadoSnapshotStorage,
  escriturasSnapshotPendientes, cerrarSnapshotStorage, _resetSnapshotParaTests,
  SNAPSHOT_LEGACY_KEY,
} = snapshotDb

async function baseLimpia() {
  await new Promise(res => {
    const req = indexedDB.deleteDatabase('blacksheep-field-snapshots')
    req.onsuccess = req.onerror = req.onblocked = () => res()
  })
}

const snapshot = {
  tipo: 'cartera',
  clientes: [{ cliente_key: 'c1', nombre_cliente: 'Almacén' }],
  savedAt: '2026-09-01T10:00:00.000Z',
}

beforeEach(async () => {
  await baseLimpia()
  store.clear()
  await _resetSnapshotParaTests()
})

afterEach(async () => {
  await cerrarSnapshotStorage()
})

describe('migración desde localStorage', () => {
  test('lo que estaba en localStorage se copia a IndexedDB', async () => {
    store.set(SNAPSHOT_LEGACY_KEY, JSON.stringify(snapshot))
    const r = await initSnapshotStorage()
    assert.equal(r.durable, true)
    assert.equal(r.migrados, 1)
    assert.equal(estadoSnapshotStorage().motor, 'IndexedDB')
    assert.deepEqual(loadSnapshot(), snapshot)
  })
})

describe('durabilidad tras cerrar y reabrir', () => {
  test('un snapshot guardado no se pierde', async () => {
    saveSnapshot(snapshot)
    await escriturasSnapshotPendientes()
    assert.deepEqual(loadSnapshot(), snapshot)

    await _resetSnapshotParaTests()
    const r = await initSnapshotStorage()
    assert.equal(r.durable, true)
    assert.deepEqual(loadSnapshot(), snapshot)
  })
})

describe('lectura síncrona en el primer arranque', () => {
  test('si no se inicializó, lee el respaldo y dispara la migración', async () => {
    store.set(SNAPSHOT_LEGACY_KEY, JSON.stringify(snapshot))
    const antes = loadSnapshot()
    assert.deepEqual(antes, snapshot, 'la UI no puede quedar sin cartera por una promesa')
    await initSnapshotReady()
    await escriturasSnapshotPendientes()
    assert.equal(estadoSnapshotStorage().durable, true)
  })
})

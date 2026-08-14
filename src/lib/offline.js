/**
 * Offline de cartera del día (IndexedDB simple vía localStorage fallback).
 * Snapshot post-login / post-carga para seguir operando sin red.
 */

const KEY = 'kf_offline_v1'

function safeParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export function saveOfflineSnapshot(payload) {
  const data = {
    ...payload,
    savedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function loadOfflineSnapshot() {
  try {
    return safeParse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function isProbablyOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function offlineAgeMinutes(snap) {
  if (!snap?.savedAt) return null
  const t = new Date(snap.savedAt).getTime()
  if (isNaN(t)) return null
  return Math.round((Date.now() - t) / 60000)
}

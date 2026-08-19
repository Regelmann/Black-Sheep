/**
 * Google Places helpers (Nearby + Details + Autocomplete).
 * Requires VITE_GOOGLE_MAPS_API_KEY with Places API enabled.
 */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

let mapsPromise = null

export function loadGoogleMaps() {
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) return resolve(window.google.maps)
    if (!KEY) return reject(new Error('missing_maps_key'))
    const existing = document.querySelector('script[data-kf-maps]')
    const finish = () => {
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('maps_not_ready'))
    }
    if (existing) {
      if (window.google?.maps) return finish()
      existing.addEventListener('load', finish)
      existing.addEventListener('error', () => reject(new Error('maps_script_error')))
      return
    }
    const s = document.createElement('script')
    s.dataset.kfMaps = '1'
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places,geometry&language=es&region=CL`
    s.async = true
    s.defer = true
    s.onload = finish
    s.onerror = () => reject(new Error('maps_script_error'))
    document.head.appendChild(s)
  })
  return mapsPromise
}

export function hasPlacesKey() {
  return Boolean(KEY)
}

/** Nearby food/retail around GPS */
export function nearbyProspects(center, opts = {}) {
  const radius = opts.radiusM ?? 2000
  const keyword = opts.keyword || 'carnicería minimarket restaurant almacén supermercado'

  return loadGoogleMaps().then(maps => new Promise((resolve, reject) => {
    const el = document.createElement('div')
    const svc = new maps.places.PlacesService(el)
    svc.nearbySearch(
      {
        location: new maps.LatLng(center.lat, center.lng),
        radius,
        keyword,
      },
      (results, status) => {
        if (
          status !== maps.places.PlacesServiceStatus.OK &&
          status !== maps.places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          reject(new Error(String(status)))
          return
        }
        resolve((results || []).map(r => placeLite(r, center, maps)))
      }
    )
  }))
}

export function placeDetails(placeId) {
  return loadGoogleMaps().then(maps => new Promise((resolve, reject) => {
    const el = document.createElement('div')
    const svc = new maps.places.PlacesService(el)
    svc.getDetails(
      {
        placeId,
        fields: [
          'place_id', 'name', 'formatted_address', 'formatted_phone_number',
          'international_phone_number', 'geometry', 'opening_hours',
          'website', 'url', 'types', 'business_status', 'rating', 'user_ratings_total',
        ],
      },
      (place, status) => {
        if (status !== maps.places.PlacesServiceStatus.OK || !place) {
          reject(new Error(String(status)))
          return
        }
        resolve({
          place_id: place.place_id,
          nombre: place.name,
          direccion: place.formatted_address,
          telefono: place.formatted_phone_number || place.international_phone_number || null,
          lat: place.geometry?.location?.lat?.() ?? null,
          lng: place.geometry?.location?.lng?.() ?? null,
          types: place.types || [],
          rating: place.rating ?? null,
          ratings_n: place.user_ratings_total ?? null,
          abierto: place.opening_hours?.isOpen?.() ?? null,
          maps_url: place.url || null,
          website: place.website || null,
        })
      }
    )
  }))
}

export function autocompletePlaces(input, opts = {}) {
  if (!input || input.trim().length < 2) return Promise.resolve([])
  return loadGoogleMaps().then(maps => new Promise((resolve, reject) => {
    const svc = new maps.places.AutocompleteService()
    const req = {
      input: input.trim(),
      componentRestrictions: { country: 'cl' },
      types: opts.types || ['establishment'],
    }
    if (opts.lat != null && opts.lng != null) {
      req.location = new maps.LatLng(opts.lat, opts.lng)
      req.radius = opts.radiusM || 10000
    }
    svc.getPlacePredictions(req, (preds, status) => {
      if (
        status !== maps.places.PlacesServiceStatus.OK &&
        status !== maps.places.PlacesServiceStatus.ZERO_RESULTS
      ) {
        reject(new Error(String(status)))
        return
      }
      resolve(
        (preds || []).map(p => ({
          place_id: p.place_id,
          descripcion: p.description,
          main: p.structured_formatting?.main_text || p.description,
          secondary: p.structured_formatting?.secondary_text || '',
        }))
      )
    })
  }))
}

function placeLite(r, center) {
  const lat = r.geometry?.location?.lat?.() ?? null
  const lng = r.geometry?.location?.lng?.() ?? null
  let dist = null
  if (lat != null && center?.lat != null) {
    const R = 6371000
    const toRad = d => (d * Math.PI) / 180
    const dLat = toRad(lat - center.lat)
    const dLng = toRad(lng - center.lng)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(center.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
    dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return {
    place_id: r.place_id,
    cliente_key: r.place_id,
    nombre_cliente: r.name,
    nombre_local: r.name,
    direccion: r.vicinity || null,
    comuna: null,
    lat,
    lng,
    segmento: 'PROSPECTO_PLACES',
    oferta: (r.types || []).slice(0, 3).join(', '),
    score: r.rating != null ? r.rating * 20 : null,
    rating: r.rating ?? null,
    ratings_n: r.user_ratings_total ?? null,
    abierto: r.opening_hours?.open_now ?? null,
    distancia_m: dist,
    fuente: 'google_places',
  }
}

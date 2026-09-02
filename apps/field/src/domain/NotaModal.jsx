import { useState } from 'react'
import { guardarNotaTerreno } from '../lib/nota.js'
import { mensajeDeError } from '../lib/erroresUsuario.js'

const TIPOS = [
  { v: 'sin_stock',     l: 'Sin stock'   },
  { v: 'volver',        l: 'Volver'      },
  { v: 'no_interesado', l: 'No interesa' },
  { v: 'pidio',         l: 'Pidió'       },
  { v: 'otro',          l: 'Otro'        },
]

export default function NotaModal({ cliente, ejecutivoId, onClose }) {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo]   = useState('otro')
  const [busy, setBusy]   = useState(false)
  const [ok,   setOk]     = useState(false)
  const [err,  setErr]    = useState('')

  async function guardar() {
    if (!texto.trim()) return
    setBusy(true)
    setErr('')
    const r = await guardarNotaTerreno({
      ejecutivoId,
      cliente,
      tipo,
      texto: texto.trim(),
    })
    setBusy(false)
    if (r.ok) { setOk(true); setTimeout(onClose, 900) }
    else setErr(mensajeDeError(r.error) || 'No se pudo guardar')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:500,
        background:'rgba(28,25,23,0.55)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:'100%', maxWidth:480,
          background:'#fff', borderRadius:'20px 20px 0 0',
          padding:'18px 16px 32px',
          boxShadow:'0 -12px 40px rgba(0,0,0,0.22)',
          maxHeight:'85vh', overflowY:'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ width:40, height:4, background:'var(--line-3)', borderRadius:4, margin:'0 auto 14px' }} />
        <div style={{ fontSize:11, fontWeight:800, color:'var(--brand)', letterSpacing:'.06em' }}>NOTA</div>
        <h3 style={{ margin:'4px 0 12px', fontSize:17, fontWeight:800 }}>{cliente.nombre_cliente}</h3>

        {ok ? (
          <div className="chip chip-ok" style={{ fontSize:14, padding:'10px 16px' }}>✓ Guardada</div>
        ) : (
          <>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
              {TIPOS.map(t => (
                <button
                  key={t.v} type="button"
                  onClick={() => setTipo(t.v)}
                  style={{
                    padding:'8px 13px', borderRadius:999, fontSize:12, fontWeight:700,
                    border: tipo===t.v ? 'none' : '1.5px solid #e7e5e4',
                    background: tipo===t.v ? 'var(--ink)' : '#fff',
                    color: tipo===t.v ? '#fff' : 'var(--ink-2)',
                    cursor:'pointer', fontFamily:'inherit',
                  }}
                >{t.l}</button>
              ))}
            </div>
            <textarea
              placeholder="Escribe tu nota…"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              style={{
                width:'100%', padding:12, borderRadius:12,
                border:'1.5px solid #e7e5e4', fontFamily:'inherit',
                fontSize:14, resize:'none', outline:'none',
              }}
            />
            {err && (
              <div style={{ color:'var(--danger-dk)', fontWeight:600, fontSize:13, marginTop:8 }}>{err}</div>
            )}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button className="btn btn-ghost btn-block" onClick={onClose}>Cancelar</button>
              <button
                className="btn btn-primary btn-block"
                onClick={guardar}
                disabled={busy || !texto.trim()}
              >{busy ? '…' : 'Guardar'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

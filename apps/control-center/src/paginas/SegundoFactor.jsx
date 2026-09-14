import { useEffect, useState } from 'react'
import { supabase } from '../../../../packages/datos/supabase.js'

/**
 * Verificación en dos pasos para superadmin.
 *
 * Sin esto, 035_mfa_superadmin.sql deja a cualquier superadmin sin acceso:
 * `platform.es_superadmin()` exige sesión en aal2, y sin esta pantalla el
 * login nunca llega ahí. Dos modos según si ya existe un factor:
 *
 *  - inscribir: no hay factor TOTP todavía → se muestra el QR y se pide
 *    el primer código para activarlo.
 *  - verificar: ya existe un factor verificado → sólo se pide el código
 *    de esta sesión.
 *
 * challenge() + verify() es el mismo paso en los dos modos: confirma el
 * código Y sube la sesión a aal2 al mismo tiempo.
 */
export default function SegundoFactor({ factores, onListo }) {
  const factorExistente = factores?.[0] || null
  const [modo] = useState(factorExistente ? 'verificar' : 'inscribir')
  const [inscripcion, setInscripcion] = useState(null) // { id, qr, secreto }
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [preparando, setPreparando] = useState(modo === 'inscribir')

  useEffect(() => {
    if (modo !== 'inscribir') return
    supabase.auth.mfa.enroll({ factorType: 'totp' }).then(({ data, error }) => {
      if (error) {
        setError('No se pudo generar el código QR. Recarga la página e intenta de nuevo.')
        setPreparando(false)
        return
      }
      setInscripcion({ id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret })
      setPreparando(false)
    })
  }, [modo])

  async function confirmar() {
    setEnviando(true)
    setError(null)
    const factorId = modo === 'inscribir' ? inscripcion.id : factorExistente.id

    const { data: desafio, error: errorDesafio } = await supabase.auth.mfa.challenge({ factorId })
    if (errorDesafio) {
      setError('No se pudo iniciar la verificación. Intenta de nuevo.')
      setEnviando(false)
      return
    }

    const { error: errorVerificar } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: desafio.id,
      code: codigo,
    })
    if (errorVerificar) {
      setError('Código incorrecto o vencido. Genera uno nuevo en tu app y vuelve a intentar.')
      setCodigo('')
      setEnviando(false)
      return
    }

    setEnviando(false)
    onListo()
  }

  if (preparando) return <p className="estado">Preparando verificación…</p>

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--e4)' }}>
      <div className="panel" style={{ width: 'min(400px, 100%)' }}>
        <h1 style={{ marginBottom: 'var(--e1)' }}>Verificación en dos pasos</h1>

        {modo === 'inscribir' ? (
          <>
            <p className="silencio" style={{ marginBottom: 'var(--e3)' }}>
              Tu cuenta administra toda la plataforma — antes de entrar hay que
              inscribir un segundo factor. Escanea este código con Google
              Authenticator, Authy o una app equivalente.
            </p>
            {inscripcion?.qr ? (
              <img
                src={inscripcion.qr}
                alt="Código QR de verificación"
                width="200"
                height="200"
                style={{ display: 'block', margin: '0 auto var(--e3)' }}
              />
            ) : null}
            <p className="silencio" style={{ marginBottom: 'var(--e3)', wordBreak: 'break-all' }}>
              ¿No puedes escanear? Ingresa esta clave a mano en tu app: <code>{inscripcion?.secreto}</code>
            </p>
          </>
        ) : (
          <p className="silencio" style={{ marginBottom: 'var(--e3)' }}>
            Ingresa el código de 6 dígitos de tu app de verificación.
          </p>
        )}

        <div className="campo">
          <label htmlFor="codigo">Código</label>
          <input
            id="codigo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && confirmar()}
          />
        </div>

        {error ? (
          <div className="estado error" role="alert" style={{ marginBottom: 'var(--e3)' }}>
            {error}
          </div>
        ) : null}

        <button
          className="boton primario"
          style={{ width: '100%' }}
          onClick={confirmar}
          disabled={enviando || codigo.length !== 6}
        >
          {enviando ? 'Verificando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}

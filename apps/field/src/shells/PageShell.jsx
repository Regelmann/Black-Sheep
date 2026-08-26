/**
 * PageShell — LA estructura de página. Una sola, para todas las pestañas.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Cada pantalla armaba su propio layout: su padding, su hero, sus chips,
 * su scroll. Resultado: Hoy no se parecía a Clientes, Clientes no se
 * parecía a Stock, y Gerencia no se parecía a nada.
 *
 * Es el síntoma exacto que describe el patrón App Shell: "las pantallas
 * se comportan como vistas aisladas". Sin shell compartido, cada una
 * duplica la estructura y la inconsistencia es inevitable.
 *
 * REGLA
 * Ninguna página define su propio padding, hero ni contenedor de scroll.
 * Todo pasa por acá. Si algo tiene que cambiar en las cinco pestañas,
 * se cambia en este archivo.
 *
 * ANATOMÍA — siempre en este orden, siempre igual:
 *
 *   ┌─────────────────────────────┐
 *   │ HERO      título · subtítulo│  contexto, no acción
 *   ├─────────────────────────────┤
 *   │ STATS     contadores        │  opcional
 *   ├─────────────────────────────┤
 *   │ BUSCAR                      │  opcional
 *   │ FILTROS                     │  opcional · sticky al scrollear
 *   ├─────────────────────────────┤
 *   │ CONTENIDO                   │  scroll
 *   ├─────────────────────────────┤
 *   │ CTA fija                    │  opcional · zona del pulgar
 *   └─────────────────────────────┘
 */
import { DataError, DataSkeleton, DataEmpty } from '../ui/DataState.jsx'

/**
 * @param {{
 *   eyebrow?: string,
 *   titulo: string,
 *   subtitulo?: React.ReactNode,
 *   sello?: string,
 *   stats?: React.ReactNode,
 *   buscador?: React.ReactNode,
 *   filtros?: React.ReactNode,
 *   loading?: boolean,
 *   error?: object|null,
 *   onRetry?: () => void,
 *   vacio?: boolean,
 *   vacioTitulo?: string,
 *   vacioDesc?: string,
 *   cta?: { label: string, onClick: () => void, disabled?: boolean },
 *   children: React.ReactNode
 * }} props
 */
export function PageShell({
  eyebrow,
  titulo,
  subtitulo,
  sello,
  stats,
  buscador,
  filtros,
  loading = false,
  error = null,
  onRetry,
  vacio = false,
  vacioTitulo = 'Sin resultados',
  vacioDesc,
  cta,
  children,
}) {
  return (
    <div className={'bs-shell' + (cta ? ' has-cta' : '')}>

      {/* 1 · HERO — contexto. Nunca acciones: es el tercio superior. */}
      <header className="bs-shell-hero">
        {eyebrow && <p className="bs-shell-eyebrow">{eyebrow}</p>}
        <h1 className="bs-shell-title">{titulo}</h1>
        {subtitulo && <p className="bs-shell-sub">{subtitulo}</p>}
        {sello && <p className="bs-shell-stamp">{sello}</p>}
      </header>

      {/* 2 · STATS */}
      {stats && <div className="bs-shell-stats">{stats}</div>}

      {/* 3 · CONTROLES — se pegan arriba al scrollear para que el
             vendedor no tenga que volver a subir a filtrar. */}
      {(buscador || filtros) && (
        <div className="bs-shell-controls">
          {buscador}
          {filtros}
        </div>
      )}

      {/* 4 · CONTENIDO — un solo lugar decide carga / error / vacío.
             Antes cada página lo resolvía distinto y algunas mostraban
             "0 resultados" cuando en realidad la consulta había fallado. */}
      <main className="bs-shell-body">
        {loading ? (
          <DataSkeleton rows={4} />
        ) : error ? (
          <DataError error={error} onRetry={onRetry} />
        ) : vacio ? (
          <DataEmpty title={vacioTitulo} desc={vacioDesc} />
        ) : (
          children
        )}
      </main>

      {/* 5 · CTA — zona del pulgar, sobre la barra de navegación. */}
      {cta && (
        <div className="bs-shell-cta-wrap">
          <button
            type="button"
            className="bs-shell-cta"
            onClick={cta.onClick}
            disabled={cta.disabled}
          >
            {cta.label}
          </button>
        </div>
      )}
    </div>
  )
}

export default PageShell

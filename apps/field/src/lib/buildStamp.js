/**
 * Sello de build — fuente ÚNICA.
 *
 * Visible en la UI: si no lo ves en el teléfono, el deploy NO subió.
 *
 * Vive en su propio módulo (y no en App.jsx) porque lo consumen componentes
 * que App.jsx importa —ErrorBoundary entre ellos—. Importarlo desde App.jsx
 * crearía un ciclo App → ErrorBoundary → App.
 */
export const BUILD_STAMP = 'v-BS-PLATFORM-V12.7'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * ESLint — la red que faltaba.
 *
 * El proyecto tenía guard.js (11 reglas nacidas de bugs reales) y 76 tests,
 * pero NO tenía análisis estático. Eso deja pasar toda una clase de errores:
 * variables no declaradas, dependencias de hooks incompletas, código muerto.
 *
 * `guard.js` es defensa RETROSPECTIVA: sólo detecta bugs que ya ocurrieron.
 * ESLint es preventivo: detecta los que todavía no ocurrieron.
 *
 * Los dos se necesitan. Ninguno reemplaza al otro.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', '*.config.js'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, process: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      /* --- BLOQUEANTES ------------------------------------------------
         Errores que rompen en runtime y que ni el build ni los tests ven. */
      'no-undef': 'error',              // variable no declarada
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-obj-calls': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-self-compare': 'error',       // ya nos pasó en Cartera.jsx
      'react-hooks/rules-of-hooks': 'error',

      /* --- AVISOS ------------------------------------------------------
         Deuda conocida. Pasan a 'error' cuando lleguen a cero, igual que
         las reglas del guard. Un aviso permanente es ruido. */
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: false }],   // los catch {} mudos
    },
  },
]

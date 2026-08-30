/**
 * Hook + re-export del cálculo puro de meta.
 * Preferir importar calcGoal desde lib en tests.
 */
import { calcGoal } from '../lib/calculations/goal.js'

export { calcGoal }

/** Wrapper estable para componentes (misma función pura). */
export function useGoalCalculation(opts) {
  return calcGoal(opts)
}

export default useGoalCalculation

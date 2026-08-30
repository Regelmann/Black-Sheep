import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcGoal } from '../lib/calculations/goal.js'

describe('calcGoal', () => {
  it('SUPERADO at >= 100%', () => {
    const g = calcGoal({ sold: 100, target: 100 })
    assert.equal(g.status, 'SUPERADO')
    assert.equal(g.percentage, 100)
    assert.equal(g.remaining, 0)
  })

  it('EN_RITMO when above business-day pace', () => {
    // day 10 of 20 business days → expected 50%; sold 60% → EN_RITMO
    const g = calcGoal({
      sold: 60,
      target: 100,
      businessDaysElapsed: 10,
      businessDaysInMonth: 20,
    })
    assert.equal(g.status, 'EN_RITMO')
    assert.equal(g.expectedPct, 50)
  })

  it('ATRASADO when below business-day pace', () => {
    const g = calcGoal({
      sold: 20,
      target: 100,
      businessDaysElapsed: 10,
      businessDaysInMonth: 20,
    })
    assert.equal(g.status, 'ATRASADO')
  })

  it('fallback paceThreshold without calendar', () => {
    const g = calcGoal({ sold: 80, target: 100, paceThreshold: 70 })
    assert.equal(g.status, 'EN_RITMO')
    const low = calcGoal({ sold: 50, target: 100, paceThreshold: 70 })
    assert.equal(low.status, 'ATRASADO')
  })

  it('handles zero target', () => {
    const g = calcGoal({ sold: 10, target: 0 })
    assert.equal(g.percentage, 0)
    assert.equal(g.remaining, 0)
  })
})

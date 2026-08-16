import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'

describe('dsh-code-reuse-firewall config', () => {
  it('requires auditRoot (the Auto_code_audit checkout)', () => {
    expect(() => Config({})).toThrow()
    expect(() => Config({ auditRoot: '' })).toThrow()
  })

  it('applies defaults when only auditRoot is given', () => {
    const cfg = Config({ auditRoot: '/path/to/Auto_code_audit' })
    expect(cfg.pythonPath).toBe('python')
    expect(cfg.maxK).toBe(5)
    expect(cfg.minScore).toBe(0.1)
    expect(cfg.timeoutMs).toBe(30_000)
  })

  it('accepts explicit bounds', () => {
    const cfg = Config({ auditRoot: '/x', pythonPath: 'python3', maxK: 10, minScore: 0.2, timeoutMs: 5_000 })
    expect(cfg.pythonPath).toBe('python3')
    expect(cfg.maxK).toBe(10)
    expect(cfg.minScore).toBe(0.2)
    expect(cfg.timeoutMs).toBe(5_000)
  })

  it('rejects out-of-range values', () => {
    expect(() => Config({ auditRoot: '/x', maxK: 0 })).toThrow()
    expect(() => Config({ auditRoot: '/x', maxK: 51 })).toThrow()
    expect(() => Config({ auditRoot: '/x', minScore: 1.5 })).toThrow()
    expect(() => Config({ auditRoot: '/x', timeoutMs: 500 })).toThrow()
  })
})

/**
 * Integration test: the plugin's retrieval path against the REAL
 * Auto_code_audit checkout — spawn Python → capability_retrieval.py --describe
 * → parse JSON → candidates. This is the path CI must actually cover ("CI
 * green ≠ plugin works" without it).
 *
 * Skipped unless AUDIT_ROOT (an Auto_code_audit checkout) and PYTHON_BIN are
 * provided; the CI workflow sets both (clone + setup-python).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runRetrieval, type Config } from '../src/index.ts'

const AUDIT_ROOT = process.env.AUDIT_ROOT
const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python'

/** Tiny fixture repo: one function whose docstring/name matches a describe query. */
function makeFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reuse-firewall-fixture-'))
  writeFileSync(join(dir, 'existing.py'), [
    'def load_config(path, env_override=True):',
    '    """Load a JSON config with environment-variable overrides."""',
    '    import json, os',
    '    data = json.load(open(path))',
    '    if env_override:',
    '        data.update(os.environ)',
    '    return data',
    '',
  ].join('\n'))
  return dir
}

describe.skipIf(AUDIT_ROOT === undefined || AUDIT_ROOT.length === 0)(
  'reuse_check integration (real Auto_code_audit)',
  () => {
    const config: Config = {
      auditRoot: AUDIT_ROOT!,
      pythonPath: PYTHON_BIN,
      maxK: 5,
      minScore: 0.1,
      timeoutMs: 30_000,
    }
    let fixture: string | undefined

    beforeEach(() => { fixture = makeFixtureRepo() })
    afterEach(() => { if (fixture !== undefined) rmSync(fixture, { recursive: true, force: true }) })

    it('spawns the retrieval channel and finds the fixture implementation', async () => {
      const outcome = await runRetrieval(config, fixture!, 'load a json config with environment variable overrides')
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      const hit = outcome.results.find((c) => c.path.endsWith('existing.py') && c.name === 'load_config')
      expect(hit).toBeDefined()
      expect(hit!.existing_symbol).toContain('existing.py:load_config')
      expect(hit!.score).toBeGreaterThan(0)
    })

    it('returns no candidates for an unrelated description', async () => {
      const outcome = await runRetrieval(config, fixture!, 'compute a sha256 checksum of a binary blob')
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      expect(outcome.results.find((c) => c.path.endsWith('existing.py'))).toBeUndefined()
    })

    it('surfaces a spawn error instead of hanging or throwing', async () => {
      const bad = { ...config, pythonPath: 'definitely-not-a-python-interpreter' }
      const outcome = await runRetrieval(bad, fixture!, 'load a json config')
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error).toMatch(/spawn failed/)
    })
  },
)

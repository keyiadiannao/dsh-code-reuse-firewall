/**
 * dsh-code-reuse-firewall — host half.
 *
 * Pre-write reuse firewall for DeepSeek Harness: BEFORE the agent writes a new
 * helper / service / manager, it calls `reuse_check(description, root)` and
 * the plugin shells out to the Auto_code_audit capability-retrieval channel
 * (`capability_retrieval.py --describe ...`), which deterministically surfaces
 * the existing implementations that already cover that intent (callable-name,
 * docstring-lexical, and string-literal channels with IDF-weighted query
 * coverage — stdlib-only, zero LLM).
 *
 * The result is ADVISORY EVIDENCE, not a verdict: the agent must decide to
 * reuse, extract a shared component, or write new code, and may not silently
 * delete or rewrite anything based on retrieval alone. This mirrors the
 * Auto_code_audit ground rule ("deterministic scanner output is evidence, not
 * a defect verdict").
 *
 * @module dsh-code-reuse-firewall
 */

import z from '@deepseek-ai/schemastery'
import { spawn } from 'node:child_process'

export const name = 'dsh-code-reuse-firewall'

export const inject = ['tools']

/** Plugin configuration. */
export interface Config {
  /** Checkout of keyiadiannao/Auto_code_audit (capability_retrieval.py lives here). */
  auditRoot: string
  /** Python interpreter used to run the retrieval script. */
  pythonPath: string
  /** Top-K candidates returned per query. */
  maxK: number
  /** Score floor; candidates below it are dropped. */
  minScore: number
  /** Child-process timeout (ms) — retrieval must never hang a turn. */
  timeoutMs: number
}

/** Schemastery schema; cordis validates and provides it as apply(ctx, config). */
export const Config: z<Config> = z.object({
  auditRoot: z.string().required().min(1),
  pythonPath: z.string().default('python'),
  maxK: z.number().min(1).max(50).default(5),
  minScore: z.number().min(0).max(1).default(0.3),
  timeoutMs: z.number().min(1000).max(120_000).default(30_000),
})

/** One retrieval candidate (shape of capability_retrieval.py --json - results[]). */
export interface Candidate {
  existing_symbol: string
  name: string
  qualname: string
  path: string
  score: number
  /** Per-channel evidence — WHY this candidate matched (name / docstring-lexical / string-literal). */
  channels?: { name?: number; lexical?: number; string?: number }
  doc_first?: string
  /**
   * True when the candidate lives in a file hash-locked by frozen-JSON
   * provenance manifests (Auto_code_audit `discover_locked_files`). Editing
   * such a file invalidates the frozen results that pin it — the correct
   * reuse is to IMPORT it, never to copy-and-modify its implementation.
   */
  locked?: boolean
  /** The frozen-JSON manifests that pin the candidate's file. */
  locked_by?: string[]
}

/** The retrieval JSON schema version we know how to parse. */
const SCHEMA_VERSION = 1

export type RetrievalOutcome =
  | { ok: true; results: Candidate[] }
  | { ok: false; error: string }

/** Run the deterministic retrieval channel in a child process. */
export function runRetrieval(config: Config, root: string, description: string): Promise<RetrievalOutcome> {
  return new Promise((resolve) => {
    const args = [
      'capability_retrieval.py',
      '--root', root,
      '--describe', description,
      '--k', String(config.maxK),
      '--min-score', String(config.minScore),
      '--json', '-',
    ]
    const child = spawn(config.pythonPath, args, {
      cwd: config.auditRoot,
      timeout: config.timeoutMs,
      windowsHide: true,
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('error', (e: Error) => resolve({ ok: false, error: `spawn failed: ${e.message}` }))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: `retrieval exited ${code}: ${err.trim().slice(0, 500) || 'no stderr'}` })
        return
      }
      try {
        const parsed = JSON.parse(out) as { schema_version?: number; results?: Candidate[] }
        if (parsed.schema_version !== SCHEMA_VERSION) {
          resolve({ ok: false, error: `unsupported retrieval schema_version ${String(parsed.schema_version)} (expected ${SCHEMA_VERSION}) — Auto_code_audit and this plugin are out of contract` })
          return
        }
        resolve({ ok: true, results: Array.isArray(parsed.results) ? parsed.results : [] })
      } catch (e) {
        resolve({ ok: false, error: `invalid JSON from retrieval: ${e instanceof Error ? e.message : String(e)}` })
      }
    })
  })
}

export function apply(ctx: any, config: Config): void {
  ctx.tools.register({
    name: 'reuse_check',
    description: 'Pre-write reuse firewall (Python repositories): BEFORE writing a new helper/service/manager, '
      + 'describe what you are about to implement and the existing codebase root — the plugin deterministically '
      + 'surfaces the existing Python implementations that already cover that intent (no LLM involved). '
      + 'Describe in ENGLISH keywords that a function name/docstring would use (e.g. "load json config settings '
      + 'environment env override" — Chinese-only descriptions match poorly against English code). Decide whether '
      + 'to REUSE, extract a shared component, or write new code. The result is advisory evidence, not a verdict: '
      + 'never delete or rewrite code based on retrieval alone. Call this before writing any new function when a '
      + 'similar capability may already exist.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural-language description of the capability you are about to implement (e.g. "load a JSON config with environment-variable overrides").',
        },
        root: {
          type: 'string',
          description: 'Absolute path of the repository root to index (the existing codebase to search for overlapping implementations).',
        },
      },
      required: ['description', 'root'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          root: { type: 'string' },
          description: { type: 'string' },
          candidates: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                existing_symbol: { type: 'string' },
                name: { type: 'string' },
                qualname: { type: 'string' },
                path: { type: 'string' },
                score: { type: 'number' },
                doc_first: { type: 'string' },
                locked: { type: 'boolean' },
                locked_by: { type: 'array', items: { type: 'string' } },
              },
              required: ['existing_symbol', 'name', 'qualname', 'path', 'score'],
            },
          },
          error: { type: 'string' },
        },
        required: ['ok', 'root', 'description', 'candidates'],
      },
      render: (_args: unknown, value: { ok: boolean; root: string; description: string; candidates: { existing_symbol: string; path: string; score: number; locked?: boolean; locked_by?: string[]; channels?: { name?: number; lexical?: number; string?: number } }[]; error?: string }) => {
        if (!value.ok) return [{ type: 'text', text: `reuse_check failed: ${value.error ?? 'unknown error'}` }]
        if (value.candidates.length === 0) {
          return [{ type: 'text', text: `No existing implementation covers "${value.description}" (root=${value.root}).` }]
        }
        const lines = value.candidates.map((c) => {
          const ch = c.channels
          const why = ch === undefined
            ? ''
            : ` (name=${(ch.name ?? 0).toFixed(2)} doc=${(ch.lexical ?? 0).toFixed(2)} literal=${(ch.string ?? 0).toFixed(2)})`
          const lock = c.locked
            ? ` 🔒 LOCKED${c.locked_by?.length ? ` by ${c.locked_by.join(', ')}` : ''}`
            : ''
          return `  [${c.score.toFixed(3)}] ${c.existing_symbol}  (${c.path})${why}${lock}`
        })
        const lockedCount = value.candidates.filter((c) => c.locked).length
        const note = lockedCount > 0
          ? `\n\n⚠ ${lockedCount} candidate(s) are in hash-locked files: REUSE by import, do not copy-and-modify their implementation (editing invalidates frozen results).`
          : ''
        return [{ type: 'text', text: `Existing implementations overlapping "${value.description}":\n${lines.join('\n')}${note}` }]
      },
    },
    async execute(args: { description: string; root: string }) {
      const description = typeof args.description === 'string' ? args.description.trim() : ''
      const root = typeof args.root === 'string' ? args.root.trim() : ''
      if (description.length === 0 || root.length === 0) {
        return { ok: false, root, description, candidates: [], error: 'description and root are required' }
      }
      const outcome = await runRetrieval(config, root, description)
      if (!outcome.ok) {
        return { ok: false, root, description, candidates: [], error: outcome.error }
      }
      const candidates = outcome.results.map((r) => ({
        existing_symbol: r.existing_symbol,
        name: r.name,
        qualname: r.qualname,
        path: r.path,
        score: r.score,
        ...(r.channels === undefined ? {} : { channels: r.channels }),
        ...(r.doc_first === undefined ? {} : { doc_first: r.doc_first }),
        ...(r.locked === undefined ? {} : { locked: r.locked }),
        ...(r.locked_by === undefined ? {} : { locked_by: r.locked_by }),
      }))
      return { ok: true, root, description, candidates }
    },
  }, 'dsh-code-reuse-firewall: reuse_check tool')
}

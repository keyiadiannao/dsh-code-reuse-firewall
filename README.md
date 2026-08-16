# dsh-code-reuse-firewall

**Pre-write reuse firewall for DeepSeek Harness — for PYTHON repositories.**
Before the agent writes a new helper / service / manager, `reuse_check`
deterministically surfaces the existing Python implementations that already
cover that intent, so the agent reuses or extracts instead of duplicating.

## Why

Static checkers only catch what *looks* wrong. The expensive failure mode in
AI-maintained codebases is the opposite: two implementations of the same
capability drift apart silently, because nothing looked broken when the second
copy was written. The fix is to intervene **before** the second copy exists —
surface the overlap while the new code is still a plan, not a file.

The retrieval is **deterministic and LLM-free** (callable-name, docstring
lexical, and string-literal channels with IDF-weighted query coverage, stdlib
Python only), backed by the
[Auto_code_audit](https://github.com/keyiadiannao/Auto_code_audit) capability
channel. It was validated on an unfamiliar mid-size project (arrow-py): a 1s
scan surfaced nine near-identical locale `_format_timeframe` methods, four
`describe` twins, and `api.get` vs `ArrowFactory.get` near-duplicates with zero
noise in the dead-code / hardcoded / style categories.

## Requirements

- A checkout of [Auto_code_audit](https://github.com/keyiadiannao/Auto_code_audit)
  (its `capability_retrieval.py` is the retrieval engine).
- A Python 3.10+ interpreter (default `python`).

## Install

```bash
dsh plugin add github:keyiadiannao/dsh-code-reuse-firewall#master
```

Then configure the audit checkout and interpreter in your profile:

```yaml
- id: dsh-code-reuse-firewall
  config:
    auditRoot: 'D:/path/to/Auto_code_audit'   # required
    pythonPath: 'python'                       # default
    maxK: 5                                    # top-K candidates
    minScore: 0.1                              # score floor
    timeoutMs: 30000                           # child-process cap
```

## Usage

The agent calls `reuse_check` **before writing new code**:

> 调用 reuse_check：我要实现「从 JSON 配置读取并支持环境变量覆盖」，根目录是
> D:/project/src。看看有没有现成的实现可以复用。
>
> (call reuse_check: I'm about to implement "load a JSON config with
> environment-variable overrides", root D:/project/src. Is there an existing
> implementation to reuse?)

The tool returns top candidates with paths, scores, and per-channel evidence:

```
Existing implementations overlapping "load a JSON config with env overrides":
  [0.72] config.py:load_config  (src/config.py) (name=0.72 doc=0.10 literal=0.00)
  [0.51] util.py:ConfigLoader.load  (src/util.py) (name=0.51 doc=0.00 literal=0.00)
```

**Hash-locked candidates are flagged.** When an existing implementation lives
in a file pinned by a frozen-JSON provenance manifest (e.g.
`current_dependency_files` / `files_sha256` in `frozen_results/` or `configs/`),
the tool marks it 🔒 LOCKED with the locking manifests. Editing such a file
invalidates the frozen results that reference it — the correct reuse is to
**import** it, never to copy-and-modify its implementation. Derived run-output
trees (`outputs/`, `reports/`, `logs/`, `runs/`, `cache/`) are treated as
snapshots, not edit constraints, so scripts that merely appear in run metadata
are not falsely flagged.

```
  [0.32] lib/protocol.py:_split_hash_payload  (lib/protocol.py) (name=0.32) 🔒 LOCKED by configs/generation_b_training_compatibility.json

⚠ 1 candidate(s) are in hash-locked files: REUSE by import, do not copy-and-modify their implementation (editing invalidates frozen results).
```

**Advisory evidence, not a verdict.** The agent decides whether to reuse,
extract a shared component, or write new code — and must never delete or
rewrite anything based on retrieval alone (the same ground rule as
Auto_code_audit: deterministic output is evidence, not a defect verdict).

### Signal-strength caveat (honest limits)

A natural-language `--describe` query has NO code yet, so the retrieval engine's
strongest signals — normalized AST structure, call-name overlap, string-literal
overlap — cannot fire. The pre-write channel relies on the weaker
name/docstring-lexical/string-literal channels. In practice:

- A well-named existing function whose docstring matches your description WILL
  be surfaced (verified: `load_config` for "load a JSON config with env
  overrides").
- **Describe in English keywords** a function name/docstring would use
  (`load json config settings environment env override`). Chinese-only
  descriptions match poorly against English code — the engine tokenizes CJK
  into bigrams with no Chinese↔English mapping.
- Structurally-similar-but-differently-named code (the strongest reuse signal)
  is only found AFTER code exists, via the engine's `--file` / `--base` modes —
  which are not yet exposed through this plugin.
- Each candidate carries per-channel evidence (name / docstring / string-literal
  scores) in the tool result, so the agent can judge WHY something matched
  instead of trusting one blended score.

So treat `reuse_check` as a **low-signal pre-write hint**, not a full reuse
audit. The high-signal modes are roadmap items below.

## Configuration

| Key | Default | Description |
|---|---|---|
| `auditRoot` | — (required) | Auto_code_audit checkout containing `capability_retrieval.py` |
| `pythonPath` | `python` | Python interpreter for the retrieval script |
| `maxK` | 5 | Top-K candidates per query |
| `minScore` | 0.3 | Score floor (aligned with the engine's default; measured hits sit at 0.33+, lower scores are mostly noise) |
| `timeoutMs` | 30000 | Child-process timeout — retrieval never hangs a turn |

The plugin parses the retrieval JSON with a `schema_version === 1` contract
check: if Auto_code_audit ever changes its output schema, `reuse_check` fails
loudly with "out of contract" instead of silently mis-parsing.

## Development

```sh
pnpm run build        # tsdown: host + client bundle
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest
```

## Roadmap

- `tools/pre-execute` guard: run a reuse check automatically before write-tool
  calls when a `reuse_check` was not already performed (dsh-tool-git style).
- `--file` / `--base` modes (check a new/changed file or diff against a git ref)
  exposed through the tool.

## License

MIT

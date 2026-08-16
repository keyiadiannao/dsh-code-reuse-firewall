# dsh-code-reuse-firewall

**Pre-write reuse firewall for DeepSeek Harness** — before the agent writes a
new helper / service / manager, `reuse_check` deterministically surfaces the
existing implementations that already cover that intent, so the agent reuses
or extracts instead of duplicating.

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

The tool returns top candidates with paths and scores:

```
Existing implementations overlapping "load a JSON config with env overrides":
  [0.72] config.py:load_config  (src/config.py)
  [0.51] util.py:ConfigLoader.load  (src/util.py)
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
- Structurally-similar-but-differently-named code (the strongest reuse signal)
  is only found AFTER code exists, via the engine's `--file` / `--base` modes —
  which are not yet exposed through this plugin.

So treat `reuse_check` as a **low-signal pre-write hint**, not a full reuse
audit. The high-signal modes are roadmap items below.

## Configuration

| Key | Default | Description |
|---|---|---|
| `auditRoot` | — (required) | Auto_code_audit checkout containing `capability_retrieval.py` |
| `pythonPath` | `python` | Python interpreter for the retrieval script |
| `maxK` | 5 | Top-K candidates per query |
| `minScore` | 0.1 | Score floor; below it candidates are dropped |
| `timeoutMs` | 30000 | Child-process timeout — retrieval never hangs a turn |

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

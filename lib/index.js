import z from "@deepseek-ai/schemastery";
import { spawn } from "node:child_process";
//#region src/index.ts
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
const name = "dsh-code-reuse-firewall";
const inject = ["tools"];
/** Schemastery schema; cordis validates and provides it as apply(ctx, config). */
const Config = z.object({
	auditRoot: z.string().required().min(1),
	pythonPath: z.string().default("python"),
	maxK: z.number().min(1).max(50).default(5),
	minScore: z.number().min(0).max(1).default(.1),
	timeoutMs: z.number().min(1e3).max(12e4).default(3e4)
});
/** Run the deterministic retrieval channel in a child process. */
function runRetrieval(config, root, description) {
	return new Promise((resolve) => {
		const args = [
			"capability_retrieval.py",
			"--root",
			root,
			"--describe",
			description,
			"--k",
			String(config.maxK),
			"--min-score",
			String(config.minScore),
			"--json",
			"-"
		];
		const child = spawn(config.pythonPath, args, {
			cwd: config.auditRoot,
			timeout: config.timeoutMs,
			windowsHide: true
		});
		let out = "";
		let err = "";
		child.stdout.on("data", (d) => {
			out += d.toString();
		});
		child.stderr.on("data", (d) => {
			err += d.toString();
		});
		child.on("error", (e) => resolve({
			ok: false,
			error: `spawn failed: ${e.message}`
		}));
		child.on("close", (code) => {
			if (code !== 0) {
				resolve({
					ok: false,
					error: `retrieval exited ${code}: ${err.trim().slice(0, 500) || "no stderr"}`
				});
				return;
			}
			try {
				const parsed = JSON.parse(out);
				resolve({
					ok: true,
					results: Array.isArray(parsed.results) ? parsed.results : []
				});
			} catch (e) {
				resolve({
					ok: false,
					error: `invalid JSON from retrieval: ${e instanceof Error ? e.message : String(e)}`
				});
			}
		});
	});
}
function apply(ctx, config) {
	ctx.tools.register({
		name: "reuse_check",
		description: "Pre-write reuse firewall: BEFORE writing a new helper/service/manager, describe what you are about to implement and the existing codebase root — the plugin deterministically surfaces the existing implementations that already cover that intent (no LLM involved). Decide whether to REUSE, extract a shared component, or write new code. The result is advisory evidence, not a verdict: never delete or rewrite code based on retrieval alone. Call this before writing any new function when a similar capability may already exist.",
		parameters: {
			type: "object",
			properties: {
				description: {
					type: "string",
					description: "Natural-language description of the capability you are about to implement (e.g. \"load a JSON config with environment-variable overrides\")."
				},
				root: {
					type: "string",
					description: "Absolute path of the repository root to index (the existing codebase to search for overlapping implementations)."
				}
			},
			required: ["description", "root"]
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean" },
					root: { type: "string" },
					description: { type: "string" },
					candidates: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								existing_symbol: { type: "string" },
								name: { type: "string" },
								qualname: { type: "string" },
								path: { type: "string" },
								score: { type: "number" },
								doc_first: { type: "string" }
							},
							required: [
								"existing_symbol",
								"name",
								"qualname",
								"path",
								"score"
							]
						}
					},
					error: { type: "string" }
				},
				required: [
					"ok",
					"root",
					"description",
					"candidates"
				]
			},
			render: (_args, value) => {
				if (!value.ok) return [{
					type: "text",
					text: `reuse_check failed: ${value.error ?? "unknown error"}`
				}];
				if (value.candidates.length === 0) return [{
					type: "text",
					text: `No existing implementation covers "${value.description}" (root=${value.root}).`
				}];
				const lines = value.candidates.map((c) => `  [${c.score.toFixed(3)}] ${c.existing_symbol}  (${c.path})`);
				return [{
					type: "text",
					text: `Existing implementations overlapping "${value.description}":\n${lines.join("\n")}`
				}];
			}
		},
		async execute(args) {
			const description = typeof args.description === "string" ? args.description.trim() : "";
			const root = typeof args.root === "string" ? args.root.trim() : "";
			if (description.length === 0 || root.length === 0) return {
				ok: false,
				root,
				description,
				candidates: [],
				error: "description and root are required"
			};
			const outcome = await runRetrieval(config, root, description);
			if (!outcome.ok) return {
				ok: false,
				root,
				description,
				candidates: [],
				error: outcome.error
			};
			return {
				ok: true,
				root,
				description,
				candidates: outcome.results.map((r) => ({
					existing_symbol: r.existing_symbol,
					name: r.name,
					qualname: r.qualname,
					path: r.path,
					score: r.score,
					...r.doc_first === void 0 ? {} : { doc_first: r.doc_first }
				}))
			};
		}
	}, "dsh-code-reuse-firewall: reuse_check tool");
}
//#endregion
export { Config, apply, inject, name };

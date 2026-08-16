import z from "@deepseek-ai/schemastery";
//#region src/index.d.ts
declare const name = "dsh-code-reuse-firewall";
declare const inject: string[];
/** Plugin configuration. */
interface Config {
  /** Checkout of keyiadiannao/Auto_code_audit (capability_retrieval.py lives here). */
  auditRoot: string;
  /** Python interpreter used to run the retrieval script. */
  pythonPath: string;
  /** Top-K candidates returned per query. */
  maxK: number;
  /** Score floor; candidates below it are dropped. */
  minScore: number;
  /** Child-process timeout (ms) — retrieval must never hang a turn. */
  timeoutMs: number;
}
/** Schemastery schema; cordis validates and provides it as apply(ctx, config). */
declare const Config: z<Config>;
declare function apply(ctx: any, config: Config): void;
//#endregion
export { Config, apply, inject, name };
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
/** One retrieval candidate (shape of capability_retrieval.py --json - results[]). */
interface Candidate {
  existing_symbol: string;
  name: string;
  qualname: string;
  path: string;
  score: number;
  /** Per-channel evidence — WHY this candidate matched (name / docstring-lexical / string-literal). */
  channels?: {
    name?: number;
    lexical?: number;
    string?: number;
  };
  doc_first?: string;
}
type RetrievalOutcome = {
  ok: true;
  results: Candidate[];
} | {
  ok: false;
  error: string;
};
/** Run the deterministic retrieval channel in a child process. */
declare function runRetrieval(config: Config, root: string, description: string): Promise<RetrievalOutcome>;
declare function apply(ctx: any, config: Config): void;
//#endregion
export { Candidate, Config, RetrievalOutcome, apply, inject, name, runRetrieval };
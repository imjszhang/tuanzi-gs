// Scripted COUNTER fixture for testing runtime contracts. NOT an AI demo/benchmark.
import { GSEngine, MemoryJournal, suitabilityArbiter } from "../dist/index.js";

export class CounterDomain {
  state = { value: 0, blocked: false };
  version = 0;
  effects = 0;
  receipts = new Map();
  approval = false;
  constructor({ blocked = false, target = 3 } = {}) {
    this.state.blocked = blocked;
    this.target = target;
  }
  async observe(signal) {
    signal.throwIfAborted();
    return { revision: String(this.version), observedAt: Date.now(), state: { ...this.state } };
  }
  enumerate(ctx) {
    const kinds = [];
    if (ctx.snapshot.state.blocked && ctx.policy.body.enabled.includes("unlock")) kinds.push("unlock");
    if (!ctx.snapshot.state.blocked && ctx.policy.body.enabled.includes("increment")) kinds.push("increment");
    return kinds.map(kind => ({ id: kind, description: kind === "unlock" ? "Remove the fixture's block" : "Increase the counter by one",
      capability: `counter.${kind}`, action: { kind } }));
  }
  gate(_ctx, c) {
    if (!["counter.increment", "counter.unlock"].includes(c.capability)) return { kind: "deny", reason: "unknown capability" };
    if (this.approval) return { kind: "approval", reason: "human permission required" };
    return { kind: "allow" };
  }
  async execute(req, signal) {
    signal.throwIfAborted();
    const old = this.receipts.get(req.idempotencyKey);
    if (old) {
      if (old.action !== JSON.stringify(req.candidate.action)) throw new Error("idempotency key reused for different action");
      return old.receipt;
    }
    // Synchronous version check + mutation = atomic within this in-memory fixture.
    if (req.expectedRevision !== String(this.version)) return { status: "stale", detail: "version changed" };
    if (this.approval) return { status: "failed", detail: "not authorized" };
    const { kind } = req.candidate.action;
    if (kind === "increment" && !this.state.blocked) this.state.value++;
    else if (kind === "unlock" && this.state.blocked) this.state.blocked = false;
    else return { status: "failed", detail: "precondition failed" };
    this.version++;
    this.effects++;
    const receipt = { status: "applied", detail: kind };
    this.receipts.set(req.idempotencyKey, { action: JSON.stringify(req.candidate.action), receipt });
    return receipt;
  }
  completion(snapshot) { return snapshot.state.value >= this.target ? "succeeded" : "running"; }
  feedback(before, _candidate, receipt, after) {
    return { actionSucceeded: receipt.status === "applied",
      progress: after.state.value > before.state.value || (before.state.blocked && !after.state.blocked),
      metrics: { delta: after.state.value - before.state.value }, facts: [receipt.detail] };
  }
  parsePolicy(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => k !== "enabled" && k !== "subgoal")) throw new Error("invalid policy fields");
    if (typeof raw.subgoal !== "string" || raw.subgoal.length > 500 || !Array.isArray(raw.enabled) || !raw.enabled.every(x => typeof x === "string")) throw new Error("invalid policy schema");
    return { enabled: [...raw.enabled], subgoal: raw.subgoal };
  }
  validatePolicy(next) {
    return next.enabled.every(x => ["increment", "unlock"].includes(x)) ? [] : ["policy references unknown capability"];
  }
}
export function mockJudgment(candidates, { choice = candidates[0]?.id ?? null, fit = 0.95 } = {}) {
  const probabilities = Object.fromEntries(candidates.map(c => [c.id, c.id === choice ? 1 : 0]));
  return { output: { choice, confidence: 1, probabilities, abstainProbability: choice === null ? 1 : 0,
    suitability: Object.fromEntries(candidates.map(c => [c.id, fit])) },
    usage: { provider: "mock", model: "scripted-selector", inputTokens: 0, outputTokens: 0 } };
}
export function proposal(ctx, body = { enabled: ["increment", "unlock"], subgoal: "Unblock, then increment" }) {
  return { output: { baseVersion: ctx.policy.version, basedOnRevision: ctx.snapshot.revision, body,
    explanation: "SCRIPTED test proposal, not model-generated reasoning." },
    usage: { provider: "mock", model: "scripted-planner", inputTokens: 0, outputTokens: 0 } };
}
export function fixture(overrides = {}) {
  const domain = overrides.domain ?? new CounterDomain();
  const journal = overrides.journal ?? new MemoryJournal();
  const selector = overrides.selector ?? { async evaluate(_ctx, candidates) { return mockJudgment(candidates); } };
  const planner = overrides.planner ?? { async propose(ctx) { return proposal(ctx); } };
  const limits = { maxCycles: 30, maxActions: 20, maxModelCalls: 30, maxRepairs: 3, maxDurationMs: 10000,
    ioTimeoutMs: 500, noProgressWindow: 3, historySize: 8, ...overrides.limits };
  const engine = new GSEngine({ runId: overrides.runId ?? "fixture-run", domain, journal, selector, planner, limits,
    arbiter: overrides.arbiter ?? suitabilityArbiter(0.7), // Illustrative, NOT a calibrated threshold.
    goal: { id: "counter-target", description: `Reach ${domain.target}`, verifierId: "counter.target" },
    initialPolicy: { id: "fixture-policy", version: 1, body: { enabled: ["increment"], subgoal: "Increment" } },
    ...(overrides.rule ? { rule: overrides.rule } : {}) });
  return { engine, domain, journal };
}

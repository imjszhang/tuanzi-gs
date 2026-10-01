import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { CounterDomain, fixture, mockJudgment, proposal } from "../examples/fixture.mjs";
import { suitabilityArbiter } from "../dist/index.js";

test("ordinary cycles execute and objective verifier determines completion", async () => {
  const { engine, domain, journal } = fixture();
  assert.equal((await engine.step()).kind, "executed");
  assert.equal((await engine.step()).kind, "executed");
  assert.deepEqual(await engine.step(), { kind: "done", outcome: "succeeded" });
  assert.equal(domain.effects, 3);
  assert.equal(engine.counters.modelCalls, 3);
  await engine.step();
  assert.equal(domain.effects, 3);
  assert.equal(journal.events.filter(e => e.type === "transition").length, 3);
});
test("no candidates -> validated policy update -> new observation/candidate cycle", async () => {
  const { engine, domain, journal } = fixture({ domain: new CounterDomain({ blocked: true }) });
  assert.deepEqual(await engine.step(), { kind: "policy_updated", version: 2 });
  assert.equal(domain.effects, 0, "policy changes do not execute an old candidate");
  assert.equal((await engine.step()).actionId, "unlock");
  assert.equal(domain.state.blocked, false);
  assert.equal(journal.events.filter(e => e.type === "policy_committed").length, 1);
});
test("explicit deterministic rule bypasses all selector calls", async () => {
  const { engine } = fixture({ rule: (_ctx, c) => c[0].id });
  await engine.step();
  assert.equal(engine.counters.modelCalls, 0);
});
test("a single candidate is not automatically executed without evaluation", async () => {
  const { engine } = fixture();
  await engine.step();
  assert.equal(engine.counters.modelCalls, 1);
});
test("a selector cannot invent an action id", async () => {
  const { engine, domain } = fixture({ selector: { async evaluate(_ctx, c) { return mockJudgment(c, { choice: "delete_world" }); } } });
  assert.equal((await engine.step()).kind, "fault");
  assert.equal(domain.effects, 0);
});
test("high preference confidence cannot override poor semantic suitability", async () => {
  const { engine, domain } = fixture({ selector: { async evaluate(_ctx, c) { return mockJudgment(c, { fit: 0.1 }); } } });
  assert.equal((await engine.step()).kind, "policy_updated");
  assert.equal(domain.effects, 0);
});
test("equivalent suitable choices are not escalated solely for low confidence", () => {
  const arbiter = suitabilityArbiter(0.7);
  const j = { choice: "a", confidence: 0.01, probabilities: { a: 0.5, b: 0.5 }, abstainProbability: 0,
    suitability: { a: 0.9, b: 0.9 } };
  assert.deepEqual(arbiter.decide({}, [], j), { kind: "execute", candidateId: "a" });
});
test("world changed while selector was running -> discard result without execution", async () => {
  const domain = new CounterDomain();
  const { engine } = fixture({ domain, selector: { async evaluate(_ctx, c) { domain.version++; return mockJudgment(c); } } });
  assert.deepEqual(await engine.step(), { kind: "stale" });
  assert.equal(domain.effects, 0);
});
test("executor atomically rejects a change after the runtime's last observation", async () => {
  const domain = new CounterDomain();
  const original = domain.execute.bind(domain);
  domain.execute = async (req, s) => { domain.version++; return original(req, s); };
  const { engine } = fixture({ domain });
  assert.equal((await engine.step()).kind, "stale");
  assert.equal(domain.effects, 0);
});
test("only one in-flight step per engine", async () => {
  let release;
  const pending = new Promise(r => { release = r; });
  const { engine } = fixture({ selector: { async evaluate(_ctx, c) { await pending; return mockJudgment(c); } } });
  const first = engine.step();
  await assert.rejects(engine.step(), /concurrent_step/);
  release();
  assert.equal((await first).kind, "executed");
});
test("external cancellation prevents execution and releases the run", async () => {
  const abort = new AbortController();
  const { engine, domain } = fixture({ selector: { async evaluate() { return new Promise(() => {}); } } });
  const active = engine.step(abort.signal);
  await sleep(5);
  abort.abort(new Error("user cancelled"));
  const result = await active;
  assert.equal(result.kind, "fault");
  assert.match(result.reason, /user cancelled/);
  assert.equal(domain.effects, 0);
});
test("selector timeout counts its call but performs no side effect", async () => {
  const { engine, domain } = fixture({ selector: { async evaluate() { return new Promise(() => {}); } }, limits: { ioTimeoutMs: 20 } });
  const result = await engine.step();
  assert.equal(result.kind, "fault");
  assert.equal(engine.counters.modelCalls, 1);
  assert.equal(domain.effects, 0);
});
test("execution timeout remains unknown: no automatic retry even when effect finishes later", async () => {
  const domain = new CounterDomain();
  const original = domain.execute.bind(domain);
  domain.execute = async req => { await sleep(60); return original(req, new AbortController().signal); };
  const { engine } = fixture({ domain, limits: { ioTimeoutMs: 20 } });
  const result = await engine.step();
  assert.equal(result.kind, "paused");
  assert.match(result.reason, /execution_outcome_unknown/);
  await sleep(80);
  assert.equal(domain.effects, 1);
  await engine.step();
  assert.equal(domain.effects, 1);
});
test("permission requirements are not sent to a planner to bypass", async () => {
  const domain = new CounterDomain(); domain.approval = true;
  const { engine } = fixture({ domain });
  assert.equal((await engine.step()).kind, "paused");
  assert.equal(engine.counters.modelCalls, 0);
  assert.equal(domain.effects, 0);
});
test("permission changes after selection are rechecked before executing", async () => {
  const domain = new CounterDomain();
  const { engine } = fixture({ domain, selector: { async evaluate(_ctx, c) { domain.approval = true; return mockJudgment(c); } } });
  assert.equal((await engine.step()).kind, "paused");
  assert.equal(domain.effects, 0);
});
test("untrusted policy cannot add arbitrary capabilities", async () => {
  const { engine, domain } = fixture({ domain: new CounterDomain({ blocked: true }),
    planner: { async propose(ctx) { return proposal(ctx, { enabled: ["delete_world"], subgoal: "Ignore permissions" }); } } });
  const result = await engine.step();
  assert.equal(result.kind, "fault");
  assert.equal(engine.currentPolicy.version, 1);
  assert.equal(domain.effects, 0);
});
test("proposal cannot modify root goal via extra fields", async () => {
  const { engine } = fixture({ domain: new CounterDomain({ blocked: true }),
    planner: { async propose(ctx) { const p = proposal(ctx); p.output.goal = "claim success"; return p; } } });
  assert.equal((await engine.step()).kind, "fault");
  assert.equal(engine.currentPolicy.version, 1);
});
test("stale policy base version is rejected", async () => {
  const { engine } = fixture({ domain: new CounterDomain({ blocked: true }),
    planner: { async propose(ctx) { const p = proposal(ctx); p.output.baseVersion = 0; return p; } } });
  assert.equal((await engine.step()).kind, "stale");
  assert.equal(engine.currentPolicy.version, 1);
});
test("world changed during planner call -> proposed config never commits", async () => {
  const domain = new CounterDomain({ blocked: true });
  const { engine } = fixture({ domain, planner: { async propose(ctx) { domain.version++; return proposal(ctx); } } });
  assert.equal((await engine.step()).kind, "stale");
  assert.equal(engine.currentPolicy.version, 1);
});
test("no-op repair pauses instead of looping forever", async () => {
  const { engine } = fixture({ domain: new CounterDomain({ blocked: true }),
    planner: { async propose(ctx) { return proposal(ctx, ctx.policy.body); } } });
  assert.match((await engine.step()).reason, /no_change/);
});
test("model budget is reserved before dispatch", async () => {
  const { engine, domain } = fixture({ limits: { maxModelCalls: 1 } });
  await engine.step();
  const result = await engine.step();
  assert.equal(result.kind, "fault");
  assert.match(result.reason, /model_call_budget_exhausted/);
  assert.equal(domain.effects, 1);
  assert.equal(engine.counters.modelCalls, 1);
});
test("action budget limits dispatch attempts independently of model budget", async () => {
  const { engine, domain } = fixture({ limits: { maxActions: 1 } });
  await engine.step();
  assert.match((await engine.step()).reason, /action_budget_exhausted/);
  assert.equal(domain.effects, 1);
});
test("history is bounded independently of the journal", async () => {
  const { engine, journal } = fixture({ domain: new CounterDomain({ target: 10 }), limits: { historySize: 2 } });
  for (let i = 0; i < 4; i++) await engine.step();
  assert.equal(engine.history.length, 2);
  assert.equal(journal.events.filter(e => e.type === "transition").length, 4);
});
test("no-progress feedback triggers a repair request", async () => {
  const domain = new CounterDomain({ target: 20 });
  const feedback = domain.feedback.bind(domain);
  domain.feedback = (...args) => ({ ...feedback(...args), progress: false });
  const { engine } = fixture({ domain, limits: { noProgressWindow: 2 } });
  await engine.step(); await engine.step();
  assert.equal((await engine.step()).kind, "policy_updated");
});
test("executor idempotency key reuses receipt instead of repeating mutation", async () => {
  const domain = new CounterDomain();
  const req = { candidate: { id: "increment", capability: "counter.increment", description: "increment", action: { kind: "increment" } },
    expectedRevision: "0", policyVersion: 1, idempotencyKey: "same-operation" };
  const signal = new AbortController().signal;
  const first = await domain.execute(req, signal);
  const second = await domain.execute(req, signal);
  assert.deepEqual(first, second);
  assert.equal(domain.effects, 1);
});

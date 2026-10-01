import test from "node:test";
import assert from "node:assert/strict";
import { JevSelector, validateJudgment } from "../dist/index.js";
const ctx = { goal: { id: "demo", description: "Find relevant information", verifierId: "test" },
  snapshot: { revision: "r1", observedAt: 0, state: { page: "index" } },
  policy: { id: "p", version: 1, body: { subgoal: "Read" } }, recent: [] };
const candidates = [{ id: "read.details", description: "Read the details page", capability: "read", action: { kind: "read" } }];
const signal = new AbortController().signal;
function payload() {
  return { model: "jev-1.13.0", answers: {
    next: { type: "choice", choice: "a0", confidence: 0.8, probabilities: { a0: 0.9, none: 0.1 } },
    fit_a0: { type: "noul", noul: 0.95 }
  }, usage: { input_tokens: 210, output_tokens: 24 } };
}
function adapter(fetcher) {
  return new JevSelector({ apiKey: "test-key-not-real", model: "jev-1.13.0", fetch: fetcher,
    encode: c => ({ goal: c.goal.description, state: c.snapshot.state, policy: c.policy.body }) });
}
test("Jev HTTP request maps aliases, batches independent questions and parses usage", async () => {
  let body;
  const selector = adapter(async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init.method, "POST");
    body = JSON.parse(init.body);
    return Response.json(payload());
  });
  const result = await selector.evaluate(ctx, candidates, signal);
  assert.equal(body.questions.next.type, "choice");
  assert.equal(body.questions.fit_a0.type, "noul");
  assert.match(body.questions.fit_a0.instructions.candidate.description, /details/);
  assert.equal(result.output.choice, "read.details");
  assert.equal(result.usage.model, "jev-1.13.0");
  assert.equal(result.usage.inputTokens, 210);
  assert.equal(result.usage.costMicrousd, undefined, "unknown monetary cost is not fabricated as zero");
  validateJudgment(result.output, candidates);
});
test("explicit none is represented as abstention, not an executable action", async () => {
  const p = payload(); p.answers.next.choice = "none";
  p.answers.next.probabilities = { a0: 0.05, none: 0.95 };
  const result = await adapter(async () => Response.json(p)).evaluate(ctx, candidates, signal);
  assert.equal(result.output.choice, null);
  assert.equal(result.output.abstainProbability, 0.95);
});
test("malformed out-of-range Noul is rejected", async () => {
  const p = payload(); p.answers.fit_a0.noul = 10;
  await assert.rejects(adapter(async () => Response.json(p)).evaluate(ctx, candidates, signal), /expected \[0,1\]/);
});
test("provider cannot introduce a new action alias", async () => {
  const p = payload(); p.answers.next.choice = "run_shell";
  await assert.rejects(adapter(async () => Response.json(p)).evaluate(ctx, candidates, signal), /unknown Jev choice/);
});
test("missing independent suitability answer fails closed", async () => {
  const p = payload(); delete p.answers.fit_a0;
  await assert.rejects(adapter(async () => Response.json(p)).evaluate(ctx, candidates, signal), /expected object/);
});
test("429 is surfaced with retry metadata and no hidden retries", async () => {
  let calls = 0;
  const selector = adapter(async () => { calls++; return new Response("rate limited", { status: 429, headers: { "retry-after": "5" } }); });
  await assert.rejects(selector.evaluate(ctx, candidates, signal), /Jev HTTP 429; retry-after=5/);
  assert.equal(calls, 1);
});
test("255 candidates would overflow Choice including abstention: reject before sending", async () => {
  let calls = 0;
  const selector = adapter(async () => { calls++; return Response.json(payload()); });
  const tooMany = Array.from({ length: 255 }, (_, i) => ({ ...candidates[0], id: String(i) }));
  await assert.rejects(selector.evaluate(ctx, tooMany, signal), /1\.\.254/);
  assert.equal(calls, 0);
});
test("non-normalized distributions are rejected at the runtime boundary", async () => {
  const p = payload(); p.answers.next.probabilities = { a0: 1, none: 1 };
  const result = await adapter(async () => Response.json(p)).evaluate(ctx, candidates, signal);
  assert.throws(() => validateJudgment(result.output, candidates), /sum to one/);
});

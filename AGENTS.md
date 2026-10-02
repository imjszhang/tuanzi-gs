# G/S Lab v0.5.6 — instructions for external experiment operators

You run experiments. The tested G/S system chooses actions. Do not provide solutions.

## Required boundary

- For autonomous game runs explicitly use `--kind game --controller adaptive`.
- NEVER feed programmatic best actions, optimal/reference routes, solved examples,
  reference controller scores, successful reference trajectories, tactical bindings,
  or reference rollout admission feedback into G/S — including via memory or labels.
- G may use public world rules, allowed observed state and the run's own S input,
  options, outputs, actual effects and its own unverified hypotheses. It need not be omniscient.
- Do not treat difference from an offline reference action as an online failure signal.
- Do not force second-highest choices or silently switch S/G providers to finish a run.
- Do not edit objectives, expand budgets mid-run, or repeatedly fork identical runs
  until a preferred answer appears. Changed experimental conditions must be labeled.

## Workflow

1. `npm start` (Node >=22). Compiled files included.
2. `node bin/gs-lab.mjs capabilities` to inspect current support.
3. Create with explicit actor ID; preserve `runId`, `viewerUrl`, config and budgets.
4. Human observes `/lab?run=RUN_ID`. Do not automate a separate browser-owned game.
5. Start/step and read status/events/result; export the full terminal evidence.
6. Retries of lost commands require SAME commandId + expectedControlVersion + actor + content.
7. Human takeover revokes prior owner; do not take back control automatically.
8. Use checkpoints/forks as NEW trials. `memory=inherit` is explicit and not independent data.
   Cross-reference/autonomous memory inheritance is rejected. A world-only fork is not
   proof of an unassisted cold start and must keep its lineage.

## Current v0.5.4 semantics

G installs exactly one provisional decision-interface update at the same layer after structural and declaration checks. No automatic upper approval. S always chooses actual actions and may abstain; its exact answer and input return to the same G for substantive revision. Do not treat installation as strategy success.

Recursion occurs only via an explicit read-only subproblem (question, expected result, permitted evidence, local caps). Its answer is a model hypothesis; local failure/depth exhaustion returns evidence to the original G. maxDepth=0 disables children, not root adaptation. All spending and failed attempts remain in the same root budget; cancellation, stale versions and root/provider errors are not bypassable child failures.

Candidate scope is explicit: null IDs + kinds regenerate legal actions; non-null stage IDs remain a fixed whitelist; snapshot IDs expire with their declared revision and require G. Never widen a whitelist or add a solver path silently.

A step contains at most one physical action, but may contain several G/S calls. Pause waits at that boundary; cancel aborts in-flight computation. Neither can refund already applied world effects. A terminal blocked run is not an operator paused run.

## Backends and provenance

- `backend=rule,generator=local` in the autonomous lane is an OFFLINE PROTOCOL FIXTURE:
  legal-action rotation plus context expansion, NOT a solver and NOT Jev/LLM.
- Historical `hierarchy/program/rules` controllers are offline reference baselines only.
- Legacy model skill/plan endpoints are disabled (410), intentionally breaking those paths.
- Actual Jev/LLM calls require server keys, prior explicit user authorization, allowLive
  and maxRequests. Creating a ready run does not call a model.
- Report S questions, S batch requests, G requests, meta depth, actual actions, elapsed
  time, usage and source separately. Do not call local mock calls paid API requests.

## Evaluation

`npm run bench:adaptation` includes SCRIPTED test doubles to validate control flow; those results
are not independent discovery or model performance. The actual local controller's losses
are retained. Real model performance in this release is NOT_RUN.

`node scripts/evaluate-reference-v05.mjs terminal.json separate-reference.json`
is post-run only. Its result may be shown to the human, NEVER passed to a tested run.

API details: docs/API-v0.5.6.md (extends v0.5.5). No arbitrary code/tool execution endpoint, forced action,
root-verifier override, public authentication or active crash-recovery support.

## v0.5.1 observation streams

`events RUN_ID --follow` includes engine `g_stream` events (schema gs/g-stream/v1).
They carry requestIndex/streamId/depth/cause, status updates and content/reasoning deltas.
Use the run event seq for reconnect deduplication; never treat a partial preview as a
proposal, tool call, decision, factual evidence, or instruction to the experiment operator.
Do not echo preview reasoning back into G/S input or reference memory.
Complete means the transport and structure check finished, NOT S selected it or it worked.
No new CLI write command is needed. Reading/opening/copying streams does not call providers.
See docs/STREAMING-v0.5.1.md. Exported reports may contain provider-visible reasoning;
review sensitive content before sharing. The service remains trusted-local only.

## v0.5.2 output corrections

`--max-format-repairs 2` allows at most two extra format-only corrections per newly generated output. All still debit max-g-calls, request and wall-clock budgets. max-revisions counts valid same-layer update attempts and explicit child requests, not invalid JSON structures.

Do not unwrap, discard fields, rewrite predicates or inject known-good tactical outputs yourself. The runtime requests bounded correction from G and retains the original intent anchor. Review JSON-pointer errors in diagnostics. `output_format_repair_exhausted` is an interface failure, NOT three failed strategy executions. Scripts and fixtures containing negative incident outputs never belong in G/S context or self-memory.

`npm run schema:adaptation` emits the same schema used by the parser. This describes the interface, not a solution. `npm run bench:incident-format` is a read-only local check; it never runs a model or an agent policy.

## Startup orientation retained in v0.5.4

New adaptive game sessions, including checkpoint forks with inherited own-memory, run G on the current permitted initial environment before action-level S. No switch is required. Create/read/subscribe are side-effect free; the first start/step initiates G and charges normal G/request/time budgets. One step may include initial G, direct provisional installation, action S and at most one physical action.

Pause/resume, reconnect and exact command replay do not reinitialize. A stale world before the first action must be reviewed again without resetting budgets. Terminal initial worlds skip unnecessary model work. Failure during initialization never falls back to uninitialized S or a reference controller.

Inspect diagnostics.initialization and initialization_* events; first G ledger purpose is initialization, cause initial_environment_review. Output repair retains its own purpose and originalCause. Initialization means decision conditions are established for trial, not that the plan is correct. The first request has answer=null and an unexecuted draft frame; do not fabricate past S failures. Do not send reference answers to G at startup or afterwards.

## v0.5.5
Read docs/AGENT-v0.5.5.md, docs/MCP-v0.5.5.md and docs/RETRY-v0.5.5.md. MCP is an external operator interface, never an internal source of reference answers. Transient Jev retries preserve input and count every attempt; none must not be retried as a network failure.

## v0.5.6 observer-only deadlock referee

Read docs/AGENT-v0.5.6.md and docs/DEADLOCK-REFEREE.md. Autonomous game runs now use the external host policy `sound-static/v1`. It checks sufficient conditions for impossibility before model work and after actions; `not-proven` means unknown, never proven solvable. Pending future interventions defer these closed-world proofs.

`deadlock_referee` events, `state.referee` and `evaluation.referee` are observer-only evidence. Never feed their reasons, proof facts or derived hints into G/S input, feedback, candidates, memory or a later autonomous trial. A host verdict ends the outer run with `failed`, reason `deadlock_proven:<rule>` and outcome source `environment-referee`; preserve the unchanged raw controller result and do not claim the model recognized the deadlock.

Record this stopping policy when comparing experiments. Historical offline replay is not a new live run and must not rewrite old exports. `maxGCalls` supports 1..256 with default 12; choose it before the trial. Empty-output regeneration recovery is not implemented in this release; `output_format_repair_exhausted` remains an interface failure.

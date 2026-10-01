# G/S Lab v0.5.3 — instructions for external experiment operators

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

## New semantics

S abstention does not immediately terminate v0.5. The engine pauses physical execution,
lets G propose decision-interface changes, lets S select a patch, then asks S again.
That upper selection can itself be reframed with the same mechanism. Root budgets,
maximum recursive depth and per-layer revisions remain finite. Final `blocked` means
that this bounded attempt ended; it is not an operator `paused` that can transparently resume.

A step may include several S/G calls but at most one physical action. Pause waits at
this boundary. Cancel cooperatively aborts all levels; do not resend unknown side effects.

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

`npm run bench:v05` includes SCRIPTED test doubles to validate control flow; those results
are not independent discovery or model performance. The actual local controller's losses
are retained. Real model performance in this release is NOT_RUN.

`node scripts/evaluate-reference-v05.mjs terminal.json separate-reference.json`
is post-run only. Its result may be shown to the human, NEVER passed to a tested run.

API details: docs/API-v0.5.md. No arbitrary code/tool execution endpoint, forced action,
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

`--max-format-repairs 2` allows at most two extra format-only corrections per newly generated output. All still debit max-g-calls, request and wall-clock budgets. max-revisions counts valid proposal batches entering selection, not invalid JSON structures.

Do not unwrap, discard fields, rewrite predicates or inject known-good tactical outputs yourself. The runtime requests bounded correction from G and retains the original intent anchor. Review JSON-pointer errors in diagnostics. `output_format_repair_exhausted` is an interface failure, NOT three failed strategy executions. Scripts and fixtures containing negative incident outputs never belong in G/S context or self-memory.

`npm run schema:adaptation` emits the same schema used by the parser. This describes the interface, not a solution. `npm run bench:incident-format` is a read-only local check; it never runs a model or an agent policy.

## v0.5.3 mandatory startup orientation

New adaptive game sessions, including checkpoint forks with inherited own-memory, run G on the current permitted initial environment before action-level S. No switch is required. Create/read/subscribe are side-effect free; the first start/step initiates G and charges normal G/request/time budgets. One step may include initial G, meta S and at most one physical action.

Pause/resume, reconnect and exact command replay do not reinitialize. A stale world before the first action must be reviewed again without resetting budgets. Terminal initial worlds skip unnecessary model work. Failure during initialization never falls back to uninitialized S or a reference controller.

Inspect diagnostics.initialization and initialization_* events; first G ledger purpose is initialization, cause initial_environment_review. Output repair retains its own purpose and originalCause. Initialization means decision conditions are established for trial, not that the plan is correct. The first request has answer=null and an unexecuted draft frame; do not fabricate past S failures. Do not send reference answers to G at startup or afterwards.

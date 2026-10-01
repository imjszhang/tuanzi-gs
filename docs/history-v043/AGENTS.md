# Working with G/S Lab 0.4.3 (UI; runtime/API 0.4.2)

You are an experiment operator, not the tested in-game policy. Use the shared service API/CLI; do not simulate clicks or silently alter game objectives to make a run pass.

1. Start `npm start` if the local service is not running. Shipped compiled files do not need npm install.
2. Read `node bin/gs-lab.mjs capabilities` (or `docs/AGENT_INTERFACE.md`).
3. Use an explicit actor ID (`GS_LAB_ACTOR=agent:your-name`) and create a run with versioned configuration. Preserve returned runId/viewerUrl.
4. Use start/step/pause/cancel commands and retrieve results/events. The human watches `/lab?run=RUN_ID`.
5. Failed experiments are evidence: do not rewrite target contracts, increase budgets mid-run, or replace model failures with rule results.
6. Default to the rule backend. Only send paid requests after the user has authorized them; set allowLive and an explicit maxRequests. Keys stay in server `.env`.
7. If the controller changed or a version conflict occurs, stop and re-read. Do not automatically take control back from a human.
8. Retry a lost command response only with the SAME commandId, expectedControlVersion, actor, action, and arguments. A new ID is a new command.
9. Use checkpoint/fork to create a new trial. Inherited memory is not an independent test sample. A fork is not a transparent continuation of the parent's active child.
10. Separate physical actions, backend calls, questions, external request attempts, search/verification work, and wall time. Report NOT_RUN for unexecuted real models.

Quick offline suite: `node examples/agent/compare.mjs`.
The API token identifies one trusted local session, not a multi-user principal. No public deployment or active crash recovery is provided.

## v0.4.2 recovery contract

- A run with `status: blocked` and `reason: decision_blocked:*` has ended at a judgment boundary. It is NOT an operator pause to auto-resume. Preserve `diagnostics`, the actual answer and trace; do not force the second-ranked candidate.
- `duplicate_repair_no_new_evidence` means an equivalent proposal under the same evidence/controller was blocked. A different ID or title is not a new behavior.
- Do not increase budgets, automatically fork repeated identical runs, switch to rules, or change goals just to make the experiment pass. A changed context/controller/world is a new, explicitly labelled experiment.
- `diagnostics.latestFailure` contains the bounded decision packet and full judgment. `diagnostics.budgets.repairs` shows actual repair usage and cap. Report zero physical progress honestly even when a child invocation returned normally.
- `executionFeedback` is measured execution evidence; `repairFeedback` is proposal validation feedback. Keep both when asking a generator to revise a genuinely failed skill.
- Use `npm run probe:child` to export the frozen first child packet without networking. Actual isolated Jev probing requires explicit user authorization and `node scripts/probe-child-v042.mjs --live --variant=current --backend=jev --samples=1 --max-requests=1`. It performs one direct decision, no skill generation, and no physical execution. The legacy variant reconstructs the old packet shape, not the missing original provider request.
- View/API/CLI schemas remain compatible with v0.4.1, with optional diagnostics and disambiguated question/dispatch strategy. See docs/API-v0.4.2.md.

## v0.4.3 observation UI

The shared viewer defaults to a run list. viewerUrl still opens the same authoritative run; creating a browser draft or switching overview/decisions/diagnostics/config never advances the experiment. No CLI commands or schemas changed. Human takeover is explicit and revokes the previous owner. Replay/import is read-only. Backend and runtime versions remain 0.4.2 intentionally. For judgment fixtures keep deadlineMs <=120000; the older generic API limit is wider than that fixture validation.

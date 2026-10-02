# G/S Lab v0.5.6 — external experiment operators

Follow the current [AGENTS.md](../AGENTS.md). The shared-run workflow, explicit actor, command replay, takeover, budgets and provenance rules from [v0.5.5](AGENT-v0.5.5.md) still apply. [MCP-v0.5.5.md](MCP-v0.5.5.md) and [RETRY-v0.5.5.md](RETRY-v0.5.5.md) remain the protocol references.

## Observer-only referee

Autonomous games (`--kind game --controller adaptive`) now use host policy `sound-static/v1`. It proves a limited set of impossible states: insufficient total deliverable resources, terrain-disconnected home, or stationary resource lock. It supplies no action, route or strategy.

- `proven-deadlock` ends the outer run as `failed`, with reason `deadlock_proven:<rule>` and source `environment-referee`.
- `not-proven` means unknown, not solvable. Pending future interventions defer these static proofs.
- `state.referee`, outer `deadlock_referee` events and `evaluation.referee` are observer-only. Never pass their reasons, proof facts or derived advice to G/S input, options, feedback, self-memory or a subsequent autonomous trial.
- Preserve the raw controller result, which may remain unfinished. A host verdict is not evidence that G or S recognized impossibility.
- Record the policy in experiment comparisons. Offline checks of an old trajectory do not create a new live trial or change its original outcome.

Read [DEADLOCK-REFEREE.md](DEADLOCK-REFEREE.md) for assumptions and [API-v0.5.6.md](API-v0.5.6.md) for fields. This is a trusted-local code boundary, not a sandbox against an operator with full host access.

## Budgets and unresolved output failure

`maxGCalls` accepts `1..256`, default `12`. Set budgets before the trial; raising the supported ceiling does not authorize changes during a run or another live experiment.

Empty-output regeneration recovery is not part of v0.5.6. Existing format repair remains bounded; `output_format_repair_exhausted` is an interface failure, not proof of an impossible game. Do not hand-fill a missing proposal or provide a known-good strategy to keep a trial running.

# Engine reference v0.3

v0.2.1 layer: ProposalRejected, typed validation feedback, bounded maxProposalAttempts under existing budgets; no hidden retry of infrastructure errors.

v0.3 layer: optional EngineOptions.account cycle/model/action hooks; RootBudget and ExecutionLease to coordinate one-process parent/child runs. These are generic mechanisms, not a built-in game hierarchy. The actual parent/child Domain adapter and SkillSpec live in ../../src/skills.

Both parent and child reuse GSEngine. A host must reserve actual provider calls and physical actions appropriately; legacy interface counters do not equal billed requests. RootBudget must be shared by reference, not cloned per child. ExecutionLease is not a distributed lock or durable exactly-once protocol.

Resource/lease integrations are tested in the enclosing application's tests/hierarchy03.test.mjs. Existing package tests remain available. Model adapters have protocol tests only; no live performance claims.

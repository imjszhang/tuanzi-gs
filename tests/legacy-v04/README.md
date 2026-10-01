# v0.4 live protocol expectations — retired in v0.5

These unmodified test sources are preserved for audit, not silently skipped failing tests.
Their live skill/plan endpoints intentionally returned to HTTP 410: they used worked examples,
reference rollout or tactical binding and cannot be valid success expectations for v0.5.
`*.before-v05` preserves three precisely migrated test files.

Replacement coverage: `autonomous-provider.test.mjs`, `autonomous-http.test.mjs`,
`autonomous-isolation.test.mjs`, `autonomous-server.test.mjs`.
Existing reference algorithms, engine invariants, judgment scheduler, HTTP control and
UI-presentation tests remain active. The guarded reference-memory test now explicitly
selects the historical offline controller instead of relying on a changed default.

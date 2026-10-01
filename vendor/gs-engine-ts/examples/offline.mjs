import { CounterDomain, fixture } from "./fixture.mjs";
const { engine, journal } = fixture({ domain: new CounterDomain({ blocked: true }) });
console.log("OFFLINE SCRIPTED FIXTURE — no Jev or LLM request is made. Not an intelligence benchmark.");
for (let i = 0; i < 20; i++) {
  const result = await engine.step();
  console.log(JSON.stringify({ step: i + 1, result, policyVersion: engine.currentPolicy.version }));
  if (["done", "paused", "stopped", "fault"].includes(result.kind)) break;
}
console.log("Counters:", engine.counters);
console.log("Trace:", journal.events.map(e => e.type).join(" → "));

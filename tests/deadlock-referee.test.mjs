import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDeadlock, DEADLOCK_POLICY} from '../dist/src/lab/deadlock.js';

// Explicit synthetic fixture: sufficient global food, all food guarded, no
// carried or placed resource. It supplies no policy or actions to tested G/S.
function locked() {
  return {
    width: 9, height: 7, revision: 27, turn: 26, maxTurns: 180,
    terrain: Array(63).fill('grass'), walls: [],
    berries: [[6, 3], [7, 2], [7, 4], [8, 3], [6, 2], [6, 4]].map(([x, y], i) => ({id: `b${i}`, x, y})),
    guards: [{id: 'g', x: 7, y: 3, anchor: {x: 7, y: 3}, eating: 0}], lures: [],
    home: {x: 0, y: 3}, player: {x: 0, y: 3}, energy: 72, maxEnergy: 100,
    bag: 0, capacity: 3, delivered: 1, target: 5, scenario: 'referee-fixture',
    attacks: 0, baitUsed: 0, eaten: 0, lastFact: 'Synthetic state, no reference trajectory.'
  };
}
function expectUnknown(s, reason = 'no_static_proof', options) {
  const result = assessDeadlock(s, options);
  assert.equal(result.verdict, 'not-proven');
  assert.equal(result.reason, reason);
  assert.equal(result.proof, undefined);
}
function freezeDeep(x) {
  if (x && typeof x === 'object') {
    Object.freeze(x);
    for (const value of Object.values(x)) freezeDeep(value);
  }
  return x;
}

test('observer referee proves empty-inventory static guard lock without supplying a route', () => {
  const result = assessDeadlock(locked());
  assert.equal(result.verdict, 'proven-deadlock');
  assert.equal(result.reason, 'stationary_resource_lock');
  assert.equal(result.policy, DEADLOCK_POLICY);
  assert.equal(result.schema, 'gs/deadlock-referee/v1');
  assert.equal(result.worldRevision, '27');
  assert.equal(result.observerOnly, true);
  assert.equal(result.proof.facts.accessibleBerries, 0);
  assert.equal(result.proof.facts.delivered, 1);
  for (const field of ['route', 'actions', 'bestAction', 'solution']) assert.ok(!Object.hasOwn(result.proof.facts, field));
});

test('static guard lock is independent of map orientation', () => {
  const s = locked(), mirror = p => ({...p, x: s.width - 1 - p.x});
  s.player = mirror(s.player); s.home = mirror(s.home); s.berries = s.berries.map(mirror);
  s.guards = s.guards.map(g => ({...mirror(g), anchor: mirror(g.anchor)}));
  assert.equal(assessDeadlock(s).reason, 'stationary_resource_lock');
});

test('a carried berry prevents the static lock proof, including when eating is possible', () => {
  const s = locked(); s.bag = 1;
  expectUnknown(s);
  s.energy = s.maxEnergy;
  expectUnknown(s);
});

test('an existing lure prevents static lock proof even if its next effect is unknown', () => {
  const s = locked(); s.lures = [{id: 'l', x: 3, y: 3, ttl: 1}];
  expectUnknown(s);
});

test('an eating guard may open access and cannot support a static lock proof', () => {
  const s = locked(); s.guards[0].eating = 1;
  expectUnknown(s);
});

test('a guard returning to its anchor may change access and cannot support a static lock proof', () => {
  const s = locked(); s.guards[0].x--;
  expectUnknown(s);
});

test('every guard must be stationary for the lock proof', () => {
  const s = locked(); s.guards.push({id: 'moving', x: 8, y: 5, anchor: {x: 8, y: 6}, eating: 0});
  expectUnknown(s);
});

test('a single safely accessible berry prevents the static resource lock proof', () => {
  const s = locked(); s.berries.push({id: 'available', x: 1, y: 3});
  expectUnknown(s);
});

test('reachable current-cell berry also prevents the static resource lock proof', () => {
  const s = locked(); s.berries.push({id: 'underfoot', ...s.player});
  expectUnknown(s);
});

test('a threatened origin may escape to safe cells containing resources', () => {
  const s = locked(); s.player = {x: 5, y: 3};
  s.berries.push({id: 'escape', x: 4, y: 3});
  expectUnknown(s);
});

test('a berry in a threatened origin cannot be picked up', () => {
  const s = locked(); s.player = {x: 5, y: 3};
  s.berries.push({id: 'unsafe-underfoot', ...s.player});
  assert.equal(assessDeadlock(s).reason, 'stationary_resource_lock');
});

test('terrain-disconnected home is impossible even when ignoring guard danger and action costs', () => {
  const s = locked(); s.bag = 1; s.home = {x: 8, y: 6};
  s.walls = Array.from({length: s.height}, (_, y) => ({x: 4, y}));
  const result = assessDeadlock(s);
  assert.equal(result.reason, 'home_disconnected');
  assert.equal(result.proof.facts.guardsAndCostsIgnored, true);
});

test('a home threatened by a guard is not treated as terrain-disconnected', () => {
  const s = locked(); s.bag = 1; s.home = {x: 7, y: 3};
  expectUnknown(s);
});

test('water and rock barriers participate in static connectivity', () => {
  for (const tile of ['water', 'rock']) {
    const s = locked(); s.bag = 1; s.home = {x: 8, y: 6};
    for (let y = 0; y < s.height; y++) s.terrain[y * s.width + 4] = tile;
    assert.equal(assessDeadlock(s).reason, 'home_disconnected');
  }
});

test('resource conservation excludes irreversible lures from the delivery upper bound', () => {
  const s = locked(); s.berries = s.berries.slice(0, 2); s.bag = 1;
  s.lures = [{id: 'irreversible', x: 4, y: 3, ttl: 36}];
  const result = assessDeadlock(s);
  assert.equal(result.reason, 'insufficient_total_resources');
  assert.equal(result.proof.facts.deliverableUpperBound, 4);
  assert.equal(result.proof.facts.luresRecoverable, false);
});

test('equal resource upper bound does not prove insufficiency', () => {
  const s = locked(); s.berries = s.berries.slice(0, 3); s.bag = 1;
  expectUnknown(s);
});

test('static lock may also arise from inaccessible terrain without any guards', () => {
  const s = locked(); s.guards = [];
  s.walls = Array.from({length: s.height}, (_, y) => ({x: 4, y}));
  assert.equal(assessDeadlock(s).reason, 'stationary_resource_lock');
});

test('pending external intervention defers even an otherwise conclusive proof', () => {
  const s = locked(); s.berries = [];
  expectUnknown(s, 'pending_interventions', {pendingInterventions: true});
  assert.equal(assessDeadlock(s, {pendingInterventions: false}).verdict, 'proven-deadlock');
});

test('ordinary success and exhaustion take precedence over this referee', () => {
  for (const patch of [{delivered: 5}, {energy: 0}, {turn: 180}, {delivered: 5, energy: 0}]) {
    const s = {...locked(), ...patch};
    expectUnknown(s, 'already_terminal');
    expectUnknown(s, 'already_terminal', {pendingInterventions: true});
  }
});

test('assessment is pure, accepts deeply frozen worlds and never mutates referenced facts', () => {
  const s = locked(), before = structuredClone(s);
  const result = assessDeadlock(freezeDeep(s));
  assert.deepEqual(s, before);
  assert.deepEqual(assessDeadlock(s), result);
  const detached = locked(); detached.bag = 1; detached.home = {x: 8, y: 6};
  detached.walls = Array.from({length: detached.height}, (_, y) => ({x: 4, y}));
  const proof = assessDeadlock(detached).proof;
  proof.facts.player.x = 99;
  assert.equal(detached.player.x, 0);
});

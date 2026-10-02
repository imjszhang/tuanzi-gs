import test from 'node:test';
import assert from 'node:assert/strict';
import {refereeCopy, statusCopy, keyEvents, reasonText} from '../dist/src/lab/presentation.js';

const assessment = {
  schema: 'gs/deadlock-referee/v1', policy: 'sound-static/v1',
  worldRevision: '27', verdict: 'proven-deadlock', reason: 'stationary_resource_lock',
  proof: {rule: 'stationary_resource_lock', facts: {bag: 0, lures: 0}}, observerOnly: true,
};
const event = {
  runId: 'presentation-fixture', seq: 10, at: '2026-10-01T00:00:00.000Z',
  type: 'deadlock_referee', data: {assessment},
};

test('deadlock is displayed as root failure with energy remaining and observer provenance', () => {
  const view = {status: 'failed', reason: 'deadlock_proven:stationary_resource_lock',
    referee: assessment, physicalActions: 26, world: {energy: 72}};
  const before = JSON.stringify(view);
  const copy = statusCopy(view);
  assert.match(copy.title, /死局.*失败/);
  assert.match(copy.body, /剩余能量 72/);
  assert.match(copy.body, /仅观察者可见，不提供给 G\/S/);
  assert.doesNotMatch(copy.body, /预算耗尽|模型判断/);
  assert.equal(JSON.stringify(view), before);
  assert.match(reasonText(view.reason), /死局/);
});

test('inconclusive or deferred referee evidence never promises a solvable world', () => {
  for (const reason of ['no_static_proof', 'pending_interventions']) {
    const copy = refereeCopy({...assessment, verdict: 'not-proven', reason, proof: undefined});
    assert.match(copy.title, /尚未证实/);
    assert.match(copy.body, /未证实不代表局面可解/);
    assert.match(copy.body, /仅观察者可见/);
  }
  assert.match(refereeCopy({...assessment, verdict: 'not-proven', reason: 'pending_interventions'}).body, /计划中的环境干预/);
  assert.equal(refereeCopy(undefined), null);
  assert.equal(refereeCopy({...assessment, observerOnly: false}), null);
});

test('outer referee evidence appears in the observer timeline without entering decision events', () => {
  const before = JSON.stringify(event);
  const keys = keyEvents([event]);
  assert.equal(keys.length, 1);
  assert.match(keys[0].title, /独立裁判.*死局/);
  assert.match(keys[0].detail, /不提供给 G\/S/);
  assert.equal(keys[0].raw, event);
  assert.equal(keyEvents([event], 9).length, 0);
  const wrapped = {...event, type: 'engine', data: {event: {type: 'deadlock_referee', data: event.data}}};
  assert.equal(keyEvents([wrapped]).length, 0);
  assert.equal(JSON.stringify(event), before);
});

test('routine inconclusive checks do not crowd the key timeline or fabricate a terminal event', () => {
  const inconclusive = {...event, data: {assessment: {...assessment, verdict: 'not-proven', reason: 'no_static_proof', proof: undefined}}};
  assert.equal(keyEvents([inconclusive]).length, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Roster } from '../js/roster.js';

const fakeStorage = (seed = null) => {
  const map = new Map(seed ? [['k', seed]] : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _map: map,
  };
};

test('starts empty', () => {
  assert.deepEqual(new Roster(fakeStorage(), 'k').list(), []);
});

test('remembers a device and lists it', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'aaa', name: 'pyDrone' }, 100);
  const [d] = r.list();
  assert.equal(d.id, 'aaa');
  assert.equal(d.name, 'pyDrone');
  assert.equal(d.alias, '');
});

test('remembering the same id updates rather than duplicates', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'aaa', name: 'pyDrone' }, 100);
  r.remember({ id: 'aaa', name: 'pyDrone' }, 200);
  assert.equal(r.list().length, 1);
  assert.equal(r.get('aaa').lastSeen, 200);
});

test('lists most recently used first', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'old' }, 100);
  r.remember({ id: 'new' }, 900);
  assert.deepEqual(r.list().map((d) => d.id), ['new', 'old']);
});

test('renaming survives and is trimmed and length-capped', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'aaa' }, 1);
  r.rename('aaa', '  Blue tape  ');
  assert.equal(r.get('aaa').alias, 'Blue tape');
  r.rename('aaa', 'x'.repeat(80));
  assert.equal(r.get('aaa').alias.length, 40);
});

test('renaming an unknown id is a no-op, not a crash', () => {
  const r = new Roster(fakeStorage(), 'k');
  assert.equal(r.rename('nope', 'x'), null);
});

test('forget removes only the target', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'a' }, 1);
  r.remember({ id: 'b' }, 2);
  r.forget('a');
  assert.deepEqual(r.list().map((d) => d.id), ['b']);
});

// Identically-named drones are the whole reason this module exists.
test('labels distinguish same-named drones', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'abcdef123', name: 'pyDrone' }, 1);
  r.remember({ id: 'zzz999xxx', name: 'pyDrone' }, 2);
  const [b, a] = r.list();
  assert.notEqual(r.label(a), r.label(b));
  assert.equal(r.label(a), 'pyDrone · abcdef');
  r.rename('abcdef123', 'Red');
  assert.equal(r.label(r.get('abcdef123')), 'Red');
});

test('a renamed drone shows its advertised name', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'a', name: 'pyDrone-Lab2' }, 1);
  assert.equal(r.label(r.get('a')), 'pyDrone-Lab2');
});

test('corrupt storage degrades to empty instead of throwing', () => {
  assert.deepEqual(new Roster(fakeStorage('{not json'), 'k').list(), []);
  assert.deepEqual(new Roster(fakeStorage('{"a":1}'), 'k').list(), []);
});

test('entries without an id are discarded', () => {
  const r = new Roster(fakeStorage('[{"name":"orphan"},{"id":"ok"}]'), 'k');
  assert.deepEqual(r.list().map((d) => d.id), ['ok']);
});

test('missing storage entirely does not throw', () => {
  const r = new Roster(undefined, 'k');
  assert.deepEqual(r.list(), []);
  assert.doesNotThrow(() => r.remember({ id: 'a' }, 1));
});

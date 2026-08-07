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

/* ── MAC handling ──────────────────────────────────────────────────── */

import { normalizeMac } from '../js/roster.js';

test('normalizes MACs from every format an operator might paste', () => {
  const want = 'ac:a7:04:1f:53:9e';
  for (const input of [
    'ac:a7:04:1f:53:9e',
    'AC:A7:04:1F:53:9E',
    'ac-a7-04-1f-53-9e',
    'aca7.041f.539e',
    'aca7041f539e',
    '  AC A7 04 1F 53 9E  ',
  ]) {
    assert.equal(normalizeMac(input), want, `input ${JSON.stringify(input)}`);
  }
});

test('rejects anything that is not twelve hex digits', () => {
  for (const bad of ['', null, undefined, 'nope', 'ac:a7:04:1f:53', 'ac:a7:04:1f:53:9e:ff', 'zz:zz:zz:zz:zz:zz']) {
    assert.equal(normalizeMac(bad), null, `input ${JSON.stringify(bad)}`);
  }
});

test('stores a normalized MAC against a drone', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'a' }, 1);
  assert.ok(r.setMac('a', 'AC-A7-04-1F-53-9E'));
  assert.equal(r.get('a').mac, 'ac:a7:04:1f:53:9e');
});

test('rejects a malformed MAC without clobbering the stored one', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'a' }, 1);
  r.setMac('a', 'ac:a7:04:1f:53:9e');
  assert.equal(r.setMac('a', 'garbage'), null);
  assert.equal(r.get('a').mac, 'ac:a7:04:1f:53:9e', 'previous MAC survives a bad edit');
});

test('an empty MAC clears the field', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'a' }, 1);
  r.setMac('a', 'ac:a7:04:1f:53:9e');
  assert.ok(r.setMac('a', '   '));
  assert.equal(r.get('a').mac, '');
});

test('setMac on an unknown drone is a no-op', () => {
  assert.equal(new Roster(fakeStorage(), 'k').setMac('nope', 'ac:a7:04:1f:53:9e'), null);
});

test('finds a drone by MAC in any input format', () => {
  const r = new Roster(fakeStorage(), 'k');
  r.remember({ id: 'a', name: 'pyDrone' }, 1);
  r.remember({ id: 'b', name: 'pyDrone' }, 2);
  r.setMac('b', 'ac:a7:04:1f:53:9e');
  assert.equal(r.byMac('ACA7041F539E').id, 'b');
  assert.equal(r.byMac('ac:a7:04:1f:53:9f'), null);
  assert.equal(r.byMac('junk'), null);
});

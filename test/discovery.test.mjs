// Regression guard for the bug that hid the drone from Chrome's picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISCOVERY_FILTERS } from '../js/drone.js';
import { NUS_SERVICE } from '../js/protocol.js';

// macOS caches a peripheral's GAP name and Chrome filters on that cached
// value. This airframe caches as "ESP32" while advertising "pyDrone", so a
// name-only filter matched nothing and the drone never appeared in the picker.
test('discovery matches on the advertised service, not just the name', () => {
  const byService = DISCOVERY_FILTERS.find((f) => f.services);
  assert.ok(byService, 'a service-based filter must exist');
  assert.deepEqual(byService.services, [NUS_SERVICE]);
});

test('the cached-name case is covered too', () => {
  const prefixes = DISCOVERY_FILTERS.filter((f) => f.namePrefix).map((f) => f.namePrefix);
  assert.ok(prefixes.includes('pyDrone'), 'advertised name');
  assert.ok(prefixes.includes('ESP32'), 'macOS-cached GAP name');
});

// Chrome rejects a filter entry that carries no matchable criterion.
test('every filter entry is valid for requestDevice', () => {
  assert.ok(DISCOVERY_FILTERS.length > 0);
  for (const f of DISCOVERY_FILTERS) {
    const keys = Object.keys(f);
    assert.ok(keys.length > 0, 'empty filter entry would throw');
    assert.ok(
      f.services?.length || f.namePrefix || f.name,
      `filter must carry a criterion: ${JSON.stringify(f)}`
    );
  }
});

test('no filter entry is an accept-all in disguise', () => {
  for (const f of DISCOVERY_FILTERS) {
    assert.notEqual(f.namePrefix, '', 'an empty prefix matches every device');
  }
});

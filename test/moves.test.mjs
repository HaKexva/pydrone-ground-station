import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Moves, TUNING } from '../js/moves.js';

/** Records what the drone was told, and how long each wait was. */
function rig(tuning = {}) {
  const calls = [];
  const drone = {
    setAxes: (a) => calls.push(['axes', a]),
    neutral: () => calls.push(['neutral']),
    takeoff: () => calls.push(['takeoff']),
    land: () => calls.push(['land']),
    estop: () => calls.push(['estop']),
  };
  const sleep = async (s) => { calls.push(['sleep', s]); };
  return { calls, moves: new Moves(drone, { sleep, tuning }) };
}

const axesOf = (calls) => calls.filter((c) => c[0] === 'axes').map((c) => c[1]);
const sleeps = (calls) => calls.filter((c) => c[0] === 'sleep').map((c) => c[1]);

test('forward deflects pitch, holds, then recentres', async () => {
  const { calls, moves } = rig();
  await moves.forward(2);
  assert.deepEqual(calls[0], ['axes', { pitch: TUNING.pitchPower }]);
  assert.deepEqual(calls[1], ['sleep', 2]);
  assert.deepEqual(calls[2], ['neutral']);
  assert.deepEqual(calls[3], ['sleep', TUNING.recentreFor]);
});

test('back is forward with the sign flipped', async () => {
  const { calls, moves } = rig();
  await moves.back(1);
  assert.deepEqual(axesOf(calls), [{ pitch: -TUNING.pitchPower }]);
});

test('left and right move the roll axis in opposite directions', async () => {
  const l = rig(); await l.moves.left(1);
  const r = rig(); await r.moves.right(1);
  assert.equal(axesOf(l.calls)[0].roll, -TUNING.rollPower);
  assert.equal(axesOf(r.calls)[0].roll, TUNING.rollPower);
});

test('up and down move thrust, not pitch', async () => {
  const u = rig(); await u.moves.up(1);
  assert.deepEqual(axesOf(u.calls), [{ thrust: TUNING.thrustPower }]);
  const d = rig(); await d.moves.down(1);
  assert.deepEqual(axesOf(d.calls), [{ thrust: -TUNING.thrustPower }]);
});

// The whole point of the yaw rate constant: degrees have to become time.
test('a turn converts degrees to seconds via the yaw rate', async () => {
  const { calls, moves } = rig({ yawRateDegPerSec: 90 });
  await moves.turn_right(90);
  assert.equal(sleeps(calls)[0], 1, '90 deg at 90 deg/s is one second');
});

test('turning further takes proportionally longer', async () => {
  const { moves } = rig({ yawRateDegPerSec: 45 });
  assert.equal(moves.secondsForTurn(90), 2);
  assert.equal(moves.secondsForTurn(180), 4);
  assert.equal(moves.secondsForTurn(45), 1);
});

test('turn_left is the same duration, opposite yaw', async () => {
  const { calls, moves } = rig({ yawRateDegPerSec: 90 });
  await moves.turn_left(90);
  assert.equal(axesOf(calls)[0].yaw, -TUNING.yawPower);
  assert.equal(sleeps(calls)[0], 1);
});

test('a negative angle still turns, it does not rewind time', async () => {
  const { moves } = rig({ yawRateDegPerSec: 90 });
  assert.equal(moves.secondsForTurn(-90), 1);
});

test('a zero yaw rate cannot divide by zero', async () => {
  const { moves } = rig({ yawRateDegPerSec: 0 });
  assert.equal(moves.secondsForTurn(90), 0);
});

test('take off waits for the drone to settle before the next brick', async () => {
  const { calls, moves } = rig({ settleAfterTakeoff: 3 });
  await moves.take_off();
  assert.deepEqual(calls, [['takeoff'], ['sleep', 3]]);
});

test('land waits too', async () => {
  const { calls, moves } = rig({ settleAfterLand: 2 });
  await moves.land();
  assert.deepEqual(calls, [['land'], ['sleep', 2]]);
});

// Stopping must never depend on the clock or on a promise resolving.
test('stop is synchronous and cuts motors immediately', () => {
  const { calls, moves } = rig();
  const result = moves.stop();
  assert.equal(result, undefined, 'stop returns nothing to await');
  assert.deepEqual(calls, [['estop']]);
});

test('durations are clamped so a typo cannot fly away for an hour', async () => {
  const { calls, moves } = rig();
  await moves.forward(9999);
  assert.equal(sleeps(calls)[0], 30);
});

test('a negative or junk duration becomes zero, not NaN', async () => {
  const a = rig(); await a.moves.forward(-5);
  assert.equal(sleeps(a.calls)[0], 0);
  const b = rig(); await b.moves.forward('banana');
  assert.equal(sleeps(b.calls)[0], 0);
});

test('power can be overridden per move', async () => {
  const { calls, moves } = rig();
  await moves.forward(1, 10);
  assert.equal(axesOf(calls)[0].pitch, 10);
});

test('wait holds position without touching the sticks', async () => {
  const { calls, moves } = rig();
  await moves.wait(1.5);
  assert.deepEqual(calls, [['sleep', 1.5]]);
});

test('an aborting sleep propagates instead of continuing the program', async () => {
  const drone = { setAxes() {}, neutral() {}, takeoff() {}, land() {}, estop() {} };
  const moves = new Moves(drone, { sleep: async () => { throw new Error('Stopped'); } });
  await assert.rejects(() => moves.forward(1), /Stopped/);
});

test('onStep reports each move for the log and the highlighting', async () => {
  const seen = [];
  const drone = { setAxes() {}, neutral() {}, takeoff() {}, land() {}, estop() {} };
  const moves = new Moves(drone, { sleep: async () => {}, onStep: (n) => seen.push(n) });
  await moves.take_off();
  await moves.forward(1);
  await moves.turn_right(90);
  await moves.land();
  assert.deepEqual(seen, ['take_off', 'forward', 'turn_right', 'land']);
});

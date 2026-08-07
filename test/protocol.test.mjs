import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAxis, encodeFrame, decodeTelemetry, thrustPercent } from '../js/protocol.js';

const frame = (hex) =>
  new DataView(Uint8Array.from(hex.split(' ').map((x) => parseInt(x, 16))).buffer);

// The firmware's own stick decode, transcribed from the vendor docs and
// confirmed against measured echoes. Our encoder must invert exactly this.
const droneDecode = (b) => (b <= 100 ? b - 100 : b > 155 ? b - 155 : 0);

test('axis encoding inverts the firmware mapping', () => {
  for (const v of [-100, -75, -40, -1, 0, 1, 40, 45, 65, 100]) {
    assert.equal(droneDecode(encodeAxis(v)), v, `axis ${v}`);
  }
});

test('axis encoding clamps out-of-range input', () => {
  assert.equal(encodeAxis(500), 255);
  assert.equal(encodeAxis(-500), 0);
});

test('zero lands in the centre of the deadzone', () => {
  assert.equal(encodeAxis(0), 128);
  assert.equal(droneDecode(128), 0);
});

test('control frame is 8 bytes with byte 0 as header, not an axis', () => {
  const f = encodeFrame({ roll: 100, pitch: -100, yaw: 0, thrust: 50, btn: 24 });
  assert.equal(f.length, 8);
  assert.equal(f[0], 128, 'header');
  assert.equal(f[1], 255, 'roll');
  assert.equal(f[2], 0, 'pitch');
  assert.equal(f[3], 128, 'yaw');
  assert.equal(f[5], 24, 'button');
  assert.deepEqual([f[6], f[7]], [0, 0]);
});

// Measured on hardware: tx byte 200 -> echoed 45, byte 60 -> -40, byte 128 -> 0.
test('matches measured stick echoes', () => {
  assert.equal(droneDecode(200), 45);
  assert.equal(droneDecode(60), -40);
  assert.equal(droneDecode(128), 0);
});

// Measured thrust percentages reported by the drone for each transmitted byte.
test('thrust is a percentage centred on 50', () => {
  for (const [byte, pct] of [[128, 50], [200, 72.5], [60, 30], [170, 57.5], [180, 62.5]]) {
    assert.equal(thrustPercent(droneDecode(byte)), pct, `byte ${byte}`);
  }
});

test('decodes a real telemetry frame captured from the drone', () => {
  const t = decodeTelemetry(frame('81 6b 80 0e 5d e4 80 00 80 00 80 00 80 32 81 84 7f 25'));
  assert.equal(t.roll, 3.63);
  assert.equal(t.pitch, 0.14);
  assert.equal(t.thrust, 50);
  assert.equal(t.battery, 3.88);
});

test('decodes a second captured frame', () => {
  const t = decodeTelemetry(frame('80 f1 7f ff 80 8b 80 00 80 00 80 00 80 03 81 83 7f e3'));
  assert.equal(t.roll, 2.41);
  assert.equal(t.pitch, -0.01);
  assert.equal(t.battery, 3.87);
  assert.equal(t.alt, -29);
});

test('rejects short frames rather than decoding garbage', () => {
  assert.equal(decodeTelemetry(frame('80 f1 7f ff')), null);
});

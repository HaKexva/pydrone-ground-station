// pyDrone BLE protocol — Nordic UART Service.
// Byte layout and scaling were reverse-engineered against the hardware;
// see README for the measurements behind each constant.

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // we write
export const NUS_TX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // drone notifies

export const BTN = {
  NONE: 0,
  TAKEOFF: 24,   // Y
  LAND: 72,      // A
  AUX: 40,       // B
  ESTOP: 136,    // X
};

// Axis value (-100..100) -> raw byte.
// The drone maps: byte<=100 -> byte-100, 100<byte<=155 -> 0, byte>155 -> byte-155.
// Inverting that, with 0 landing squarely in the middle of the deadzone.
export function encodeAxis(v) {
  const c = Math.max(-100, Math.min(100, Math.round(v)));
  if (c === 0) return 128;
  return c > 0 ? 155 + c : 100 + c;
}

// Build the 8-byte control frame.
// Byte 0 is a header the drone never echoes — it is NOT an axis.
export function encodeFrame({ roll = 0, pitch = 0, yaw = 0, thrust = 0, btn = 0 } = {}) {
  return new Uint8Array([
    128,
    encodeAxis(roll),
    encodeAxis(pitch),
    encodeAxis(yaw),
    encodeAxis(thrust),
    btn & 0xff,
    0,
    0,
  ]);
}

// 18-byte state frame: 9 big-endian uint16, each biased by +32768.
export function decodeTelemetry(dv) {
  if (dv.byteLength < 18) return null;
  const v = [];
  for (let i = 0; i < 9; i++) v.push(dv.getUint16(i * 2, false) - 32768);
  return {
    roll:     v[0] / 100,   // degrees
    pitch:    v[1] / 100,
    yaw:      v[2] / 100,
    inRoll:   v[3] / 10,    // echoed stick input, -100..100
    inPitch:  v[4] / 10,
    inYaw:    v[5] / 200,
    thrust:   v[6],         // percent, 50 = neutral
    battery:  v[7] / 100,   // volts
    alt:      v[8],         // raw baro counts — noisy, do not trust as height
    raw: v,
  };
}

// Thrust axis (-100..100) as the drone will report it (percent, 50 = neutral).
export const thrustPercent = (axis) => 50 + axis / 2;

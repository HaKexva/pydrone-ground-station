import {
  NUS_SERVICE, NUS_RX, NUS_TX, BTN,
  encodeFrame, decodeTelemetry,
} from './protocol.js';

const TX_HZ = 20;
const TX_PERIOD = 1000 / TX_HZ;

// The drone only answers when polled, so the transmit loop doubles as the
// link's heartbeat: stop sending and it stops hearing us.
export class Drone extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
    this.connected = false;
    this.telemetry = null;
    this.lastFrameAt = 0;

    this.axes = { roll: 0, pitch: 0, yaw: 0, thrust: 0 };
    this._btn = BTN.NONE;
    this._btnUntil = 0;
    this._timer = null;
    this._writing = false;
    this._dropped = 0;
    this._sent = 0;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async connect() {
    if (!Drone.supported) {
      throw new Error('Web Bluetooth unavailable. Use Chrome or Edge — Safari and Firefox do not implement it.');
    }
    this.#emit('status', { phase: 'requesting', message: 'waiting for device pick' });

    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'pyDrone' }],
      optionalServices: [NUS_SERVICE],
    });
    this.device.addEventListener('gattserverdisconnected', () => this.#onDrop());

    this.#emit('status', { phase: 'connecting', message: 'opening GATT' });
    const server = await this.device.gatt.connect();
    const svc = await server.getPrimaryService(NUS_SERVICE);
    this.rxChar = await svc.getCharacteristic(NUS_RX);
    this.txChar = await svc.getCharacteristic(NUS_TX);

    await this.txChar.startNotifications();
    this.txChar.addEventListener('characteristicvaluechanged', (e) => {
      const t = decodeTelemetry(e.target.value);
      if (!t) return;
      this.telemetry = t;
      this.lastFrameAt = performance.now();
      this.#emit('telemetry', t);
    });

    this.connected = true;
    this.neutral();
    this.#startLoop();
    this.#emit('status', { phase: 'connected', message: this.device.name || 'pyDrone' });
    this.#emit('connected');
    return this;
  }

  async disconnect() {
    this.#stopLoop();
    if (this.device?.gatt?.connected) {
      try { await this.#write(encodeFrame({ btn: BTN.ESTOP })); } catch { /* link may already be gone */ }
      this.device.gatt.disconnect();
    }
    this.#onDrop();
  }

  #onDrop() {
    if (!this.connected && !this.device) return;
    this.connected = false;
    this.#stopLoop();
    this.rxChar = this.txChar = null;
    this.#emit('status', { phase: 'disconnected', message: 'link lost' });
    this.#emit('disconnected');
  }

  #startLoop() {
    this.#stopLoop();
    this._timer = setInterval(() => this.#tick(), TX_PERIOD);
  }

  #stopLoop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  // Web Bluetooth rejects overlapping writes on the same characteristic.
  // Dropping a frame is correct here — the next one is 50 ms away and carries
  // the same state, so a stale queued frame is strictly worse than a gap.
  async #write(bytes) {
    if (!this.rxChar) return false;
    if (this._writing) { this._dropped++; return false; }
    this._writing = true;
    try {
      await this.rxChar.writeValueWithoutResponse(bytes);
      this._sent++;
      return true;
    } catch (err) {
      this.#emit('error', err);
      return false;
    } finally {
      this._writing = false;
    }
  }

  #tick() {
    if (!this.connected) return;
    let btn = BTN.NONE;
    if (this._btn && performance.now() < this._btnUntil) btn = this._btn;
    else this._btn = BTN.NONE;

    const frame = encodeFrame({ ...this.axes, btn });
    this.#write(frame);
    this.#emit('tx', { frame, btn, axes: { ...this.axes } });
  }

  // --- control surface -----------------------------------------------------

  setAxes(partial) {
    Object.assign(this.axes, partial);
    for (const k of ['roll', 'pitch', 'yaw', 'thrust']) {
      this.axes[k] = Math.max(-100, Math.min(100, this.axes[k] || 0));
    }
    return this.axes;
  }

  neutral() {
    this.axes = { roll: 0, pitch: 0, yaw: 0, thrust: 0 };
  }

  // Buttons are level-triggered on the drone, so hold them for a few frames.
  pressButton(code, ms = 300) {
    this._btn = code;
    this._btnUntil = performance.now() + ms;
  }

  takeoff() { this.pressButton(BTN.TAKEOFF, 400); this.#emit('command', 'takeoff'); }
  land()    { this.pressButton(BTN.LAND, 400);    this.#emit('command', 'land'); }

  // Cut first, ask later: zero the sticks in the same frame as the stop byte
  // so nothing is left commanding thrust if the button window lapses.
  estop() {
    this.neutral();
    this.pressButton(BTN.ESTOP, 800);
    this.#emit('command', 'estop');
  }

  get stats() {
    return { sent: this._sent, dropped: this._dropped };
  }
}

export { BTN };

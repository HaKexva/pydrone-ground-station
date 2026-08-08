// Kid-facing motion API.
//
// The drone only understands raw stick axes, so "fly forward for 1.2 s" has to
// be built here: deflect, hold, recentre. Everything a brick or a Python script
// can ask for lands in this file.

export const TUNING = {
  pitchPower: 35,      // stick deflection, -100..100
  rollPower: 35,
  yawPower: 60,
  thrustPower: 30,

  // Degrees per second at yawPower. MUST be measured on the real airframe —
  // the default is a guess, and turn_right() will over- or under-rotate until
  // someone times a full circle and corrects it.
  yawRateDegPerSec: 90,

  settleAfterTakeoff: 3.0,
  settleAfterLand: 3.0,
  recentreFor: 0.25,   // brief neutral hold so moves do not blend into each other
};

const clampSeconds = (s) => Math.max(0, Math.min(30, Number(s) || 0));

export class Moves {
  /**
   * @param drone  anything with setAxes/neutral/takeoff/land/estop
   * @param sleep  async (seconds) => void — abort-aware, supplied by the caller
   * @param tuning overrides for TUNING
   * @param onStep optional (name, detail) => void, for UI highlighting and logs
   */
  constructor(drone, { sleep, tuning = {}, onStep = () => {} } = {}) {
    this.drone = drone;
    this.sleep = sleep;
    this.t = { ...TUNING, ...tuning };
    this.onStep = onStep;
  }

  async #hold(axes, seconds, label) {
    this.onStep(label, { axes, seconds });
    this.drone.setAxes(axes);
    await this.sleep(clampSeconds(seconds));
    this.drone.neutral();
    if (this.t.recentreFor) await this.sleep(this.t.recentreFor);
  }

  async take_off() {
    this.onStep('take_off', {});
    this.drone.takeoff();
    await this.sleep(this.t.settleAfterTakeoff);
  }

  async land() {
    this.onStep('land', {});
    this.drone.land();
    await this.sleep(this.t.settleAfterLand);
  }

  /** Cuts motors. Never awaits — stopping must not depend on the clock. */
  stop() {
    this.onStep('stop', {});
    this.drone.estop();
  }

  forward(seconds = 1, power = this.t.pitchPower) {
    return this.#hold({ pitch: power }, seconds, 'forward');
  }
  back(seconds = 1, power = this.t.pitchPower) {
    return this.#hold({ pitch: -power }, seconds, 'back');
  }
  left(seconds = 1, power = this.t.rollPower) {
    return this.#hold({ roll: -power }, seconds, 'left');
  }
  right(seconds = 1, power = this.t.rollPower) {
    return this.#hold({ roll: power }, seconds, 'right');
  }
  up(seconds = 1, power = this.t.thrustPower) {
    return this.#hold({ thrust: power }, seconds, 'up');
  }
  down(seconds = 1, power = this.t.thrustPower) {
    return this.#hold({ thrust: -power }, seconds, 'down');
  }

  /** Turn by angle, converting degrees to a hold time via the measured yaw rate. */
  turn_right(degrees = 90) {
    return this.#hold({ yaw: this.t.yawPower }, this.secondsForTurn(degrees), 'turn_right');
  }
  turn_left(degrees = 90) {
    return this.#hold({ yaw: -this.t.yawPower }, this.secondsForTurn(degrees), 'turn_left');
  }

  secondsForTurn(degrees) {
    const rate = this.t.yawRateDegPerSec;
    if (!rate) return 0;
    return Math.abs(Number(degrees) || 0) / rate;
  }

  async wait(seconds = 1) {
    this.onStep('wait', { seconds });
    await this.sleep(clampSeconds(seconds));
  }
}

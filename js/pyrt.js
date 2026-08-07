// Python scripting runtime.
// The drone firmware has no REPL over BLE — it speaks a fixed binary protocol —
// so Python runs here in the browser (Pyodide) and drives the BLE link.

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const PRELUDE = `
import js

class ScriptAborted(Exception):
    pass

def _check():
    if js._bridge.aborted:
        raise ScriptAborted("aborted by operator")

async def sleep(seconds):
    """Non-blocking sleep that stays responsive to ABORT and E-STOP."""
    _check()
    remaining = float(seconds)
    while remaining > 0:
        step = 0.05 if remaining > 0.05 else remaining
        await js._bridge.delay(step * 1000)
        remaining -= step
        _check()

class _Drone:
    @property
    def connected(self):
        return bool(js._bridge.connected)

    @property
    def state(self):
        """Latest telemetry as a dict, or None before the first frame."""
        t = js._bridge.snapshot()
        return t.to_py() if t is not None else None

    @property
    def battery(self):
        s = self.state
        return s['battery'] if s else None

    def set(self, roll=None, pitch=None, yaw=None, thrust=None):
        """Set stick axes, each -100..100. Unspecified axes keep their value."""
        _check()
        js._bridge.setAxes(roll, pitch, yaw, thrust)

    def neutral(self):
        _check()
        js._bridge.setAxes(0, 0, 0, 0)

    async def hold(self, seconds, **axes):
        """Apply axes and hold them for a duration, then return to neutral."""
        if axes:
            self.set(**axes)
        await sleep(seconds)
        self.neutral()

    async def takeoff(self, settle=3.0):
        _check()
        js._bridge.takeoff()
        await sleep(settle)

    async def land(self, settle=3.0):
        _check()
        js._bridge.land()
        await sleep(settle)

    def stop(self):
        """Emergency stop. Cuts motors immediately."""
        js._bridge.estop()

drone = _Drone()
print = js._bridge.print
`;

export class PyRuntime {
  constructor(drone, log) {
    this.drone = drone;
    this.log = log;
    this.pyodide = null;
    this.loading = null;
    this.running = false;
    this.aborted = false;
  }

  get ready() { return !!this.pyodide; }

  async load() {
    if (this.pyodide) return this.pyodide;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      this.log('loading Python runtime (~10 MB, cached after first load)…', 'warn');
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PYODIDE_URL + 'pyodide.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('could not fetch Pyodide — check your network'));
        document.head.appendChild(s);
      });

      const pyodide = await globalThis.loadPyodide({ indexURL: PYODIDE_URL });
      globalThis._bridge = this.#bridge();
      pyodide.registerJsModule('_station', { bridge: globalThis._bridge });
      await pyodide.runPythonAsync(PRELUDE);

      this.pyodide = pyodide;
      this.log(`Python ${pyodide.version.split(' ')[0]} ready — 'drone' is in scope`, 'ok');
      return pyodide;
    })();

    try {
      return await this.loading;
    } catch (err) {
      this.loading = null;
      this.log(String(err.message || err), 'err');
      throw err;
    }
  }

  #bridge() {
    const d = this.drone;
    const rt = this;
    return {
      get aborted() { return rt.aborted; },
      get connected() { return d.connected; },
      snapshot: () => d.telemetry,
      delay: (ms) => new Promise((r) => setTimeout(r, ms)),
      setAxes: (roll, pitch, yaw, thrust) => {
        const patch = {};
        if (roll   !== undefined && roll   !== null) patch.roll   = roll;
        if (pitch  !== undefined && pitch  !== null) patch.pitch  = pitch;
        if (yaw    !== undefined && yaw    !== null) patch.yaw    = yaw;
        if (thrust !== undefined && thrust !== null) patch.thrust = thrust;
        d.setAxes(patch);
      },
      takeoff: () => { rt.log('script: takeoff', 'ok'); d.takeoff(); },
      land:    () => { rt.log('script: land', 'ok'); d.land(); },
      estop:   () => { rt.log('script: EMERGENCY STOP', 'err'); d.estop(); },
      print:   (...args) => rt.log(args.map(String).join(' ')),
    };
  }

  async run(code) {
    if (this.running) { this.log('a script is already running', 'warn'); return; }
    if (!this.drone.connected) { this.log('not connected — refusing to run', 'err'); return; }

    await this.load();
    this.aborted = false;
    this.running = true;
    this.log('── run ──────────────────────────────');

    try {
      // Wrapped in a coroutine so top-level `await` works in user code.
      const indented = code.split('\n').map((l) => '    ' + l).join('\n');
      await this.pyodide.runPythonAsync(
        `async def __main__():\n${indented || '    pass'}\n\nawait __main__()`
      );
      this.log('── done ─────────────────────────────', 'ok');
    } catch (err) {
      const msg = String(err.message || err);
      if (msg.includes('ScriptAborted')) this.log('script aborted — sticks neutralised', 'warn');
      else this.log(msg.split('\n').slice(-12).join('\n'), 'err');
    } finally {
      this.running = false;
      // Whatever happened, do not leave the drone holding a stale command.
      this.drone.neutral();
    }
  }

  abort() {
    if (!this.running) return;
    this.aborted = true;
    this.drone.neutral();
    this.log('abort requested', 'warn');
  }
}

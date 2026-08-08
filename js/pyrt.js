// Python scripting runtime.
//
// The drone firmware has no REPL over BLE — it only speaks a fixed binary
// protocol — so Python runs here in the browser (Pyodide) and drives the same
// Moves object the bricks do. Whatever a child can build with bricks, they can
// write in Python, and it takes the identical path to the hardware.

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const PRELUDE = `
import js

class Stopped(Exception):
    pass

async def sleep(seconds):
    """Wait, while staying responsive to the Stop button."""
    await js._bridge.sleep(float(seconds))

class _Drone:
    @property
    def connected(self):
        return bool(js._bridge.connected)

    @property
    def state(self):
        t = js._bridge.state()
        return t.to_py() if t is not None else None

    @property
    def battery(self):
        s = self.state
        return s['battery'] if s else None

    async def take_off(self):
        await js._bridge.take_off()

    async def land(self):
        await js._bridge.land()

    def stop(self):
        js._bridge.stop()

    async def forward(self, seconds=1.0):
        await js._bridge.forward(float(seconds))

    async def back(self, seconds=1.0):
        await js._bridge.back(float(seconds))

    async def left(self, seconds=1.0):
        await js._bridge.left(float(seconds))

    async def right(self, seconds=1.0):
        await js._bridge.right(float(seconds))

    async def up(self, seconds=1.0):
        await js._bridge.up(float(seconds))

    async def down(self, seconds=1.0):
        await js._bridge.down(float(seconds))

    async def turn_right(self, degrees=90):
        await js._bridge.turn_right(float(degrees))

    async def turn_left(self, degrees=90):
        await js._bridge.turn_left(float(degrees))

drone = _Drone()
print = js._bridge.print
`;

export class PyRuntime {
  constructor({ moves, drone, sleep, log, lang }) {
    this.moves = moves;
    this.drone = drone;
    this.sleep = sleep;
    this.log = log;
    this.lang = lang || (() => 'en');
    this.pyodide = null;
    this.loading = null;
    this.running = false;
    this.aborted = false;
  }

  get ready() { return !!this.pyodide; }

  #bridge() {
    const { moves, drone } = this;
    const rt = this;
    return {
      get connected() { return drone.connected; },
      state: () => drone.telemetry,
      sleep: (s) => rt.sleep(s),
      print: (...a) => rt.log(a.map(String).join(' ')),
      take_off: () => moves.take_off(),
      land: () => moves.land(),
      stop: () => moves.stop(),
      forward: (s) => moves.forward(s),
      back: (s) => moves.back(s),
      left: (s) => moves.left(s),
      right: (s) => moves.right(s),
      up: (s) => moves.up(s),
      down: (s) => moves.down(s),
      turn_right: (d) => moves.turn_right(d),
      turn_left: (d) => moves.turn_left(d),
    };
  }

  async load() {
    if (this.pyodide) return this.pyodide;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      this.log(this.#s('pyLoading'));
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PYODIDE_URL + 'pyodide.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Could not download Python. Check the network.'));
        document.head.appendChild(s);
      });

      const pyodide = await globalThis.loadPyodide({ indexURL: PYODIDE_URL });
      globalThis._bridge = this.#bridge();
      await pyodide.runPythonAsync(PRELUDE);
      this.pyodide = pyodide;
      this.log(this.#s('pyReady'));
      return pyodide;
    })();

    try {
      return await this.loading;
    } catch (err) {
      this.loading = null;
      this.log(String(err.message || err), 'bad');
      throw err;
    }
  }

  #s(key) {
    // Strings live in i18n.js; the runtime only needs these two.
    const zh = { pyLoading: '正在載入 Python（大約 10 MB，第一次比較久）…', pyReady: 'Python 準備好了。' };
    const en = { pyLoading: 'Loading Python (about 10 MB, slow the first time)…', pyReady: 'Python is ready.' };
    return (this.lang() === 'zh-TW' ? zh : en)[key];
  }

  async run(code) {
    if (this.running) return;
    await this.load();
    this.aborted = false;
    this.running = true;

    try {
      // Wrapped in a coroutine so top-level `await` works in a child's script.
      const indented = code.split('\n').map((l) => '    ' + l).join('\n');
      await this.pyodide.runPythonAsync(
        `async def __main__():\n${indented || '    pass'}\n\nawait __main__()`
      );
    } catch (err) {
      const msg = String(err.message || err);
      // Pyodide prepends a long JS traceback; the last lines are the Python one.
      this.log(msg.split('\n').filter(Boolean).slice(-8).join('\n'), 'bad');
    } finally {
      this.running = false;
      this.drone.neutral();
    }
  }

  abort() {
    if (!this.running) return;
    this.aborted = true;
    this.drone.neutral();
  }
}

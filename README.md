# pyDrone Ground Station

A Web Bluetooth ground control station for the [01Studio pyDrone](https://wiki.01studio.cc/en/docs/pydrone/),
built to run as a static GitHub Pages site. Live telemetry, virtual sticks, and
in-browser Python scripting — no install, no native app.

## Browser support

**Chrome or Edge only** (desktop or Android). Safari and Firefox do not implement
the Web Bluetooth API and cannot connect. The page must be served over HTTPS or
`localhost`; GitHub Pages satisfies this.

## Run locally

```bash
npm run serve          # http://localhost:8765
npm test               # protocol tests
```

ES modules require a real server — opening `index.html` from `file://` will not work.

## Deploy

Push to a repo and enable Pages (Settings → Pages → deploy from branch, root).
No build step; everything is static.

## The protocol

Reverse-engineered against the hardware, because the vendor docs are partial and
their byte numbering is 1-indexed in a way that is easy to misread.

**Transport:** Nordic UART Service over BLE. The drone advertises as `pyDrone`.

| UUID | Direction |
|---|---|
| `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | service |
| `6e400002-…` | write — control frames |
| `6e400003-…` | notify — telemetry |

**Control frame — 8 bytes:**

```
[0] header (always 128, NOT an axis — the drone never echoes it)
[1] roll     [2] pitch     [3] yaw     [4] thrust
[5] buttons  [6] unused    [7] unused
```

Axis bytes decode on the drone as `≤100 → v−100`, `100–155 → 0`, `>155 → v−155`,
giving −100..100 with a deadzone around centre. Thrust is special: the drone reports
it as a **percentage centred on 50**, i.e. `pct = 50 + axis/2`.

Buttons: `24` takeoff · `72` land · `40` aux · `136` emergency stop.

**Telemetry — 18 bytes**, nine big-endian `uint16` each biased by `+32768`:

```
roll×100  pitch×100  yaw×100  in_roll×10  in_pitch×10  in_yaw×200
thrust%   battery×100  baro
```

The drone is **poll-response**: it sends nothing until you send a control frame.
The 20 Hz transmit loop is therefore also the link heartbeat.

## Operating notes

Learned the hard way on real hardware:

- **Calibrate before anything.** Level surface, press reset, wait ~10 s for the blue
  LED to go **solid**. Green LED only means the BLE link is up. Without a solid blue
  the drone stays locked and silently ignores takeoff.
- **Thrust does nothing while landed.** The firmware accepts and echoes the value but
  does not route it to the motors. The only way to spin props is a real `take_off()` —
  there is no bench-test or motor-only mode in this protocol.
- **Props off for first tests.** Motor torque alone is enough to skitter and flip the
  airframe on a desk.
- **Watch the battery under load.** A 400 mAh 1S sagging from 3.85 V to ~3.0 V on
  spin-up points at a stalling or damaged motor.
- **`baro` is noise on the bench.** It swings ±100 counts from vibration with no props
  fitted. Do not treat it as height. Flagged with a ⚠ in the UI for that reason.
- **IMU mounting offset is real.** A constant few degrees of roll at rest survives a
  successful calibration. Use the **Trim** button to zero the *display*; it does not
  send anything to the drone.
- The firmware cuts motors on its own past **60°** of tilt.

## Failsafes

- E-STOP is always reachable, including the space bar, and zeroes the sticks in the
  same frame as the stop byte.
- Takeoff is press-and-hold (1.2 s) so it cannot be triggered by a stray click.
- Window blur, tab hide, and pointer-cancel all neutralise the sticks immediately.
- A running Python script is aborted by E-STOP, and the sticks are neutralised in a
  `finally` block whatever way the script exits.

## Python scripting

The drone firmware has **no REPL over BLE** — it only speaks the fixed binary protocol
above. So Python runs in the browser via Pyodide and drives the BLE link from there.
Pyodide (~10 MB) loads lazily on first Run and is cached afterwards.

```python
await drone.takeoff(settle=3.0)
await drone.land(settle=3.0)
drone.stop()                              # emergency, cuts motors
drone.set(roll=0, pitch=0, yaw=0, thrust=0)   # each -100..100
drone.neutral()
await drone.hold(1.2, pitch=35)           # apply, wait, recentre
await sleep(0.25)                         # abort-aware
drone.state                               # dict of live telemetry
drone.battery                             # volts
drone.connected
```

Top-level `await` is supported — the editor body is wrapped in a coroutine.

## Layout

```
index.html          page shell
css/station.css     styling
js/protocol.js      pure encode/decode, no I/O — this is what the tests cover
js/drone.js         BLE connection, 20 Hz transmit loop, failsafes
js/pyrt.js          Pyodide runtime and the Python-facing API
js/ui.js            dashboard, sticks, keyboard, wiring
test/               protocol tests, including real captured frames
```

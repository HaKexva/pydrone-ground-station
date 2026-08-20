# 紙飛行俱樂部 · Paper Flight Club

Fly an [01Studio pyDrone](https://wiki.01studio.cc/en/docs/pydrone/) from a web
page, by snapping bricks together and reading the real Python they generate.
Built for 8–12 year olds. Static site, no install, no build step.

Interface is Traditional Chinese (Taiwan) by default, with an English toggle.

## Browser support

**Chrome or Edge only** (desktop or Android). Safari and Firefox do not
implement Web Bluetooth and cannot connect at all. The page must be served over
HTTPS or `localhost`; GitHub Pages satisfies that.

## Run locally

```bash
npm run serve      # http://localhost:8765
npm test           # 73 tests
```

ES modules need a real server — opening `index.html` from `file://` will not work.

## How it fits together

```
index.html        page shell + inlined Lucide icon sprite
css/paper.css     the craft-table look
js/protocol.js    BLE frame encode/decode — pure, no I/O
js/drone.js       connection, 20 Hz transmit loop, failsafes
js/roster.js      known drones, aliases, operator-entered MACs
js/moves.js       forward / turn_right / land — built on raw stick axes
js/bricks.js      brick model, Python codegen, brick outline geometry
js/i18n.js        zh-TW and en strings
js/pyrt.js        Pyodide runtime, exposing the same verbs as the bricks
js/ui.js          wiring
test/             73 tests over the pure modules and the page wiring
```

Bricks and Python are two views of **one** program: `bricks.js` compiles the node
list to Python, and every generated line carries the id of the brick that made
it, so pressing Fly it lights a brick and its line together. Both run through
`moves.js`, so a child gets the same behaviour whichever half they touch.

## Two ways to run

**Fly it** executes the bricks directly in JavaScript. Instant, no download.

**Edit the Python** switches to a text editor and loads Pyodide (~10 MB, cached
after the first time) so the code really is Python. Editing the Python detaches
it from the bricks — the page says so plainly rather than silently discarding
one side.

## Tuning — read this before a class

`js/moves.js` turns child-friendly verbs into stick deflections. One constant is
a **guess and must be measured** on your airframe:

```js
yawRateDegPerSec: 90   // degrees per second at yawPower
```

`turn_right(90)` holds the yaw stick for `degrees / yawRateDegPerSec` seconds. If
your drone over- or under-rotates, time a full circle and correct this number.
Everything else (`pitchPower`, `settleAfterTakeoff`, …) is in the same object.

There is no closed loop here: the drone reports attitude, but these moves are
open-loop timed holds. A square will drift.

## The protocol

Reverse-engineered against the hardware; the vendor docs are partial and their
byte numbering is 1-indexed in a way that is easy to misread.

**Transport:** Nordic UART over BLE, advertised as `pyDrone`.
Service `6e400001-…`, write `6e400002-…`, notify `6e400003-…`.

**Control frame, 8 bytes:**

```
[0] header (always 128 — NOT an axis; the drone never echoes it)
[1] roll  [2] pitch  [3] yaw  [4] thrust  [5] buttons  [6][7] unused
```

Axes decode on the drone as `≤100 → v−100`, `100–155 → 0`, `>155 → v−155`.
Thrust is a **percentage centred on 50**: `pct = 50 + axis/2`.
Buttons: `24` take off · `72` land · `40` aux · `136` emergency stop.

**Telemetry, 18 bytes** — nine big-endian `uint16` biased by `+32768`:
`roll×100, pitch×100, yaw×100, in_roll×10, in_pitch×10, in_yaw×200, thrust%, battery×100, baro`.

The drone is **poll-response**: it sends nothing until you send a frame, so the
20 Hz transmit loop doubles as the link heartbeat.

## One connection at a time

**The drone accepts a single BLE connection, and stops advertising while it is
held.** Measured on the hardware: advertising `pyDrone` when idle, invisible to
every scanner while one central is connected, advertising again within seconds
of that central letting go.

The practical consequence is that **this page and the physical pyController are
mutually exclusive**. While a browser tab is connected, the controller cannot
find the drone, so its take-off button does nothing — no error, no LED change,
just silence. Nothing needs configuring on the controller; it simply never sees
a drone to talk to. Press Disconnect, or close the tab, and the controller
works again.

The same applies to a second browser tab, a second laptop, or a diagnostic
script left running.

## Finding the drone

Discovery filters on the **advertised service UUID**, not only the name.

macOS caches a peripheral's GAP name and Chrome filters against that cached
value. This airframe caches as `ESP32` while advertising `pyDrone` in every
packet, so a `namePrefix: 'pyDrone'` filter matched nothing and the drone never
appeared in Chrome's picker. The service UUID lives in the advertisement itself
and cannot go stale, so it is the reliable match. Name prefixes are kept as a
fallback for firmware that advertises no service UUID.

## Picking a drone

Every pyDrone advertises the same BLE name, so Chrome's picker shows
indistinguishable rows. Pair each one once, give it a name, and connecting by
that row afterwards skips the picker entirely.

**Browsers cannot read a BLE MAC address** — Web Bluetooth withholds it as an
anti-tracking measure and macOS never exposes it to any application. Chrome only
offers an opaque per-profile `device.id`. So the MAC field is operator-entered:
type in what the controller shows and the roster becomes your MAC-to-drone map.
Any format is accepted and canonicalised.

## Operating notes

Learned on real hardware, and repeated in the page in child-friendly words:

- **Calibrate first.** Level surface, press reset, wait for **solid blue**.
  Green only means the BLE link is up. Without solid blue the drone stays locked
  and silently ignores take off.
- **Thrust does nothing while landed.** The firmware accepts and echoes the
  value but does not route it to the motors. Only a real `take_off()` spins them
  — there is no bench-test mode in this protocol.
- **Props off while coding.** Motor torque alone will skitter and flip the
  airframe on a desk.
- **Watch the battery under load.** 3.85 V sagging to ~3.0 V on spin-up points
  at a stalling or damaged motor.
- **`baro` is noise on the bench** — it swings ±100 counts from vibration with
  no props fitted. Not exposed in the UI for that reason.
- **IMU mounting offset is real.** A constant few degrees of roll at rest
  survives a good calibration, so the first telemetry frame is taken as the
  level reference.
- The firmware cuts motors itself past **60°** of tilt.
- **The level check must be absolute.** An earlier version zeroed roll and pitch
  against the first telemetry frame, to cancel the IMU mounting offset. That
  redefined "level" as however the drone happened to be sitting when it
  connected, so a drone resting on a book reported itself flat. Tilt is now
  measured absolutely against a 15° limit.
- **Two pre-flight checks cannot be read over Bluetooth** — the blue calibration
  LED and whether the propellers are off. They are confirmed by tapping, and
  reset on every connect, rather than being permanently-red decoration.

## Failsafes

- Stop is always reachable — the red button or the spacebar — and zeroes the
  sticks in the same frame as the stop byte.
- Window blur and tab-hide neutralise the sticks and abort a running program.
- `runOrder` is capped, so a nested loop cannot hang the page before a child can
  press Stop.
- Move durations are clamped to 30 s: a typo cannot fly away for an hour.
- Every run path ends in a `finally` that recentres the sticks.

## Keyboard

`W`/`S` up-down · `A`/`D` turn · `I`/`K` forward-back · `J`/`L` slide · `Space` stop.
Ignored while a text field has focus, so typing never flies the drone.

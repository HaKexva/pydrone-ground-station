import { Drone } from './drone.js';
import { thrustPercent } from './protocol.js';
import { PyRuntime } from './pyrt.js';
import { Roster, normalizeMac } from './roster.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const drone = new Drone();

/* ── console ───────────────────────────────────────────────────────── */

const consoleEl = $('#console');
function log(msg, kind = '') {
  const line = document.createElement('div');
  line.className = `l ${kind}`;
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  line.innerHTML = `<span class="ts">${ts}</span>`;
  line.appendChild(document.createTextNode(msg));
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  while (consoleEl.childElementCount > 400) consoleEl.firstElementChild.remove();
}

const py = new PyRuntime(drone, log);

/* ── attitude indicator ────────────────────────────────────────────── */

const trim = { roll: 0, pitch: 0 };
const ahHorizon = $('#ah-horizon');
const ahRoll = $('#ah-roll');

function paintAttitude(roll, pitch) {
  const r = roll - trim.roll;
  const p = clamp(pitch - trim.pitch, -90, 90);
  ahHorizon.setAttribute('transform', `rotate(${-r}) translate(0 ${p * 1.6})`);
  ahRoll.setAttribute('transform', `rotate(${-r})`);
}

/* ── telemetry readouts ────────────────────────────────────────────── */

const cells = {
  roll:    $('#v-roll'),
  pitch:   $('#v-pitch'),
  yaw:     $('#v-yaw'),
  thrust:  $('#v-thrust'),
  battery: $('#v-batt'),
  alt:     $('#v-alt'),
};
const linkPill = $('#pill-link');
const battPill = $('#pill-batt');
const ratePill = $('#pill-rate');

const fmt = (n, d = 2) => (n < 0 ? '' : ' ') + n.toFixed(d);

let lastTelemetryAt = 0;
let frameCount = 0;

drone.addEventListener('telemetry', (e) => {
  const t = e.detail;
  lastTelemetryAt = performance.now();
  frameCount++;

  cells.roll.firstChild.data = fmt(t.roll - trim.roll);
  cells.pitch.firstChild.data = fmt(t.pitch - trim.pitch);
  cells.yaw.firstChild.data = fmt(t.yaw, 1);
  cells.thrust.firstChild.data = String(t.thrust);
  cells.battery.firstChild.data = t.battery.toFixed(2);
  cells.alt.firstChild.data = String(t.alt);

  // 1S LiPo: 3.7 V is the working floor, below 3.5 V land immediately.
  const b = t.battery;
  cells.battery.className = 'v ' + (b < 3.5 ? 'bad' : b < 3.7 ? '' : 'ok');
  battPill.dataset.state = b < 3.5 ? 'bad' : b < 3.7 ? 'warn' : 'live';
  battPill.lastElementChild.textContent = `${b.toFixed(2)} V`;

  // >60 deg is the firmware's own loss-of-control threshold.
  const tilt = Math.max(Math.abs(t.roll - trim.roll), Math.abs(t.pitch - trim.pitch));
  cells.roll.className = 'v ' + (tilt > 60 ? 'bad' : '');
  cells.pitch.className = 'v ' + (tilt > 60 ? 'bad' : '');

  paintAttitude(t.roll, t.pitch);
});

setInterval(() => {
  const alive = drone.connected && performance.now() - lastTelemetryAt < 700;
  ratePill.dataset.state = alive ? 'live' : drone.connected ? 'warn' : '';
  ratePill.lastElementChild.textContent = `${frameCount} f/s`;
  frameCount = 0;
}, 1000);

/* ── roster + connection ───────────────────────────────────────────── */

const roster = new Roster();
const btnConnect = $('#btn-connect');
const rosterEl = $('#roster');
const anyDeviceEl = $('#any-device');
let activeId = null;

function renderRoster() {
  const list = roster.list();
  rosterEl.textContent = '';

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'roster-empty';
    empty.textContent = 'no drones paired yet — use “Add drone”';
    rosterEl.appendChild(empty);
    return;
  }

  for (const entry of list) {
    const row = document.createElement('div');
    row.className = 'rdev' + (entry.id === activeId ? ' active' : '');

    const dot = document.createElement('i');
    dot.className = 'rdot';
    row.appendChild(dot);

    // Alias is editable in place — the whole point of the roster is telling
    // identically-named drones apart.
    const alias = document.createElement('input');
    alias.className = 'ralias';
    alias.value = entry.alias || '';
    alias.placeholder = roster.label({ ...entry, alias: '' });
    alias.spellcheck = false;
    alias.setAttribute('aria-label', 'drone alias');
    alias.addEventListener('change', () => {
      roster.rename(entry.id, alias.value);
      log(`renamed → ${roster.label(roster.get(entry.id))}`);
      renderRoster();
    });
    alias.addEventListener('keydown', (e) => { if (e.key === 'Enter') alias.blur(); });
    row.appendChild(alias);

    // The browser will not tell us the MAC, so the operator records it here
    // and the roster becomes the MAC -> drone mapping the picker cannot give us.
    const mac = document.createElement('input');
    mac.className = 'rmac' + (entry.mac ? '' : ' unset');
    mac.value = entry.mac || '';
    mac.placeholder = 'ac:a7:04:1f:53:9e';
    mac.spellcheck = false;
    mac.setAttribute('aria-label', 'hardware MAC address');
    mac.title = 'MAC printed by your controller — Web Bluetooth cannot read it, so enter it by hand';
    mac.addEventListener('change', () => {
      const raw = mac.value.trim();
      if (!raw) { roster.setMac(entry.id, ''); renderRoster(); return; }
      if (!roster.setMac(entry.id, raw)) {
        mac.classList.add('bad');
        log(`"${raw}" is not a MAC — expected 12 hex digits, e.g. ac:a7:04:1f:53:9e`, 'err');
        return;
      }
      log(`${roster.label(roster.get(entry.id))} → ${normalizeMac(raw)}`, 'ok');
      renderRoster();
    });
    mac.addEventListener('input', () => mac.classList.remove('bad'));
    mac.addEventListener('keydown', (e) => { if (e.key === 'Enter') mac.blur(); });
    row.appendChild(mac);

    const id = document.createElement('code');
    id.className = 'rid';
    id.textContent = String(entry.id).slice(0, 6);
    id.title = `browser device id (not a MAC): ${entry.id}\nclick to copy`;
    id.addEventListener('click', () => {
      navigator.clipboard?.writeText(entry.id).then(
        () => log(`copied device id ${entry.id}`),
        () => log('clipboard blocked by the browser', 'warn')
      );
    });
    row.appendChild(id);

    const go = document.createElement('button');
    go.className = 'rbtn';
    go.textContent = entry.id === activeId ? 'disconnect' : 'connect';
    go.addEventListener('click', () => {
      if (entry.id === activeId) drone.disconnect();
      else connectTo({ deviceId: entry.id });
    });
    row.appendChild(go);

    const drop = document.createElement('button');
    drop.className = 'rbtn ghost';
    drop.textContent = '×';
    drop.title = 'forget this drone';
    drop.addEventListener('click', () => {
      roster.forget(entry.id);
      log('forgotten — Chrome still holds the pairing until you revoke it in site settings', 'warn');
      renderRoster();
    });
    row.appendChild(drop);

    rosterEl.appendChild(row);
  }
}

async function connectTo(opts = {}) {
  if (drone.connected) await drone.disconnect();
  try {
    await drone.connect({ ...opts, anyDevice: anyDeviceEl.checked });
  } catch (err) {
    if (err.name === 'NotFoundError') log('no device picked', 'warn');
    else log(String(err.message || err), 'err');
  }
}

drone.addEventListener('status', (e) => log(`link: ${e.detail.phase} — ${e.detail.message}`));
drone.addEventListener('error', (e) => log(`ble: ${e.detail.message || e.detail}`, 'err'));

drone.addEventListener('connected', (e) => {
  const { id, name } = e.detail || {};
  activeId = id || null;
  const entry = roster.remember({ id, name });
  const label = roster.label(entry);

  linkPill.dataset.state = 'live';
  linkPill.lastElementChild.textContent = label;
  btnConnect.textContent = 'Disconnect';
  setFlightControlsEnabled(true);
  renderRoster();
  log(`connected to ${label} — transmitting at 20 Hz`, 'ok');
});

drone.addEventListener('disconnected', () => {
  activeId = null;
  linkPill.dataset.state = '';
  linkPill.lastElementChild.textContent = 'offline';
  battPill.dataset.state = '';
  battPill.lastElementChild.textContent = '— V';
  btnConnect.textContent = 'Connect';
  setFlightControlsEnabled(false);
  renderRoster();
  log('disconnected', 'warn');
});

btnConnect.addEventListener('click', () => {
  if (drone.connected) { drone.disconnect(); return; }
  // Prefer a silent reconnect to the last drone used; fall back to the picker.
  const last = roster.list()[0];
  connectTo(last ? { deviceId: last.id } : {});
});

$('#btn-add').addEventListener('click', () => connectTo({}));

function setFlightControlsEnabled(on) {
  for (const el of document.querySelectorAll('[data-needs-link]')) el.disabled = !on;
}

// Chrome only exposes getDevices() behind a flag on some versions; when it is
// missing every connect falls back to the picker, so say so once rather than
// letting "connect" silently reopen the dialog every time.
Drone.known().then((known) => {
  if (!navigator.bluetooth?.getDevices) {
    log('this Chrome build cannot silently reconnect — every connect opens the picker', 'warn');
  } else if (known.length) {
    log(`${known.length} drone(s) already paired with this browser`, 'ok');
  }
});

/* ── flight commands ───────────────────────────────────────────────── */

const HOLD_MS = 1200;
const btnTakeoff = $('#btn-takeoff');
const fill = btnTakeoff.querySelector('.fill');
let holdStart = 0, holdRaf = 0;

function holdTick() {
  const pct = clamp(((performance.now() - holdStart) / HOLD_MS) * 100, 0, 100);
  fill.style.width = pct + '%';
  if (pct >= 100) {
    releaseHold(true);
    return;
  }
  holdRaf = requestAnimationFrame(holdTick);
}

function releaseHold(fire) {
  cancelAnimationFrame(holdRaf);
  holdRaf = 0;
  fill.style.width = '0%';
  if (fire) {
    btnTakeoff.classList.add('armed');
    setTimeout(() => btnTakeoff.classList.remove('armed'), 600);
    drone.takeoff();
    log('TAKEOFF sent — motors arming', 'ok');
  }
}

btnTakeoff.addEventListener('pointerdown', (e) => {
  if (btnTakeoff.disabled) return;
  btnTakeoff.setPointerCapture(e.pointerId);
  holdStart = performance.now();
  holdTick();
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  btnTakeoff.addEventListener(ev, () => { if (holdRaf) releaseHold(false); });
}

$('#btn-land').addEventListener('click', () => { drone.land(); log('LAND sent', 'ok'); });

function estop() {
  py.abort();
  drone.estop();
  resetSticks();
  log('EMERGENCY STOP', 'err');
}
$('#btn-estop').addEventListener('click', estop);

$('#btn-trim').addEventListener('click', () => {
  if (!drone.telemetry) { log('no telemetry to trim against', 'warn'); return; }
  trim.roll = drone.telemetry.roll;
  trim.pitch = drone.telemetry.pitch;
  log(`trim captured: roll ${trim.roll.toFixed(2)}° pitch ${trim.pitch.toFixed(2)}° — display only, not sent to drone`, 'ok');
});

/* ── virtual sticks ────────────────────────────────────────────────── */

// Left stick drives thrust/yaw, right drives pitch/roll — mode 2, as on the
// stock pyController. Both spring back to centre: thrust is a relative trim
// around hover, so a released stick must mean "hold", not "full down".
const stickDefs = [
  { el: $('#stick-left'),  x: 'yaw',  y: 'thrust' },
  { el: $('#stick-right'), x: 'roll', y: 'pitch' },
];

for (const def of stickDefs) {
  const knob = def.el.querySelector('.knob');
  let active = null;

  const show = (dx, dy) => {
    knob.style.transform = `translate(${dx * 100}%, ${dy * 100}%)`;
  };

  const apply = (dx, dy) => {
    show(dx, dy);
    drone.setAxes({ [def.x]: dx * 100, [def.y]: -dy * 100 });
  };

  const move = (e) => {
    if (active !== e.pointerId) return;
    const r = def.el.getBoundingClientRect();
    const dx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
    const dy = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    apply(dx, dy);
  };

  const end = (e) => {
    if (active !== e.pointerId) return;
    active = null;
    def.el.classList.remove('hot');
    apply(0, 0);
  };

  def.el.addEventListener('pointerdown', (e) => {
    active = e.pointerId;
    def.el.setPointerCapture(e.pointerId);
    def.el.classList.add('hot');
    move(e);
  });
  def.el.addEventListener('pointermove', move);
  def.el.addEventListener('pointerup', end);
  def.el.addEventListener('pointercancel', end);
  def.el._show = show;
  def.el._reset = () => apply(0, 0);
}

function resetSticks() {
  for (const def of stickDefs) def.el._reset();
}

/* ── keyboard ──────────────────────────────────────────────────────── */

// Left hand WASD (thrust / yaw), right hand IJKL (pitch / roll) — both hands
// stay on the home row, and neither collides with the browser's own scrolling.
const KEY_GAIN = 60;
const keyMap = {
  KeyW: ['thrust',  1], KeyS: ['thrust', -1],
  KeyA: ['yaw',    -1], KeyD: ['yaw',     1],
  KeyI: ['pitch',   1], KeyK: ['pitch',  -1],
  KeyJ: ['roll',   -1], KeyL: ['roll',    1],
};
const held = new Set();

function pumpKeys() {
  const axes = { roll: 0, pitch: 0, yaw: 0, thrust: 0 };
  for (const code of held) {
    const m = keyMap[code];
    if (m) axes[m[0]] = m[1] * KEY_GAIN;
  }
  drone.setAxes(axes);
  // Mirror the keys onto the on-screen sticks so both inputs read the same.
  for (const def of stickDefs) def.el._show(axes[def.x] / 100, -axes[def.y] / 100);
}

addEventListener('keydown', (e) => {
  if (e.target.matches('textarea, input') || e.target.isContentEditable) return;
  if (e.code === 'Space') { e.preventDefault(); estop(); return; }
  if (!keyMap[e.code]) return;
  e.preventDefault();
  held.add(e.code);
  pumpKeys();
});

addEventListener('keyup', (e) => {
  if (!keyMap[e.code]) return;
  held.delete(e.code);
  if (held.size === 0) { drone.neutral(); resetSticks(); }
  else pumpKeys();
});

/* ── failsafes ─────────────────────────────────────────────────────── */

// Losing focus must never leave a stick deflected. This is the single most
// likely way to lose a drone from a browser UI.
function panicNeutral(why) {
  if (!drone.connected) return;
  held.clear();
  drone.neutral();
  resetSticks();
  log(`sticks neutralised (${why})`, 'warn');
}

addEventListener('blur', () => panicNeutral('window blur'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) panicNeutral('tab hidden');
});
addEventListener('pointercancel', () => panicNeutral('pointer cancelled'));

/* ── python panel ──────────────────────────────────────────────────── */

const editor = $('#editor');
const btnRun = $('#btn-run');
const btnAbort = $('#btn-abort');

const SNIPPETS = {
  'hop': `# minimal: up, hover, down
await drone.takeoff()
await sleep(2)
await drone.land()`,
  'square': `# fly a square — props ON, needs ~2 m of clear space
await drone.takeoff()
await sleep(2)
for heading in range(4):
    print("leg", heading + 1)
    await drone.hold(1.2, pitch=35)
    await drone.hold(0.9, yaw=60)
await drone.land()`,
  'battery watch': `# poll telemetry, land if the pack sags
await drone.takeoff()
for i in range(40):
    s = drone.state
    print(f"{i:>3}  batt={s['battery']:.2f}V  roll={s['roll']:.1f}  pitch={s['pitch']:.1f}")
    if s['battery'] < 3.5:
        print("pack sagging — landing")
        break
    await sleep(0.25)
await drone.land()`,
  'bench (no props)': `# safe on a bench with props removed:
# read attitude without ever arming the motors
for i in range(20):
    s = drone.state
    print(f"roll={s['roll']:>7.2f}  pitch={s['pitch']:>7.2f}  yaw={s['yaw']:>8.2f}  batt={s['battery']:.2f}V")
    await sleep(0.3)`,
};

const snipBar = $('#snips');
for (const [name, code] of Object.entries(SNIPPETS)) {
  const b = document.createElement('button');
  b.className = 'snip';
  b.textContent = name;
  b.addEventListener('click', () => { editor.value = code; editor.focus(); });
  snipBar.appendChild(b);
}
editor.value = SNIPPETS['bench (no props)'];

btnRun.addEventListener('click', async () => {
  btnRun.disabled = true;
  btnAbort.disabled = false;
  try { await py.run(editor.value); }
  finally {
    btnRun.disabled = !drone.connected;
    btnAbort.disabled = true;
    resetSticks();
  }
});

btnAbort.addEventListener('click', () => py.abort());

/* ── boot ──────────────────────────────────────────────────────────── */

if (!Drone.supported) {
  $('#compat').classList.remove('hidden');
  btnConnect.disabled = true;
  log('Web Bluetooth not available in this browser', 'err');
} else {
  log('ground station ready — press Connect and pick "pyDrone"');
}
setFlightControlsEnabled(false);
paintAttitude(0, 0);
renderRoster();

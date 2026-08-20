import { Drone } from './drone.js';
import { Roster, normalizeMac } from './roster.js';
import { Moves } from './moves.js';
import { BLOCKS, makeBlock, toPython, runOrder, outlinePath, SHAPE, starterProgram } from './bricks.js';
import { STRINGS, DEFAULT_LANG } from './i18n.js';
import { PyRuntime } from './pyrt.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const drone = new Drone();
const roster = new Roster();

let lang = DEFAULT_LANG;
let program = starterProgram();
let activeId = null;
let running = false;
let abortFlag = false;
let editingPython = false;

const T = () => STRINGS[lang];

/* ── log ───────────────────────────────────────────────────────────── */

const logEl = $('#log');
function log(msg, kind = '') {
  const line = document.createElement('div');
  if (kind) line.className = kind;
  if (msg.includes('<')) line.innerHTML = msg;
  else line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  while (logEl.childElementCount > 300) logEl.firstElementChild.remove();
}

/* ── abort-aware sleep ─────────────────────────────────────────────── */

class Aborted extends Error {}

async function sleep(seconds) {
  const end = performance.now() + Math.max(0, seconds) * 1000;
  for (;;) {
    if (abortFlag) throw new Aborted();
    const left = end - performance.now();
    if (left <= 0) return;
    await new Promise((r) => setTimeout(r, Math.min(40, left)));
  }
}

const moves = new Moves(drone, { sleep });

/* ── python runtime (loaded only if a child opens the editor) ───────── */

const py = new PyRuntime({ moves, drone, sleep, log, lang: () => lang });

/* ── i18n ──────────────────────────────────────────────────────────── */

function applyLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  const d = T();
  for (const el of document.querySelectorAll('[data-i]')) {
    const v = d[el.dataset.i];
    if (v !== undefined) el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-i-html]')) {
    const v = d[el.dataset.iHtml];
    if (v !== undefined) el.innerHTML = v;
  }
  $('#lang-zh').setAttribute('aria-pressed', String(lang === 'zh-TW'));
  $('#lang-en').setAttribute('aria-pressed', String(lang === 'en'));
  logEl.textContent = '';
  log(d.logReady);
  paintConfirm('blue', $('#r-blue'), $('#v-blue'));
  paintConfirm('prop', $('#r-prop'), $('#v-prop'));
  renderAll();
  paintLink();
}

$('#lang-zh').addEventListener('click', () => applyLang('zh-TW'));
$('#lang-en').addEventListener('click', () => applyLang('en'));

/* ── program tree helpers ──────────────────────────────────────────── */

function findParent(list, id, parent = null) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { list, index: i, parent };
    const kids = list[i].children;
    if (kids) {
      const found = findParent(kids, id, list[i]);
      if (found) return found;
    }
  }
  return null;
}

function contains(node, id) {
  if (node.id === id) return true;
  return (node.children || []).some((c) => contains(c, id));
}

function removeNode(id) {
  const at = findParent(program, id);
  if (!at) return null;
  return at.list.splice(at.index, 1)[0];
}

/* ── bricks ────────────────────────────────────────────────────────── */

const stackEl = $('#stack');
const NS = 'http://www.w3.org/2000/svg';

function paintShape(el) {
  const svg = el.querySelector('svg.shape');
  const w = el.clientWidth, h = el.clientHeight;
  if (!svg || !w || !h) return;
  const notch = el.dataset.notch === '1';
  const tab = el.dataset.tab === '1';
  const d = outlinePath(w, h, notch, tab);
  const fullH = h + SHAPE.depth + SHAPE.shadow + 2;
  const fullW = w + SHAPE.shadow + 2;
  svg.setAttribute('width', fullW);
  svg.setAttribute('height', fullH);
  svg.setAttribute('viewBox', `0 0 ${fullW} ${fullH}`);
  svg.querySelector('.face').setAttribute('d', d);
  const shadow = svg.querySelector('.shadow');
  shadow.setAttribute('d', d);
  shadow.setAttribute('transform', `translate(${SHAPE.shadow} ${SHAPE.shadow})`);
  const div = svg.querySelector('.divide');
  div.setAttribute('x1', SHAPE.divider);
  div.setAttribute('x2', SHAPE.divider);
  div.setAttribute('y1', notch ? SHAPE.inset + SHAPE.depth : SHAPE.inset + 2);
  div.setAttribute('y2', tab ? h - SHAPE.inset : h - SHAPE.inset - 2);
}

const shapeObserver = new ResizeObserver((entries) => {
  for (const e of entries) paintShape(e.target);
});

function icon(name, cls = 'ic lg') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function makeBrickEl(node, notch, tab) {
  const spec = BLOCKS[node.type];
  const el = document.createElement('div');
  el.className = `brick b-${spec.color}`;
  el.dataset.id = node.id;
  el.dataset.notch = notch ? '1' : '0';
  el.dataset.tab = tab ? '1' : '0';
  el.tabIndex = 0;
  el.draggable = true;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'shape');
  for (const [cls, tag] of [['shadow', 'path'], ['face', 'path'], ['divide', 'line']]) {
    const n = document.createElementNS(NS, tag);
    n.setAttribute('class', cls);
    svg.appendChild(n);
  }
  el.appendChild(svg);

  const ico = document.createElement('span');
  ico.className = 'icon';
  ico.appendChild(icon(spec.icon));
  el.appendChild(ico);

  const [label, sub] = T().blocks[node.type] || [node.type, ''];
  const say = document.createElement('span');
  say.className = 'say';
  say.textContent = label;
  const small = document.createElement('small');
  small.textContent = sub;
  say.appendChild(small);
  el.appendChild(say);

  if (spec.arg) {
    const btn = document.createElement('button');
    btn.className = 'tweak';
    btn.type = 'button';
    const show = () => { btn.textContent = `${node[spec.arg.key]} ${spec.arg.unit}`; };
    show();
    btn.addEventListener('click', (e) => { e.stopPropagation(); editArg(btn, node, spec.arg, show); });
    el.appendChild(btn);
  }

  const kill = document.createElement('button');
  kill.className = 'kill';
  kill.type = 'button';
  kill.title = T().removeBrick;
  kill.appendChild(icon('trash', 'ic'));
  kill.addEventListener('click', (e) => {
    e.stopPropagation();
    removeNode(node.id);
    renderAll();
  });
  el.appendChild(kill);
  el.appendChild(icon('grip', 'ic grip'));

  shapeObserver.observe(el);
  return el;
}

/** Swap the pill for a number field so a child can type the value directly. */
function editArg(btn, node, arg, show) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tweak';
  input.value = node[arg.key];
  input.min = arg.min; input.max = arg.max; input.step = arg.step;
  input.style.width = '5.5em';
  btn.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const v = clamp(Number(input.value) || arg.def, arg.min, arg.max);
    node[arg.key] = arg.step >= 1 ? Math.round(v) : Math.round(v * 100) / 100;
    input.replaceWith(btn);
    show();
    renderCode();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.replaceWith(btn); }
  });
}

function renderList(list, container) {
  list.forEach((node, i) => {
    const spec = BLOCKS[node.type];
    // A tab only earns its place when the brick below starts at the same x —
    // a container indents its children, so it never wears one.
    const notch = i > 0 && !BLOCKS[list[i - 1].type].container;
    const tab = i < list.length - 1 && !spec.container;
    container.appendChild(makeBrickEl(node, notch, tab));

    if (spec.container) {
      const nest = document.createElement('div');
      nest.className = 'nest';
      nest.dataset.parent = node.id;
      renderList(node.children || [], nest);
      container.appendChild(nest);
    }
  });
}

function renderBricks() {
  for (const el of stackEl.querySelectorAll('.brick')) shapeObserver.unobserve(el);
  stackEl.textContent = '';
  renderList(program, stackEl);
  requestAnimationFrame(() => stackEl.querySelectorAll('.brick').forEach(paintShape));
}

/* ── palette ───────────────────────────────────────────────────────── */

function renderPalette() {
  const pal = $('#palette');
  pal.textContent = '';
  for (const [type, spec] of Object.entries(BLOCKS)) {
    if (type === 'takeoff' || type === 'land') continue; // already in every program
    const b = document.createElement('button');
    b.className = 'pal';
    b.type = 'button';
    b.style.setProperty('--fill', `var(--${spec.color === 'kraft' ? 'kraft-in' : spec.color})`);
    b.appendChild(icon(spec.icon, 'ic'));
    const label = document.createElement('span');
    label.textContent = (T().blocks[type] || [type])[0];
    b.appendChild(label);
    b.addEventListener('click', () => {
      // Land stays last: a brick added after it would never run.
      const last = program[program.length - 1];
      const at = last && last.type === 'land' ? program.length - 1 : program.length;
      program.splice(at, 0, makeBlock(type));
      renderAll();
    });
    pal.appendChild(b);
  }
}

/* ── drag to reorder ───────────────────────────────────────────────── */

let dragId = null;

stackEl.addEventListener('dragstart', (e) => {
  const el = e.target.closest('.brick');
  if (!el) return;
  dragId = el.dataset.id;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});

stackEl.addEventListener('dragend', () => {
  dragId = null;
  stackEl.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
});

stackEl.addEventListener('dragover', (e) => {
  if (dragId) e.preventDefault();
});

stackEl.addEventListener('drop', (e) => {
  const target = e.target.closest('.brick');
  if (!dragId || !target || target.dataset.id === dragId) return;
  e.preventDefault();

  const moving = findParent(program, dragId);
  const onto = findParent(program, target.dataset.id);
  if (!moving || !onto) return;
  // Dropping a loop inside itself would detach the subtree from the program.
  if (contains(moving.list[moving.index], target.dataset.id)) return;

  const node = removeNode(dragId);
  const dest = findParent(program, target.dataset.id);
  const rect = target.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  dest.list.splice(dest.index + (after ? 1 : 0), 0, node);
  renderAll();
});

/* ── python pane ───────────────────────────────────────────────────── */

const codeEl = $('#code');
const editorEl = $('#editor');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(text) {
  if (text.trimStart().startsWith('#')) return `<span class="c">${esc(text)}</span>`;
  return esc(text)
    .replace(/\b(await|for|in|pass)\b/g, '<span class="k">$1</span>')
    .replace(/drone\.(\w+)/g, 'drone.<span class="f">$1</span>')
    .replace(/\b(range|sleep|print)\b(?![^<]*<\/span>)/g, '<span class="f">$1</span>')
    .replace(/(?<![\w>])(\d+\.?\d*)(?![\w<])/g, '<span class="n hl">$1</span>');
}

function renderCode() {
  const { lines, code } = toPython(program, { comment: T().pyComment });
  if (editingPython) return;
  editorEl.value = code;
  codeEl.textContent = '';
  for (const l of lines) {
    const span = document.createElement('span');
    span.className = 'line';
    if (l.id) span.dataset.id = l.id;
    span.innerHTML = highlight('    '.repeat(l.indent) + l.text);
    codeEl.appendChild(span);
    codeEl.appendChild(document.createTextNode('\n'));
  }
}

function renderAll() {
  renderBricks();
  renderPalette();
  renderCode();
}

/* ── edit / run python ─────────────────────────────────────────────── */

$('#btn-edit').addEventListener('click', () => {
  editingPython = true;
  codeEl.classList.add('hidden');
  editorEl.classList.remove('hidden');
  $('#edit-warn').classList.remove('hidden');
  $('#btn-edit').classList.add('hidden');
  $('#btn-unedit').classList.remove('hidden');
  $('#btn-runpy').classList.remove('hidden');
  $('#btn-runpy').disabled = !drone.connected;
  $('#btn-run').disabled = true;
});

$('#btn-unedit').addEventListener('click', () => {
  editingPython = false;
  codeEl.classList.remove('hidden');
  editorEl.classList.add('hidden');
  $('#edit-warn').classList.add('hidden');
  $('#btn-edit').classList.remove('hidden');
  $('#btn-unedit').classList.add('hidden');
  $('#btn-runpy').classList.add('hidden');
  $('#btn-run').disabled = !drone.connected;
  renderCode();
});

$('#btn-runpy').addEventListener('click', async () => {
  if (running) return;
  running = true; abortFlag = false;
  $('#btn-runpy').disabled = true;
  try {
    await py.run(editorEl.value);
  } finally {
    running = false;
    drone.neutral();
    $('#btn-runpy').disabled = !drone.connected;
  }
});

/* ── run the bricks ────────────────────────────────────────────────── */

function clearHighlight() {
  stackEl.querySelectorAll('.brick.running').forEach((el) => el.classList.remove('running'));
  codeEl.querySelectorAll('.line.on').forEach((el) => el.classList.remove('on'));
}

function highlightStep(id) {
  clearHighlight();
  stackEl.querySelectorAll(`.brick[data-id="${id}"]`).forEach((el) => el.classList.add('running'));
  codeEl.querySelectorAll(`.line[data-id="${id}"]`).forEach((el) => el.classList.add('on'));
}

async function execStep(step) {
  const n = step.node || {};
  switch (step.type) {
    case 'takeoff':    return moves.take_off();
    case 'land':       return moves.land();
    case 'forward':    return moves.forward(n.seconds);
    case 'back':       return moves.back(n.seconds);
    case 'turn_right': return moves.turn_right(n.degrees);
    case 'turn_left':  return moves.turn_left(n.degrees);
    case 'up':         return moves.up(n.seconds);
    case 'down':       return moves.down(n.seconds);
    case 'wait':       return moves.wait(n.seconds);
    case 'loop':       return; // a marker in the run order, not a movement
  }
}

$('#btn-run').addEventListener('click', async () => {
  if (running) return;
  if (!drone.connected) { log(T().notConnectedRun, 'bad'); return; }

  running = true;
  abortFlag = false;
  $('#btn-run').disabled = true;
  logEl.textContent = '';

  try {
    for (const step of runOrder(program)) {
      highlightStep(step.id);
      const msg = T().runMsg[step.type];
      if (msg) log(step.type === 'loop' ? msg.replace('{n}', step.iteration + 1) : msg);
      await execStep(step);
    }
    log(T().done, '');
  } catch (err) {
    if (err instanceof Aborted) log(T().aborted, 'bad');
    else log(String(err.message || err), 'bad');
  } finally {
    running = false;
    clearHighlight();
    drone.neutral();
    $('#btn-run').disabled = !drone.connected || editingPython;
  }
});

function stopEverything() {
  abortFlag = true;
  py.abort();
  drone.estop();
  clearHighlight();
  held.clear();
  log(T().stopped, 'bad');
}

$('#btn-stop').addEventListener('click', stopEverything);

/* ── fleet ─────────────────────────────────────────────────────────── */

const dronesEl = $('#drones');

function renderDrones() {
  const list = roster.list();
  dronesEl.textContent = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = T().noDrones;
    dronesEl.appendChild(p);
    return;
  }

  for (const entry of list) {
    const row = document.createElement('div');
    row.className = 'drone-row' + (entry.id === activeId ? ' active' : '');

    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.appendChild(icon('radio', 'ic'));
    row.appendChild(sw);

    const name = document.createElement('input');
    name.className = 'name-in';
    name.value = entry.alias || '';
    name.placeholder = roster.label({ ...entry, alias: '' });
    name.title = T().renameHint;
    name.addEventListener('change', () => { roster.rename(entry.id, name.value); renderDrones(); });
    row.appendChild(name);

    // Browsers refuse to expose a BLE MAC, so this is operator-entered and is
    // the only thing that reliably tells two identical "pyDrone"s apart.
    const mac = document.createElement('input');
    mac.className = 'mac-in';
    mac.value = entry.mac || '';
    mac.placeholder = 'ac:a7:04:1f:53:9e';
    mac.spellcheck = false;
    mac.addEventListener('change', () => {
      const raw = mac.value.trim();
      if (!raw) { roster.setMac(entry.id, ''); renderDrones(); return; }
      if (!roster.setMac(entry.id, raw)) { mac.classList.add('bad'); return; }
      renderDrones();
    });
    mac.addEventListener('input', () => mac.classList.remove('bad'));
    row.appendChild(mac);

    const go = document.createElement('button');
    go.className = 'btn sm';
    go.type = 'button';
    go.textContent = entry.id === activeId ? T().disconnect : T().connect;
    go.addEventListener('click', () => {
      if (entry.id === activeId) drone.disconnect();
      else connectTo({ deviceId: entry.id });
    });
    row.appendChild(go);

    const drop = document.createElement('button');
    drop.className = 'btn sm ghost';
    drop.type = 'button';
    drop.textContent = T().forget;
    drop.addEventListener('click', () => { roster.forget(entry.id); renderDrones(); });
    row.appendChild(drop);

    dronesEl.appendChild(row);
  }
}

async function connectTo(opts = {}) {
  if (drone.connected) await drone.disconnect();
  try {
    await drone.connect(opts);
  } catch (err) {
    if (err.name === 'NotFoundError') return;
    log(String(err.message || err), 'bad');
  }
}

$('#btn-connect').addEventListener('click', () => {
  if (drone.connected) { drone.disconnect(); return; }
  const last = roster.list()[0];
  connectTo(last ? { deviceId: last.id } : {});
});
$('#btn-add').addEventListener('click', () => connectTo({}));

/* ── telemetry → plain words ───────────────────────────────────────── */

// Two of the four pre-flight checks cannot be read over Bluetooth — the blue
// calibration LED and whether the propellers are off — so a child confirms
// them by eye. They reset whenever a drone connects, so every session starts
// with an honest, unconfirmed checklist.
const LEVEL_LIMIT_DEG = 15;
const confirmed = { blue: false, prop: false };

function paintConfirm(key, row, val) {
  const on = confirmed[key];
  row.className = 'row ask ' + (on ? 'good' : 'warn');
  row.setAttribute('aria-pressed', String(on));
  val.textContent = on ? T().sOk : T().sTap;
}

function resetConfirmations() {
  confirmed.blue = false;
  confirmed.prop = false;
  paintConfirm('blue', $('#r-blue'), $('#v-blue'));
  paintConfirm('prop', $('#r-prop'), $('#v-prop'));
}

for (const [key, id, vid] of [['blue', '#r-blue', '#v-blue'], ['prop', '#r-prop', '#v-prop']]) {
  $(id).addEventListener('click', () => {
    confirmed[key] = !confirmed[key];
    paintConfirm(key, $(id), $(vid));
  });
}

function paintLink() {
  const flag = $('#flag-link');
  const label = flag.querySelector('span');
  const on = drone.connected;
  flag.className = 'flag' + (on ? ' ok' : '');
  label.textContent = on ? (roster.label(roster.get(activeId)) || T().ready) : T().notReady;
  $('#btn-connect').querySelector('span').textContent = on ? T().disconnect : T().connect;
  $('#btn-run').disabled = !on || editingPython;
  $('#btn-runpy').disabled = !on || !editingPython;
  $('#says').textContent = on ? '' : T().notConnected;
}

drone.addEventListener('connected', (e) => {
  const { id, name } = e.detail || {};
  activeId = id || null;
  roster.remember({ id, name });
  resetConfirmations();
  renderDrones();
  paintLink();
  log(`${roster.label(roster.get(activeId))} — ${T().ready}`);
});

drone.addEventListener('disconnected', () => {
  activeId = null;
  renderDrones();
  paintLink();
  $('#v-batt').textContent = '— V';
  $('#battbar').style.width = '0%';
  $('#v-tilt').textContent = '—';
});

drone.addEventListener('error', (e) => log(String(e.detail?.message || e.detail), 'bad'));

drone.addEventListener('telemetry', (e) => {
  const t = e.detail;
  const v = t.battery;
  $('#v-batt').textContent = `${v.toFixed(2)} V`;
  const pct = clamp(((v - 3.3) / (4.2 - 3.3)) * 100, 0, 100);
  const bar = $('#battbar');
  bar.style.width = `${pct}%`;
  bar.classList.toggle('warn', v < 3.6);
  $('#r-batt').className = 'row ' + (v < 3.6 ? 'warn' : 'good');
  const battFlag = $('#flag-batt');
  battFlag.className = 'flag ' + (v < 3.6 ? 'hot' : 'ok');
  battFlag.querySelector('.n').textContent = `${v.toFixed(2)} V`;

  // Absolute tilt, deliberately not zeroed against the first frame: a drone
  // resting on a book must fail this, and it cannot if "level" is redefined
  // as however it happened to be sitting when it connected.
  const tilt = Math.max(Math.abs(t.roll), Math.abs(t.pitch));
  const flat = tilt < LEVEL_LIMIT_DEG;
  $('#v-tilt').textContent = flat ? T().sYes : `${tilt.toFixed(0)}°`;
  $('#r-flat').className = 'row ' + (flat ? 'good' : 'warn');
});

/* ── keyboard flying ───────────────────────────────────────────────── */

const KEY_GAIN = 60;
const keyMap = {
  KeyW: ['thrust', 1], KeyS: ['thrust', -1],
  KeyA: ['yaw', -1],   KeyD: ['yaw', 1],
  KeyI: ['pitch', 1],  KeyK: ['pitch', -1],
  KeyJ: ['roll', -1],  KeyL: ['roll', 1],
};
const held = new Set();

function pumpKeys() {
  const axes = { roll: 0, pitch: 0, yaw: 0, thrust: 0 };
  for (const code of held) {
    const m = keyMap[code];
    if (m) axes[m[0]] = m[1] * KEY_GAIN;
  }
  drone.setAxes(axes);
}

addEventListener('keydown', (e) => {
  if (e.target.matches('textarea, input') || e.target.isContentEditable) return;
  if (e.code === 'Space') { e.preventDefault(); stopEverything(); return; }
  if (!keyMap[e.code] || running) return;
  e.preventDefault();
  held.add(e.code);
  pumpKeys();
});

addEventListener('keyup', (e) => {
  if (!keyMap[e.code]) return;
  held.delete(e.code);
  if (held.size === 0) drone.neutral();
  else pumpKeys();
});

/* ── failsafes ─────────────────────────────────────────────────────── */

function panic(why) {
  if (!drone.connected) return;
  held.clear();
  abortFlag = true;
  drone.neutral();
  log(why, 'bad');
}
addEventListener('blur', () => panic(T().aborted));
document.addEventListener('visibilitychange', () => { if (document.hidden) panic(T().aborted); });

/* ── boot ──────────────────────────────────────────────────────────── */

if (!Drone.supported) {
  $('#compat').classList.remove('hidden');
  $('#btn-connect').disabled = true;
  $('#btn-add').disabled = true;
}

applyLang(DEFAULT_LANG);
resetConfirmations();
renderDrones();
paintLink();

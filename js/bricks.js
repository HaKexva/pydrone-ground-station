// Brick model, Python code generation, and the brick outline geometry.
//
// One program, two views: the bricks a child drags, and the Python a grown-up
// engineer would write. Both are generated from the same node list, so they
// cannot drift apart.

let seq = 0;
export const newId = () => `b${++seq}`;

/**
 * Each block knows its icon, its colour, the argument it exposes, and how it
 * writes itself as Python. `container: true` means it holds child bricks.
 */
export const BLOCKS = {
  takeoff:    { icon: 'rocket',  color: 'leaf',   py: () => 'await drone.take_off()' },
  land:       { icon: 'land',    color: 'tomato', py: () => 'await drone.land()' },
  forward:    { icon: 'forward', color: 'sky',    arg: { key: 'seconds', def: 1.2, min: 0.2, max: 5, step: 0.2, unit: 's' },
                py: (b) => `await drone.forward(seconds=${num(b.seconds)})` },
  back:       { icon: 'back',    color: 'sky',    arg: { key: 'seconds', def: 1.2, min: 0.2, max: 5, step: 0.2, unit: 's' },
                py: (b) => `await drone.back(seconds=${num(b.seconds)})` },
  turn_right: { icon: 'turn',    color: 'kraft',  arg: { key: 'degrees', def: 90, min: 15, max: 360, step: 15, unit: '°' },
                py: (b) => `await drone.turn_right(${num(b.degrees)})` },
  turn_left:  { icon: 'turnl',   color: 'kraft',  arg: { key: 'degrees', def: 90, min: 15, max: 360, step: 15, unit: '°' },
                py: (b) => `await drone.turn_left(${num(b.degrees)})` },
  up:         { icon: 'up',      color: 'sky',    arg: { key: 'seconds', def: 0.6, min: 0.2, max: 3, step: 0.2, unit: 's' },
                py: (b) => `await drone.up(seconds=${num(b.seconds)})` },
  down:       { icon: 'down',    color: 'sky',    arg: { key: 'seconds', def: 0.6, min: 0.2, max: 3, step: 0.2, unit: 's' },
                py: (b) => `await drone.down(seconds=${num(b.seconds)})` },
  wait:       { icon: 'clock',   color: 'kraft',  arg: { key: 'seconds', def: 1, min: 0.2, max: 10, step: 0.2, unit: 's' },
                py: (b) => `await sleep(${num(b.seconds)})` },
  loop:       { icon: 'repeat',  color: 'plum',   container: true,
                arg: { key: 'times', def: 4, min: 2, max: 20, step: 1, unit: '×' },
                py: (b) => `for side in range(${Math.round(b.times)}):` },
};

/** Trim float noise so 1.2000000000000002 never reaches a child's screen. */
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function makeBlock(type, overrides = {}) {
  const spec = BLOCKS[type];
  if (!spec) throw new Error(`unknown block type: ${type}`);
  const node = { id: newId(), type, ...overrides };
  if (spec.arg && node[spec.arg.key] === undefined) node[spec.arg.key] = spec.arg.def;
  if (spec.container && !node.children) node.children = [];
  return node;
}

/**
 * Compile a program to Python.
 * @returns {{lines: {id: string|null, text: string, indent: number}[], code: string}}
 * Every line carries the id of the brick that produced it, so the UI can light
 * a brick and its line together.
 */
export function toPython(program, { comment = '' } = {}) {
  const lines = [];
  if (comment) {
    lines.push({ id: null, text: `# ${comment}`, indent: 0 });
  }

  const walk = (nodes, indent) => {
    for (const node of nodes) {
      const spec = BLOCKS[node.type];
      if (!spec) continue;
      lines.push({ id: node.id, text: spec.py(node), indent });
      if (spec.container) {
        const kids = node.children || [];
        if (kids.length) walk(kids, indent + 1);
        // Python has no empty block, so an empty loop still needs a body.
        else lines.push({ id: node.id, text: 'pass', indent: indent + 1 });
      }
    }
  };
  walk(program, 0);

  const code = lines.map((l) => '    '.repeat(l.indent) + l.text).join('\n');
  return { lines, code };
}

/**
 * Expand a program into the flat sequence of brick ids that will actually run,
 * loops unrolled. Used to drive highlighting without executing anything.
 */
export function runOrder(program, { maxSteps = 2000 } = {}) {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (out.length >= maxSteps) return;
      const spec = BLOCKS[node.type];
      if (!spec) continue;
      if (spec.container) {
        const times = Math.max(0, Math.round(node.times ?? 0));
        for (let i = 0; i < times; i++) {
          if (out.length >= maxSteps) return;
          out.push({ id: node.id, type: node.type, iteration: i });
          walk(node.children || []);
        }
      } else {
        out.push({ id: node.id, type: node.type, node });
      }
    }
  };
  walk(program);
  return out;
}

/* ── brick outline ──────────────────────────────────────────────────
   Notch, tab, corners and drop shadow come from one path so the ink
   stroke stays continuous — a pseudo-element cannot merge its border
   into its parent's, which is why stud-style bumps always detach. */

export const SHAPE = { r: 11, notchX: 74, notchW: 28, depth: 8, inset: 1, divider: 52, shadow: 4 };

export function outlinePath(w, h, notch, tab, s = SHAPE) {
  const { r, notchX: x1, notchW, depth: d, inset: i } = s;
  const x2 = x1 + notchW;
  const yb = h - i;
  let p = `M ${r + i},${i}`;
  if (notch) {
    p += ` L ${x1},${i}`;
    p += ` C ${x1 + 5},${i} ${x1 + 5},${i + d} ${x1 + 10},${i + d}`;
    p += ` L ${x2 - 10},${i + d}`;
    p += ` C ${x2 - 5},${i + d} ${x2 - 5},${i} ${x2},${i}`;
  }
  p += ` L ${w - r - i},${i} A ${r},${r} 0 0 1 ${w - i},${r + i}`;
  p += ` L ${w - i},${h - r - i} A ${r},${r} 0 0 1 ${w - r - i},${yb}`;
  if (tab) {
    p += ` L ${x2},${yb}`;
    p += ` C ${x2 - 5},${yb} ${x2 - 5},${yb + d} ${x2 - 10},${yb + d}`;
    p += ` L ${x1 + 10},${yb + d}`;
    p += ` C ${x1 + 5},${yb + d} ${x1 + 5},${yb} ${x1},${yb}`;
  }
  p += ` L ${r + i},${yb} A ${r},${r} 0 0 1 ${i},${h - r - i}`;
  p += ` L ${i},${r + i} A ${r},${r} 0 0 1 ${r + i},${i} Z`;
  return p;
}

/** The square: the program every child starts from. */
export function starterProgram() {
  return [
    makeBlock('takeoff'),
    makeBlock('loop', {
      times: 4,
      children: [makeBlock('forward', { seconds: 1.2 }), makeBlock('turn_right', { degrees: 90 })],
    }),
    makeBlock('land'),
  ];
}

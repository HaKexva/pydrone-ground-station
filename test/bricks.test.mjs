import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, makeBlock, toPython, runOrder, outlinePath, starterProgram } from '../js/bricks.js';

test('makeBlock fills in the default argument', () => {
  const b = makeBlock('forward');
  assert.equal(b.type, 'forward');
  assert.equal(b.seconds, BLOCKS.forward.arg.def);
  assert.ok(b.id);
});

test('makeBlock gives containers a children array', () => {
  assert.deepEqual(makeBlock('loop').children, []);
});

test('makeBlock rejects an unknown type instead of emitting broken Python', () => {
  assert.throws(() => makeBlock('barrel_roll'), /unknown block type/);
});

test('ids are unique', () => {
  const ids = new Set(Array.from({ length: 50 }, () => makeBlock('wait').id));
  assert.equal(ids.size, 50);
});

test('the starter program compiles to the square', () => {
  const { code } = toPython(starterProgram(), { comment: 'Fly a square.' });
  assert.equal(code, [
    '# Fly a square.',
    'await drone.take_off()',
    'for side in range(4):',
    '    await drone.forward(seconds=1.2)',
    '    await drone.turn_right(90)',
    'await drone.land()',
  ].join('\n'));
});

test('every generated line carries the id of the brick that made it', () => {
  const prog = starterProgram();
  const { lines } = toPython(prog);
  assert.equal(lines[0].id, prog[0].id, 'take off');
  assert.equal(lines[1].id, prog[1].id, 'loop');
  assert.equal(lines[2].id, prog[1].children[0].id, 'forward');
  assert.equal(lines[4].id, prog[2].id, 'land');
});

test('a comment line belongs to no brick', () => {
  const { lines } = toPython([makeBlock('land')], { comment: 'hi' });
  assert.equal(lines[0].id, null);
  assert.equal(lines[0].text, '# hi');
});

// Python has no empty block, so this would be a SyntaxError without the guard.
test('an empty loop still emits a body', () => {
  const { code } = toPython([makeBlock('loop', { times: 3 })]);
  assert.equal(code, 'for side in range(3):\n    pass');
});

test('nested loops indent correctly', () => {
  const inner = makeBlock('loop', { times: 2, children: [makeBlock('wait', { seconds: 1 })] });
  const outer = makeBlock('loop', { times: 3, children: [inner] });
  const { code } = toPython([outer]);
  assert.equal(code, [
    'for side in range(3):',
    '    for side in range(2):',
    '        await sleep(1)',
  ].join('\n'));
});

test('numbers are trimmed so no child sees 1.2000000000000002', () => {
  const { code } = toPython([makeBlock('forward', { seconds: 0.1 + 0.2 })]);
  assert.equal(code, 'await drone.forward(seconds=0.3)');
});

test('whole numbers stay whole', () => {
  assert.equal(toPython([makeBlock('forward', { seconds: 2 })]).code, 'await drone.forward(seconds=2)');
  assert.equal(toPython([makeBlock('turn_right', { degrees: 90 })]).code, 'await drone.turn_right(90)');
});

test('runOrder unrolls the loop', () => {
  const order = runOrder(starterProgram());
  // take off, then 4 x (loop marker + forward + turn), then land
  assert.equal(order.length, 1 + 4 * 3 + 1);
  assert.equal(order[0].type, 'takeoff');
  assert.equal(order[1].type, 'loop');
  assert.equal(order[1].iteration, 0);
  assert.equal(order[2].type, 'forward');
  assert.equal(order.at(-1).type, 'land');
});

test('runOrder counts each iteration', () => {
  const order = runOrder(starterProgram());
  assert.deepEqual(order.filter((s) => s.type === 'loop').map((s) => s.iteration), [0, 1, 2, 3]);
});

test('runOrder carries the node so the runner can read its argument', () => {
  const step = runOrder(starterProgram()).find((s) => s.type === 'forward');
  assert.equal(step.node.seconds, 1.2);
});

test('a zero-times loop runs nothing inside it', () => {
  const prog = [makeBlock('loop', { times: 0, children: [makeBlock('wait')] })];
  assert.deepEqual(runOrder(prog), []);
});

// A runaway loop must not hang the browser before the child can press Stop.
test('runOrder is capped', () => {
  const prog = [makeBlock('loop', { times: 20, children: [makeBlock('loop', { times: 20, children: [makeBlock('wait')] })] })];
  assert.ok(runOrder(prog, { maxSteps: 100 }).length <= 100);
});

test('outline path opens and closes', () => {
  const d = outlinePath(300, 62, true, true);
  assert.ok(d.startsWith('M '));
  assert.ok(d.trimEnd().endsWith('Z'));
  assert.ok(!/NaN|undefined/.test(d), 'no NaN in path data');
});

test('notch and tab appear only when asked for', () => {
  const plain = outlinePath(300, 62, false, false);
  const both = outlinePath(300, 62, true, true);
  const curves = (s) => (s.match(/C /g) || []).length;
  assert.equal(curves(plain), 0);
  assert.equal(curves(both), 4, 'two curves per notch, two per tab');
  assert.ok(both.length > plain.length);
});

test('outline stays finite at small sizes', () => {
  assert.ok(!/NaN/.test(outlinePath(120, 40, true, true)));
});

// Catches the class of bug that only shows up in a browser: a button wired to
// an id that does not exist, a translation key that blanks the UI on toggle,
// an icon referenced but never defined.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../js/i18n.js';
import { BLOCKS } from '../js/bricks.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/paper.css'), 'utf8');
const langs = Object.keys(STRINGS);

test('every element ui.js reaches for exists in the page', () => {
  const ids = new Set([...ui.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]));
  assert.ok(ids.size > 15, 'expected the UI to query a good number of elements');
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `#${id} missing from index.html`);
});

test('no duplicate element ids', () => {
  const declared = [...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]);
  const dupes = [...new Set(declared.filter((x, i) => declared.indexOf(x) !== i))];
  assert.deepEqual(dupes, []);
});

test('every translation key used in the page resolves in every language', () => {
  const keys = new Set([
    ...[...html.matchAll(/data-i="([\w.]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i-html="([\w.]+)"/g)].map((m) => m[1]),
  ]);
  for (const lang of langs) {
    for (const k of keys) assert.notEqual(STRINGS[lang][k], undefined, `${lang} missing "${k}"`);
  }
});

test('the languages have identical shape so a toggle never blanks the UI', () => {
  const [a, b] = langs;
  assert.deepEqual(Object.keys(STRINGS[a]).sort(), Object.keys(STRINGS[b]).sort());
});

test('every brick has a label, a subtitle and a run message in every language', () => {
  for (const type of Object.keys(BLOCKS)) {
    for (const lang of langs) {
      const entry = STRINGS[lang].blocks[type];
      assert.ok(entry, `${lang}.blocks.${type} missing`);
      assert.equal(entry.length, 2, `${lang}.blocks.${type} needs [label, subtitle]`);
      assert.ok(STRINGS[lang].runMsg[type], `${lang}.runMsg.${type} missing`);
    }
  }
});

test('every icon referenced is defined in the sprite', () => {
  const used = new Set([
    ...[...html.matchAll(/href="#i-([\w-]+)"/g)].map((m) => m[1]),
    ...[...ui.matchAll(/icon\('([\w-]+)'/g)].map((m) => m[1]),
    ...Object.values(BLOCKS).map((b) => b.icon),
  ]);
  for (const name of used) assert.ok(html.includes(`id="i-${name}"`), `sprite has no #i-${name}`);
});

test('every file the page and the UI reference exists', () => {
  const css = html.match(/href="(css\/[\w.-]+)"/)?.[1];
  assert.ok(css && fs.existsSync(path.join(root, css)), `stylesheet ${css} missing`);
  for (const m of [...ui.matchAll(/from '\.\/([\w.]+)'/g)].map((x) => x[1])) {
    assert.ok(fs.existsSync(path.join(root, 'js', m)), `js/${m} missing`);
  }
});

test('the page declares Traditional Chinese as its language', () => {
  assert.match(html, /<html lang="zh-TW">/);
});

// A grid container splits *every* child into a cell, bare text nodes included.
// Setting innerHTML of mixed content ("<strong>x</strong> then text") on one
// therefore throws the trailing text into the next row's first column — which
// on a "30px 1fr" checklist renders one character per line.
test('translated HTML never lands directly on a grid container', () => {
  const gridded = new Set();
  for (const [, selectors] of css.matchAll(/([^{}]+)\{[^}]*grid-template-columns[^}]*\}/g)) {
    for (const sel of selectors.split(',')) {
      const last = sel.trim().split(/\s+/).pop();
      if (last) gridded.add(last);
    }
  }
  assert.ok(gridded.size > 0, 'expected the stylesheet to define grid columns somewhere');

  for (const [, tag, attrs] of html.matchAll(/<(\w+)([^>]*data-i-html[^>]*)>/g)) {
    const classes = (attrs.match(/class="([^"]*)"/)?.[1] || '').split(/\s+/).filter(Boolean);
    const targets = [tag, ...classes.map((c) => '.' + c)];
    for (const t of targets) {
      assert.ok(!gridded.has(t), `data-i-html sits on <${tag}> which "${t}" makes a grid container — wrap the content in a child element`);
    }
  }
});

test('every checklist step holds its text in a single wrapper', () => {
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
  assert.ok(items.length >= 4, 'expected the pre-flight checklist');
  for (const inner of items) {
    assert.match(inner, /^<span [^>]*><\/span>$/, `checklist item must be one span, got: ${inner}`);
  }
});

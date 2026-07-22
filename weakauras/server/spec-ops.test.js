// Pure-core P1 test (no LLM, no deps): registry resolution + validated spec mutation.
//   node server/spec-ops.test.js
const assert = require('assert');
const { specToParts } = require('../lib/spec-builder.js');
const ops = require('./spec-ops.js');
const { searchAbilities, resolveSpell, describeSpec, addCooldownIcon } = ops;
const felsworn = require('../classes/felsworn/spec.json');
const valid = s => specToParts(s).children.length;

let pass = 0;
const t = (name, fn) => { fn(); console.log(`  ok  ${name}`); pass++; };

// searchAbilities resolves a real spell by name
t('searchAbilities finds Chaos Rush', () => {
  const hits = searchAbilities('felsworn', 'Chaos Rush');
  assert.strictEqual(hits[0].spellId, 500028);
  assert.strictEqual(typeof hits[0].primary, 'string');   // classified (whatever the category)
});

t('resolveSpell name -> id', () => {
  assert.strictEqual(resolveSpell('felsworn', 'Chaos Rush').spellId, 500028);
  assert.strictEqual(resolveSpell('felsworn', 500028).spellId, 500028);
  assert.strictEqual(resolveSpell('felsworn', '500028').spellId, 500028);
});

t('describeSpec lists the stack', () => {
  const d = describeSpec(felsworn);
  assert.strictEqual(d.id, 'Felsworn Tyrant SPEC');
  assert.ok(d.elements.some(e => e.kind === 'cdRow' && !e.secondary));
});

// the heart of P1: add a new CD icon -> spec stays valid, region count grows by 1
t('addCooldownIcon adds Felwrath and stays valid', () => {
  const before = specToParts(felsworn).children.length;
  const r = addCooldownIcon(felsworn, 'felsworn', { row: 'primary', spell: 'Felwrath' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.added, { label: 'Felwrath', spellId: 520236, row: 'primary' });
  assert.strictEqual(specToParts(r.spec).children.length, before + 1);
  // input spec was NOT mutated (purity)
  assert.strictEqual(specToParts(felsworn).children.length, before);
});

t('addCooldownIcon rejects a duplicate (Chaos Rush already in the row)', () => {
  const r = addCooldownIcon(felsworn, 'felsworn', { spell: 'Chaos Rush' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /duplicate region id/i);
});

t('addCooldownIcon errors on an unknown spell', () => {
  const r = addCooldownIcon(felsworn, 'felsworn', { spell: 'Nonexistent Spell XYZ' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no ability matching/i);
});

// ---- P2 expanded tool surface ----
t('addProc adds a validated proc icon', () => {
  const r = ops.addProc(felsworn, 'felsworn', { spell: 'Felwrath' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(valid(r.spec), valid(felsworn) + 1);
});

t('addUptimeBar tracks a new buff', () => {
  const r = ops.addUptimeBar(felsworn, { buff: 'Metamorphosis' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.spec.stack.some(e => e.kind === 'uptimeBar' && e.buff === 'Metamorphosis'));
  assert.strictEqual(valid(r.spec), valid(felsworn) + 1);
});

t('setCooldownGlow sets a ready glow on an existing icon', () => {
  const r = ops.setCooldownGlow(felsworn, 'felsworn', { spell: 'Blood of Mannoroth', type: 'ready' });
  assert.strictEqual(r.ok, true);
  const cd = r.spec.stack.find(e => e.kind === 'cdRow' && !e.secondary);
  assert.deepStrictEqual(cd.icons.find(i => i.label === 'Blood of Mannoroth').glow, { type: 'ready' });
});

t('setCooldownGlow type:buff requires a buff name', () => {
  const r = ops.setCooldownGlow(felsworn, 'felsworn', { spell: 'Blood of Mannoroth', type: 'buff' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /needs a buff/i);
});

t('removeIcon drops an icon by name (container = stack index)', () => {
  const i = felsworn.stack.findIndex(e => (e.icons || []).some(ic => ic.label === 'Reckoning'));
  const r = ops.removeIcon(felsworn, 'felsworn', { container: i, match: 'Reckoning' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(valid(r.spec), valid(felsworn) - 1);
});

t('removeElement drops an element and re-validates', () => {
  const last = felsworn.stack.length - 1;
  const r = ops.removeElement(felsworn, { index: last });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.spec.stack.length, felsworn.stack.length - 1);
  valid(r.spec);
});

t('moveElement reorders and stays valid', () => {
  const r = ops.moveElement(felsworn, { from: 0, to: 3 });
  assert.strictEqual(r.ok, true);
  valid(r.spec);
});

t('setCombatOnly toggles the flag', () => {
  const on = ops.setCombatOnly(felsworn, { on: true });
  assert.strictEqual(on.spec.combatOnly, true);
  const off = ops.setCombatOnly(on.spec, { on: false });
  assert.strictEqual(off.spec.combatOnly, undefined);
});

// ---- P3 generic CRUD surface ----
t('describeSpec exposes global + per-element fields (count, powerType)', () => {
  const d = describeSpec(felsworn);
  assert.strictEqual(d.global.barWidth, 250);
  const stacks = d.elements.find(e => e.kind === 'stacks');
  assert.strictEqual(stacks.count, 6);              // concrete target for updateElement
  assert.ok(d.elements.find(e => e.kind === 'powerBar').powerType != null);
});

t('updateElement changes the Felfury stack count 6 -> 5', () => {
  const i = felsworn.stack.findIndex(e => e.kind === 'stacks');
  const r = ops.updateElement(felsworn, { index: i, set: { count: 5 } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.spec.stack[i].count, 5);
  valid(r.spec);
  assert.strictEqual(felsworn.stack[i].count, 6);   // purity: input untouched
});

t('updateElement null deletes a field', () => {
  const i = felsworn.stack.findIndex(e => e.kind === 'stacks');
  const r = ops.updateElement(felsworn, { index: i, set: { capGlow: null } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.spec.stack[i].capGlow, undefined);
});

t('addElement adds a healthBar-free element (powerBar) and stays valid', () => {
  const r = ops.addElement(felsworn, 'felsworn', { kind: 'uptimeBar', buff: 'Metamorphosis' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(valid(r.spec), valid(felsworn) + 1);
});

t('addElement rejects an unknown kind', () => {
  const r = ops.addElement(felsworn, 'felsworn', { kind: 'bogusKind' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unknown kind/i);
});

t('addElement powerBar without powerType fails validation', () => {
  const r = ops.addElement(felsworn, 'felsworn', { kind: 'powerBar' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /powerType/i);
});

const cdIdx = felsworn.stack.findIndex(e => e.kind === 'cdRow' && !e.secondary);

t('addIcon adds a cooldown icon to a row by stack index', () => {
  const r = ops.addIcon(felsworn, 'felsworn', { container: cdIdx, icon: { spell: 'Felwrath' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(valid(r.spec), valid(felsworn) + 1);
});

t('addIcon rejects a show-gated icon in a legacy cdRow', () => {
  const r = ops.addIcon(felsworn, 'felsworn', { container: cdIdx, icon: { spell: 'Felwrath', showWhen: [{ buff: 'X' }] } });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /iconRow/);
});

t('updateIcon sets then clears a glow on an existing icon', () => {
  const set = ops.updateIcon(felsworn, 'felsworn', { container: cdIdx, match: 'Blood of Mannoroth', set: { glow: { type: 'ready' } } });
  assert.strictEqual(set.ok, true);
  assert.deepStrictEqual(set.spec.stack[cdIdx].icons.find(i => i.label === 'Blood of Mannoroth').glow, { type: 'ready' });
  const clr = ops.updateIcon(set.spec, 'felsworn', { container: cdIdx, match: 'Blood of Mannoroth', set: { glow: null } });
  assert.strictEqual(clr.spec.stack[cdIdx].icons.find(i => i.label === 'Blood of Mannoroth').glow, undefined);
});

// ---- unified iconRow surface ----
t('addElement iconRow + addIcon: a cooldown and a showWhen proc in ONE row', () => {
  const row = ops.addElement(felsworn, 'felsworn', { kind: 'iconRow', id: 'Test Row', at: 0 });
  assert.strictEqual(row.ok, true);
  assert.deepStrictEqual(row.added, { kind: 'iconRow', at: 0 });
  const cd = ops.addIcon(row.spec, 'felsworn', { container: 0, icon: { spell: 'Felwrath' } });
  assert.strictEqual(cd.ok, true);
  const proc = ops.addIcon(cd.spec, 'felsworn', {
    container: 0,
    icon: { spell: 'Chaos Rush', label: 'Chaos Rush (proc)', showWhen: [{ buff: 'Carve' }], glow: { when: [] } },
  });
  assert.strictEqual(proc.ok, true);
  assert.strictEqual(valid(proc.spec), valid(felsworn) + 3);   // dyngroup + 2 icons
});

t('addElement rejects the retired legacy kinds', () => {
  const r = ops.addElement(felsworn, 'felsworn', { kind: 'cdRow' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unknown kind/i);
});

t('addIcon rejects a buff-state icon outside a buffRow', () => {
  const r = ops.addIcon(felsworn, 'felsworn', { container: cdIdx, icon: { label: 'X', anyOf: ['Some Buff'] } });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /buffRow/);
});

t('describeSpec exposes showWhen on gated icons', () => {
  const row = ops.addElement(felsworn, 'felsworn', { kind: 'iconRow', id: 'Test Row 2' });
  const proc = ops.addIcon(row.spec, 'felsworn', { container: row.added.at, icon: { spell: 'Felwrath', showWhen: [{ buff: 'Carve' }] } });
  const d = describeSpec(proc.spec);
  const el = d.elements.find(e => e.id === 'Test Row 2');
  assert.deepStrictEqual(el.icons[0].showWhen, [{ buff: 'Carve' }]);
});

t('setGlobal patches sizing and toggles combatOnly', () => {
  const r = ops.setGlobal(felsworn, { set: { barWidth: 300, combatOnly: true } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.spec.global.barWidth, 300);
  assert.strictEqual(r.spec.combatOnly, true);
  valid(r.spec);
  const off = ops.setGlobal(r.spec, { set: { combatOnly: false } });
  assert.strictEqual(off.spec.combatOnly, undefined);
});

console.log(`\n${pass} passed`);

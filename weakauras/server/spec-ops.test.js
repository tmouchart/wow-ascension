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

t('removeIcon drops an icon by name', () => {
  const r = ops.removeIcon(felsworn, 'felsworn', { spell: 'Reckoning' });
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

console.log(`\n${pass} passed`);

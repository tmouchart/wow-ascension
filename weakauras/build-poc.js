// Build a minimal Felsworn Tyrant POC WeakAura: Energy bar + Felfury bar.
// Clones Luxthos's known-good aurabar template so all internal fields are valid.
const fs = require('fs');
const { encodeWA } = require('./wa-codec.js');

const barTpl = JSON.parse(fs.readFileSync('_template-bar.json', 'utf8'));
const grpTpl = JSON.parse(fs.readFileSync('_template-group.json', 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

const GROUP_ID = 'Felsworn Tyrant POC';
const ENERGY_ID = 'Felsworn Energy';
const FELFURY_ID = 'Felsworn Felfury';

// load: always load (no class/spec restriction — Felsworn is a custom class)
const loadAlways = () => ({
  use_never: false, size: { multi: [] }, talent: { multi: [] },
  spec: { multi: [] }, class: { multi: [] }, zoneIds: '', role: [], use_petbattle: false, pvptalent: []
});

const safeActions = () => ({
  start: { do_message: false, do_custom: false },
  init: { do_custom: false },
  finish: { do_message: false, do_custom: false }
});

function triggers(trigger) {
  return { __array: [{ trigger, untrigger: [] }], disjunctive: 'any', activeTriggerMode: -10 };
}

function makeBar(opts) {
  const b = clone(barTpl);
  b.id = opts.id;
  b.uid = opts.uid;
  b.parent = GROUP_ID;
  b.load = loadAlways();
  b.actions = safeActions();
  b.conditions = [];
  delete b.wagoID; delete b.url; delete b.source; delete b.semver;
  b.anchorFrameType = 'SCREEN';
  b.anchorPoint = 'CENTER';
  b.selfPoint = 'CENTER';
  b.xOffset = 0;
  b.yOffset = opts.yOffset;
  b.width = 300;
  b.height = 22;
  b.barColor = opts.color;
  b.triggers = triggers(opts.trigger);
  b.progressSource = opts.progressSource || [-1, ''];
  b.useAdjustededMax = !!opts.adjustedMax;
  b.adjustedMax = opts.adjustedMax || '';
  b.useAdjustededMin = false;
  b.adjustedMin = '';
  b.isPrimaryResource = false;
  b.config = []; b.authorOptions = []; b.configGroup = '';
  // subtext label -> show the value text
  if (Array.isArray(b.subRegions)) {
    for (const sr of b.subRegions) {
      if (sr.type === 'subtext') { sr.text_text = opts.text; sr.text_fontSize = 14; }
    }
  }
  return b;
}

const energy = makeBar({
  id: ENERGY_ID, uid: 'felswrnEnrg01', yOffset: -180, color: [1, 0.82, 0.0, 1],
  text: '%p', // current power value
  trigger: {
    use_unit: true, duration: '1', use_powertype: true, use_absorbMode: true,
    unevent: 'auto', powertype: 3, unit: 'player', type: 'unit', event: 'Power',
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
  }
});

const felfury = makeBar({
  id: FELFURY_ID, uid: 'felswrnFfry01', yOffset: -206, color: [0.62, 0.19, 0.85, 1],
  text: 'Felfury: %s', adjustedMax: 6, progressSource: [1, 'stacks'],
  trigger: {
    type: 'aura2', unit: 'player', debuffType: 'HELPFUL',
    useName: true, auranames: ['Felfury'], names: [], spellIds: [], auraspellids: [],
    matchesShowOn: 'showAlways', ownOnly: true, unitExists: true,
    subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health',
    use_stacks: false, useExactSpellId: false
  }
});

// root group
const group = clone(grpTpl);
group.id = GROUP_ID;
group.uid = 'felswrnGrp001';
group.controlledChildren = [ENERGY_ID, FELFURY_ID];
group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
group.actions = safeActions();
group.conditions = [];
group.anchorFrameType = 'SCREEN';
group.anchorPoint = 'CENTER';
group.selfPoint = 'CENTER';
group.xOffset = 0; group.yOffset = 0;
delete group.wagoID; delete group.url; delete group.source; delete group.semver;
delete group.controlledChildrenOrder;

const top = {
  d: group,
  c: [energy, felfury],
  m: 'd',
  s: '5.20.2',
  v: 2000
};

fs.writeFileSync('felsworn-poc.decoded.json', JSON.stringify(top, null, 2));
const str = encodeWA(top);
fs.writeFileSync('felsworn-poc.import.txt', str);
console.log('POC import string written to felsworn-poc.import.txt (' + str.length + ' chars)');

// sanity: re-decode our own output
const { decodeWA } = require('./wa-codec.js');
const back = decodeWA(str).data;
const ok = JSON.stringify(back) === JSON.stringify(top);
console.log('self round-trip ok:', ok, '| children:', back.c.map(x => x.id).join(', '));

// Felsworn Tyrant WeakAura v2: Energy bar + Felfury shown as 6 separate green stack boxes.
const fs = require('fs');
const { encodeWA, decodeWA } = require('./wa-codec.js');

const barTpl = JSON.parse(fs.readFileSync('_template-bar.json', 'utf8'));
const grpTpl = JSON.parse(fs.readFileSync('_template-group.json', 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

const GROUP_ID = 'Felsworn Tyrant';
const FELSWORN_GREEN = [0.337, 0.729, 0.016, 1];   // ~RGB(86,186,4), class color
const EMPTY_BG = [0.09, 0.11, 0.09, 0.9];
const MAX_FELFURY = 6;

const loadAlways = () => ({
  use_never: false, size: { multi: [] }, talent: { multi: [] },
  spec: { multi: [] }, class: { multi: [] }, zoneIds: '', role: [], use_petbattle: false, pvptalent: []
});
const safeActions = () => ({
  start: { do_message: false, do_custom: false },
  init: { do_custom: false },
  finish: { do_message: false, do_custom: false }
});
const wrapTrigger = (trigger) => ({ __array: [{ trigger, untrigger: [] }], disjunctive: 'any', activeTriggerMode: -10 });

function baseBar(id, uid) {
  const b = clone(barTpl);
  b.id = id; b.uid = uid; b.parent = GROUP_ID;
  b.load = loadAlways(); b.actions = safeActions(); b.conditions = [];
  delete b.wagoID; delete b.url; delete b.source; delete b.semver;
  b.anchorFrameType = 'SCREEN'; b.anchorPoint = 'CENTER'; b.selfPoint = 'CENTER';
  b.xOffset = 0; b.yOffset = 0;
  b.isPrimaryResource = false;
  b.config = []; b.authorOptions = []; b.configGroup = '';
  b.useAdjustededMax = false; b.adjustedMax = ''; b.useAdjustededMin = false; b.adjustedMin = '';
  b.progressSource = [-1, ''];
  return b;
}
function setText(b, txt, size) {
  for (const sr of (b.subRegions || [])) {
    if (sr.type === 'subtext') { sr.text_text = txt; sr.text_fontSize = size || 14; sr.text_visible = txt !== ''; }
    if (sr.type === 'subborder') { sr.border_visible = true; sr.border_color = [0, 0, 0, 0.9]; sr.border_size = 1; }
  }
}

// ---- Energy bar ----
const energy = baseBar('Felsworn Energy', 'felswrnEnrg01');
energy.yOffset = -180; energy.width = 300; energy.height = 22;
energy.barColor = [1, 0.82, 0.0, 1];
energy.backgroundColor = [0.12, 0.1, 0.0, 0.8];
energy.triggers = wrapTrigger({
  use_unit: true, duration: '1', use_powertype: true, use_absorbMode: true,
  unevent: 'auto', powertype: 3, unit: 'player', type: 'unit', event: 'Power',
  subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
});
setText(energy, '%p', 14);

// ---- Felfury: 6 boxes ----
// Trigger 1: aura2 "Felfury" (proven to detect the buff + expose `stacks`).
// Trigger 2: trivial custom stateupdate that keeps the bar 100% full (no aura API -> safe).
// Condition: stacks >= N -> barColor green; otherwise default transparent (empty box + dark bg).
const alwaysFullLua = `function(allstates, event, ...)
    allstates[""] = { show = true, changed = true, progressType = "static", value = 1, total = 1 }
    return true
end`;

const BOX_W = 44, BOX_H = 20, PITCH = 50;
const startX = -((MAX_FELFURY - 1) * PITCH) / 2; // center the row
const felBoxes = [];
for (let i = 1; i <= MAX_FELFURY; i++) {
  const b = baseBar('Felsworn Felfury ' + i, 'felswrnFf0' + i);
  b.width = BOX_W; b.height = BOX_H;
  b.xOffset = startX + (i - 1) * PITCH;
  b.yOffset = -206;
  b.barColor = [0, 0, 0, 0];      // default: transparent fill (empty)
  b.barColor2 = [0, 0, 0, 0];
  b.backgroundColor = EMPTY_BG;   // dark empty-box background
  b.smoothProgress = false;
  b.progressSource = [-1, ''];
  b.triggers = {
    __array: [
      { untrigger: [], trigger: {
          type: 'aura2', unit: 'player', debuffType: 'HELPFUL',
          useName: true, auranames: ['Felfury'], names: [], spellIds: [], auraspellids: [],
          matchesShowOn: 'showAlways', ownOnly: true, unitExists: true,
          subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', event: 'Health'
      } },
      { untrigger: [], trigger: {
          type: 'custom', custom_type: 'stateupdate', check: 'event', custom_hide: 'custom',
          events: 'PLAYER_ENTERING_WORLD, OPTIONS',
          custom: alwaysFullLua,
          unit: 'player', debuffType: 'HELPFUL',
          subeventPrefix: 'SPELL', subeventSuffix: '_CAST_START', names: [], spellIds: []
      } }
    ],
    disjunctive: 'any', activeTriggerMode: 2
  };
  b.conditions = [
    {
      check: { op: '>=', trigger: 1, variable: 'stacks', value: String(i) },
      changes: [{ property: 'barColor', value: FELSWORN_GREEN.slice() }]
    }
  ];
  setText(b, '', 10); // no text on boxes
  felBoxes.push(b);
}

// ---- group ----
const group = clone(grpTpl);
group.id = GROUP_ID; group.uid = 'felswrnGrp002';
group.controlledChildren = ['Felsworn Energy', ...felBoxes.map(b => b.id)];
group.load = { talent: { multi: [] }, class: { multi: [] }, size: { multi: [] }, spec: { multi: [] } };
group.actions = safeActions(); group.conditions = [];
group.anchorFrameType = 'SCREEN'; group.anchorPoint = 'CENTER'; group.selfPoint = 'CENTER';
group.xOffset = 0; group.yOffset = 0;
delete group.wagoID; delete group.url; delete group.source; delete group.semver;

const top = { d: group, c: [energy, ...felBoxes], m: 'd', s: '5.20.2', v: 2000 };

fs.writeFileSync('felsworn-v2.decoded.json', JSON.stringify(top, null, 2));
const str = encodeWA(top);
fs.writeFileSync('felsworn-v2.import.txt', str);
const ok = JSON.stringify(decodeWA(str).data) === JSON.stringify(top);
console.log('v2 written: felsworn-v2.import.txt (' + str.length + ' chars) | self round-trip:', ok);
console.log('children:', top.c.map(x => x.id).join(', '));

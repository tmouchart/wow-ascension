// Post-process the scraped CoA dump (all 21 classes) into per-class folders.
// Input: a JSON file = { <ClassName>: { classId, specs:[...], specTabIds:{spec:[tabIds]}, nodes:{id:node} } }
// Usage: node coa-process.js <path-to-dump.json>
const fs = require('fs');
const path = require('path');

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const inPath = process.argv[2];
if (!inPath) { console.error('usage: node coa-process.js <dump.json>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

const OUT = path.join(__dirname, 'coa-classes');
fs.mkdirSync(OUT, { recursive: true });

const indexRows = [];
for (const [className, cls] of Object.entries(data)) {
  const dir = path.join(OUT, slug(className));
  fs.mkdirSync(dir, { recursive: true });
  const nodes = Object.values(cls.nodes || {});

  // Determine class-tree tabId = the tabId common to (present in) every spec's scrape.
  // specTabIds[spec] = list of tabIds seen while that spec was active (class tree + that spec).
  const specTabSets = cls.specTabIds || {};
  const specNames = cls.specs || [];
  let classTreeTab = null;
  const tabLists = Object.values(specTabSets);
  if (tabLists.length) {
    const common = tabLists.reduce((acc, arr) => acc.filter(t => arr.includes(t)), tabLists[0].slice());
    classTreeTab = common.length ? common[0] : null;
  }
  // Map each spec -> its unique tabId (the one not the class tree)
  const specToTab = {};
  for (const [sp, tabs] of Object.entries(specTabSets)) {
    const own = tabs.filter(t => t !== classTreeTab);
    specToTab[sp] = own.length ? own[0] : (tabs[0] ?? null);
  }
  // group nodes
  const byTab = {};
  for (const n of nodes) { (byTab[n.tabId] = byTab[n.tabId] || []).push(n); }
  const sortNodes = a => a.slice().sort((x, y) => (x.y - y.y) || (x.x - x.y) || (x.id - y.id));

  // raw dump
  fs.writeFileSync(path.join(dir, slug(className) + '-nodes.json'), JSON.stringify({
    class: className, classId: cls.classId, specs: specNames, classTreeTab, specToTab, nodes
  }, null, 2));

  // abilities markdown
  const tableFor = arr => {
    const rows = sortNodes(arr).map(n =>
      `| ${n.spellId} | ${n.name} | ${n.isPassive ? 'P' : 'A'} | ae${n.aeCost}/te${n.teCost} | ${n.maxPoints} | ${(n.desc || '').replace(/\|/g, '/').slice(0, 160)} |`);
    return ['| spellId | name | P/A | cost | rk | description |', '|---|---|---|---|---|---|', ...rows].join('\n');
  };
  let md = `# ${className} — CoA abilities (classId ${cls.classId})\n\n`;
  md += `Scraped from Ascension CoA builder (React fibers). \`spellId\` = castable id for WeakAuras.\n`;
  md += `Specs: **${specNames.join(', ')}**. Baseline (grimoire) spells are NOT here — add later.\n\n`;
  md += `## Class tree (tabId ${classTreeTab})\n\n${tableFor(byTab[classTreeTab] || [])}\n\n`;
  for (const sp of specNames) {
    const tab = specToTab[sp];
    md += `## ${sp} (tabId ${tab})\n\n${tableFor(byTab[tab] || [])}\n\n`;
  }
  fs.writeFileSync(path.join(dir, slug(className) + '-abilities.md'), md);

  indexRows.push(`- **${className}** (classId ${cls.classId}) — ${nodes.length} nodes, specs: ${specNames.join(', ')} → \`coa-classes/${slug(className)}/\``);
}

fs.writeFileSync(path.join(OUT, 'INDEX.md'),
  `# Conquest of Azeroth — scraped class data\n\n${Object.keys(data).length} classes.\n\n${indexRows.join('\n')}\n`);
console.log('processed', Object.keys(data).length, 'classes ->', OUT);

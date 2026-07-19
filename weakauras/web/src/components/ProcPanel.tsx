import { X } from 'lucide-react';
import { useStore, type Ref, type IconCfg } from '../store';
import { Group, Field, Note, ToggleRow, InfoTip, SubHead, toHex, fromHex, GLOW_STYLES } from './inspector-bits';
import { PROC_INFO, CLAUSE_INFO, GLOW_STYLE_INFO, GLOW_COLOR_INFO } from './inspector-help';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

// ---- per-proc editing: the composable `when` clause DSL (see lib/spec-builder.js whenProcIcon) ----
// The panel edits the normalized form { when, hide, glow, display }; a legacy proc (buff / execute /
// stealable sugar) is converted to it on the FIRST edit (procView reads either shape).

type Clause = Record<string, unknown>;
type ProcGlow = { color?: number[]; glowType?: string; when?: Clause[] };
type ProcDisplay = { timer?: string; stacks?: boolean; cooldownNumbers?: boolean; desaturateOnCd?: boolean };
type ProcView = { when: Clause[]; hide: string; glow?: ProcGlow; display: ProcDisplay };

const CLAUSE_TYPES: [string, string][] = [
  ['buff', 'Buff active'],
  ['buffMissing', 'Buff missing'],
  ['anyBuff', 'Any of buffs'],
  ['buffStacks', 'Buff stacks'],
  ['targetHpBelow', 'Target HP % <'],
  ['powerAtLeast', 'Power >='],
  ['spellReady', 'Spell ready'],
  ['charges', 'Charges'],
  ['stealable', 'Stealable on target'],
];
const OPS = ['>=', '<=', '==', '>', '<'];
// clauses that can drive show in 'collapse' mode (mirror of the generator's GATING_CLAUSES)
const GATING = new Set(['buff', 'anyBuff', 'targetHpBelow', 'powerAtLeast', 'stealable']);

const clauseType = (cl: Clause) => CLAUSE_TYPES.map(([k]) => k).find((k) => cl[k] !== undefined) ?? 'buff';

function defaultClause(type: string, icon: IconCfg): Clause {
  const name = (icon.label as string) ?? '';
  switch (type) {
    case 'anyBuff': return { anyBuff: [name] };
    case 'buffStacks': return { buffStacks: { name, op: '>=', value: 1 } };
    case 'targetHpBelow': return { targetHpBelow: 35 };
    case 'powerAtLeast': return { powerAtLeast: 50 };
    case 'spellReady': return { spellReady: true };
    case 'charges': return { charges: { op: '>=', value: 1 } };
    case 'stealable': return { stealable: true };
    default: return { [type]: name };   // buff / buffMissing
  }
}

// Read a proc icon as the normalized view, whatever shape it currently has (when-DSL or legacy sugar).
function procView(ic: IconCfg): ProcView {
  if (ic.when) {
    return { when: ic.when as Clause[], hide: (ic.hide as string) ?? 'slot', glow: ic.glow as ProcGlow | undefined, display: (ic.display as ProcDisplay) ?? {} };
  }
  const legacyGlow: ProcGlow = {
    ...(ic.glowColor ? { color: ic.glowColor as number[] } : {}),
    ...(ic.glowType ? { glowType: ic.glowType as string } : {}),
  };
  if (ic.stealable) return { when: [{ stealable: true }], hide: 'collapse', glow: legacyGlow, display: {} };
  if (ic.execute != null) return {
    when: [{ targetHpBelow: ic.execute }], hide: 'collapse',
    glow: { ...legacyGlow, ...(ic.glowAlways ? {} : { when: [{ spellReady: true }] }) },
    display: { desaturateOnCd: true, ...(ic.glowAlways ? { cooldownNumbers: false } : {}) },
  };
  if (ic.buff) return { when: [{ buff: ic.buff as string }], hide: 'slot', glow: legacyGlow, display: {} };
  return { when: [{ buff: (ic.label as string) ?? '' }], hide: 'slot', glow: {}, display: {} };
}

const inputCls = 'h-8 min-w-0 flex-1';
const tinyNum = 'h-8 w-[54px] shrink-0 text-right font-mono';

function OpSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-[62px] shrink-0 font-mono"><SelectValue /></SelectTrigger>
      <SelectContent>{OPS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function ClauseRow({ cl, icon, onChange, onRemove }: { cl: Clause; icon: IconCfg; onChange: (cl: Clause) => void; onRemove?: () => void }) {
  const type = clauseType(cl);
  const stacks = (cl.buffStacks ?? {}) as { name?: string; op?: string; value?: number };
  const charges = (cl.charges ?? {}) as { op?: string; value?: number };
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(t) => onChange(defaultClause(t, icon))}>
          <SelectTrigger size="sm" className="w-[148px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CLAUSE_TYPES.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(type === 'buff' || type === 'buffMissing') && (
          <Input className={inputCls} type="text" placeholder="Buff name" value={(cl[type] as string) ?? ''}
            onChange={(e) => onChange({ [type]: e.target.value })} />
        )}
        {type === 'anyBuff' && (
          <Input className={inputCls} type="text" placeholder="Name, name, ..." value={((cl.anyBuff as string[]) ?? []).join(', ')}
            onChange={(e) => onChange({ anyBuff: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        )}
        {(type === 'targetHpBelow' || type === 'powerAtLeast') && (
          <Input className={tinyNum} type="number" min={1} max={type === 'targetHpBelow' ? 100 : 1000} value={Number(cl[type] ?? 0)}
            onChange={(e) => onChange({ [type]: Number(e.target.value) })} />
        )}
        {type === 'charges' && (
          <>
            <OpSelect value={charges.op ?? '>='} onChange={(op) => onChange({ charges: { ...charges, op } })} />
            <Input className={tinyNum} type="number" min={0} value={Number(charges.value ?? 1)}
              onChange={(e) => onChange({ charges: { ...charges, value: Number(e.target.value) } })} />
          </>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <InfoTip text={CLAUSE_INFO[type]} />
          {onRemove && (
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
              title="Remove condition" onClick={onRemove}>
              <X className="size-3.5" />
            </Button>
          )}
        </span>
      </div>
      {type === 'buffStacks' && (
        <div className="mt-2 flex items-center gap-2 pl-2">
          <Input className={inputCls} type="text" placeholder="Buff name" value={stacks.name ?? ''}
            onChange={(e) => onChange({ buffStacks: { ...stacks, name: e.target.value } })} />
          <OpSelect value={stacks.op ?? '>='} onChange={(op) => onChange({ buffStacks: { ...stacks, op } })} />
          <Input className={tinyNum} type="number" min={0} value={Number(stacks.value ?? 1)}
            onChange={(e) => onChange({ buffStacks: { ...stacks, value: Number(e.target.value) } })} />
        </div>
      )}
    </div>
  );
}

function ClauseList({ clauses, icon, onChange, addLabel, removableToZero }: {
  clauses: Clause[]; icon: IconCfg; onChange: (clauses: Clause[]) => void; addLabel: string; removableToZero?: boolean;
}) {
  return (
    <div className="mb-3.5">
      {clauses.map((cl, i) => (
        <ClauseRow key={i} cl={cl} icon={icon}
          onChange={(next) => onChange(clauses.map((c, j) => (j === i ? next : c)))}
          onRemove={removableToZero || clauses.length > 1 ? () => onChange(clauses.filter((_, j) => j !== i)) : undefined} />
      ))}
      <Button variant="outline" size="sm" className="border-dashed text-muted-foreground"
        onClick={() => onChange([...clauses, defaultClause('buff', icon)])}>+ {addLabel}</Button>
    </div>
  );
}

export function ProcPanel({ sel, icon }: { sel: { ref: Ref; iconIndex: number }; icon: IconCfg }) {
  const setIconField = useStore((st) => st.setIconField);
  const select = useStore((st) => st.select);
  const view = procView(icon);

  // Every edit writes the FULL normalized form and drops the legacy sugar keys, so the icon is
  // when-DSL-shaped from the first change on (the generator accepts both shapes).
  function commit(next: Partial<ProcView>) {
    const v = { ...view, ...next };
    const setF = (key: string, value: unknown) => setIconField(sel.ref, sel.iconIndex, key, value);
    setF('when', v.when);
    setF('hide', v.hide === 'collapse' ? 'collapse' : undefined);
    setF('glow', v.glow);
    setF('display', Object.keys(v.display).length ? v.display : undefined);
    for (const k of ['buff', 'execute', 'stealable', 'glowAlways', 'glowColor', 'glowType']) setF(k, undefined);
  }
  const setDisplay = (patch: ProcDisplay) => {
    const d: ProcDisplay = { ...view.display, ...patch };
    if (!d.stacks) delete d.stacks;
    if (d.cooldownNumbers !== false) delete d.cooldownNumbers;
    if (!d.desaturateOnCd) delete d.desaturateOnCd;
    if (!d.timer || d.timer === 'cooldown') delete d.timer;
    commit({ display: d });
  };

  const glow = view.glow;
  const collapse = view.hide === 'collapse';
  const badCollapse = collapse && view.when.some((cl) => !GATING.has(clauseType(cl)));
  const hasAura = view.when.some((cl) => ['buff', 'anyBuff', 'buffStacks'].includes(clauseType(cl)));

  return (
    <Group title={`Proc: ${icon.label ?? String(icon.spell ?? '')}`} info={PROC_INFO.group}>
      <SubHead info={PROC_INFO.showWhen}>Show when (all must pass)</SubHead>
      <ClauseList clauses={view.when} icon={icon} addLabel="condition" onChange={(when) => commit({ when })} />

      <Field label="When hidden" info={PROC_INFO.hide}>
        <Select value={view.hide} onValueChange={(hide) => commit({ hide })}>
          <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="slot">Keeps its slot</SelectItem>
            <SelectItem value="collapse">Row recenters</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {badCollapse && <Note>"Row recenters" only supports buff / any-of / target HP / power / stealable conditions — switch back to "Keeps its slot" or remove the others.</Note>}

      <ToggleRow label="Glow" on={!!glow} onToggle={() => commit({ glow: glow ? undefined : {} })} info={PROC_INFO.glowToggle} />
      {glow && (
        <>
          <Field label="Glow style" info={GLOW_STYLE_INFO}>
            <Select value={glow.glowType ?? 'buttonOverlay'} onValueChange={(v) => commit({ glow: { ...glow, glowType: v } })}>
              <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GLOW_STYLES.map((v) => <SelectItem key={v} value={v}>{v === 'buttonOverlay' ? 'Action Button' : v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Glow color" info={GLOW_COLOR_INFO}>
            <input type="color" value={toHex(glow.color)} onChange={(e) => commit({ glow: { ...glow, color: fromHex(e.target.value) } })}
              className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5" />
          </Field>
          <SubHead info={PROC_INFO.glowExtra}>Glow only when (extra)</SubHead>
          <ClauseList clauses={glow.when ?? []} icon={icon} addLabel="glow condition" removableToZero
            onChange={(w) => { const { when: _omit, ...rest } = glow; void _omit; commit({ glow: w.length ? { ...rest, when: w } : rest }); }} />
          <Note>No extra condition = glow whenever the proc is shown.</Note>
        </>
      )}

      <Field label="Timer / swipe" info={PROC_INFO.timer}>
        <Select value={view.display.timer ?? 'cooldown'} onValueChange={(v) => setDisplay({ timer: v })}>
          <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cooldown">Spell cooldown</SelectItem>
            <SelectItem value="buff" disabled={!hasAura}>Buff duration</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <ToggleRow label="Stack count" on={!!view.display.stacks} onToggle={() => setDisplay({ stacks: !view.display.stacks })} info={PROC_INFO.stacks} />
      <ToggleRow label="Cooldown numbers" on={view.display.cooldownNumbers !== false} onToggle={() => setDisplay({ cooldownNumbers: view.display.cooldownNumbers === false })} info={PROC_INFO.cooldownNumbers} />
      <ToggleRow label="Grey while on CD" on={!!view.display.desaturateOnCd} onToggle={() => setDisplay({ desaturateOnCd: !view.display.desaturateOnCd })} info={PROC_INFO.desaturate} />

      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => select(null)}>Done</Button>
      </div>
    </Group>
  );
}

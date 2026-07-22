import { X } from 'lucide-react';
import { useStore, POWER_NAMES, type El, type IconCfg } from '../store';
import { InfoTip } from './inspector-bits';
import { CLAUSE_INFO } from './inspector-help';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

// ---- the composable clause DSL, shared by the unified IconPanel (showWhen[] and glow.when[]) ----
// Mirrors the generator's clause vocabulary (lib/spec-builder.js clauseToCheck / clauseKind).

export type Clause = Record<string, unknown>;

export const CLAUSE_TYPES: [string, string][] = [
  ['buff', 'Buff active'],
  ['buffMissing', 'Buff missing'],
  ['anyBuff', 'Any of buffs'],
  ['buffStacks', 'Buff stacks'],
  ['targetHpBelow', 'Target HP % <'],
  ['powerAtLeast', 'Resource >='],
  ['powerPctAtLeast', 'Resource % >='],
  ['spellReady', 'Spell ready'],
  ['charges', 'Charges'],
  ['stealable', 'Stealable on target'],
];
// Vocabulary for a `stacks` element's GLOW IF: its own stack count comes first; spellReady/charges
// need a spell (a stacks element has no cooldown trigger). Mirrors the generator's stacks validation.
export const STACKS_CLAUSE_TYPES: [string, string][] = [
  ['stacksAtLeast', 'Stacks reach'],
  ...CLAUSE_TYPES.filter(([k]) => k !== 'spellReady' && k !== 'charges'),
];
const ALL_TYPE_KEYS = [...new Set([...STACKS_CLAUSE_TYPES, ...CLAUSE_TYPES].map(([k]) => k))];
const OPS = ['>=', '<=', '==', '>', '<'];
// clauses that can drive show in 'collapse' mode (mirror of the generator's GATING_CLAUSES)
export const GATING = new Set(['buff', 'anyBuff', 'targetHpBelow', 'powerAtLeast', 'stealable']);

export const clauseType = (cl: Clause) => ALL_TYPE_KEYS.find((k) => cl[k] !== undefined) ?? 'buff';

// The SPEC's primary resource type (its powerBar), used to seed new power clauses — the generator's
// default is 3 (Energy), which silently lies for a Mana/Rage class, so we always write it explicitly.
const usePrimaryPowerType = () =>
  useStore((st) => Number((st.spec.stack as El[]).find((e) => e.kind === 'powerBar')?.powerType ?? 3));

export function defaultClause(type: string, icon: IconCfg, powerType = 3): Clause {
  const name = (icon.label as string) ?? '';
  switch (type) {
    case 'stacksAtLeast': return { stacksAtLeast: 1 };
    case 'anyBuff': return { anyBuff: [name] };
    case 'buffStacks': return { buffStacks: { name, op: '>=', value: 1 } };
    case 'targetHpBelow': return { targetHpBelow: 35 };
    case 'powerAtLeast': return { powerAtLeast: 50, powerType };
    case 'powerPctAtLeast': return { powerPctAtLeast: 60, powerType };
    case 'spellReady': return { spellReady: true };
    case 'charges': return { charges: { op: '>=', value: 1 } };
    case 'stealable': return { stealable: true };
    default: return { [type]: name };   // buff / buffMissing
  }
}

const inputCls = 'h-8 min-w-0 flex-1';
const tinyNum = 'h-8 w-[72px] shrink-0 text-right font-mono';   // fits 3 digits + the number spinner

function OpSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-[62px] shrink-0 font-mono"><SelectValue /></SelectTrigger>
      <SelectContent>{OPS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function ClauseRow({ cl, icon, types, onChange, onRemove }: { cl: Clause; icon: IconCfg; types: [string, string][]; onChange: (cl: Clause) => void; onRemove?: () => void }) {
  const type = clauseType(cl);
  const primaryPower = usePrimaryPowerType();
  const stacks = (cl.buffStacks ?? {}) as { name?: string; op?: string; value?: number };
  const charges = (cl.charges ?? {}) as { op?: string; value?: number };
  // a stored clause without powerType runs on the generator's default (3 = Energy) — display that truth
  const powerType = Number(cl.powerType ?? 3);
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(t) => onChange(defaultClause(t, icon, primaryPower))}>
          <SelectTrigger size="sm" className="w-[148px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {types.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
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
        {(type === 'targetHpBelow' || type === 'powerAtLeast' || type === 'powerPctAtLeast' || type === 'stacksAtLeast') && (
          <Input className={tinyNum} type="number" min={1} max={type === 'powerAtLeast' ? 1000 : type === 'stacksAtLeast' ? 20 : 100} value={Number(cl[type] ?? 0)}
            onChange={(e) => onChange({ ...cl, [type]: Number(e.target.value) })} />
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
      {(type === 'powerAtLeast' || type === 'powerPctAtLeast') && (
        <div className="mt-2 flex items-center gap-2 pl-2">
          <Select value={String(powerType)} onValueChange={(v) => onChange({ [type]: cl[type], powerType: Number(v) })}>
            <SelectTrigger size="sm" className="w-[148px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* a powerType outside the known set (e.g. from an imported string) keeps its own entry */}
              {POWER_NAMES[powerType] == null && <SelectItem value={String(powerType)}>Type {powerType}</SelectItem>}
              {Object.entries(POWER_NAMES).map(([idx, name]) => (
                <SelectItem key={idx} value={idx}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export function ClauseList({ clauses, icon, onChange, addLabel, removableToZero, types = CLAUSE_TYPES }: {
  clauses: Clause[]; icon: IconCfg; onChange: (clauses: Clause[]) => void; addLabel: string; removableToZero?: boolean;
  types?: [string, string][];
}) {
  return (
    <div className="mb-3.5">
      {clauses.map((cl, i) => (
        <ClauseRow key={i} cl={cl} icon={icon} types={types}
          onChange={(next) => onChange(clauses.map((c, j) => (j === i ? next : c)))}
          onRemove={removableToZero || clauses.length > 1 ? () => onChange(clauses.filter((_, j) => j !== i)) : undefined} />
      ))}
      <Button variant="outline" size="sm" className="border-dashed text-muted-foreground"
        onClick={() => onChange([...clauses, defaultClause(types[0][0], icon)])}>+ {addLabel}</Button>
    </div>
  );
}

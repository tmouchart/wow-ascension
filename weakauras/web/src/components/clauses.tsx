import { X } from 'lucide-react';
import type { IconCfg } from '../store';
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
  ['powerAtLeast', 'Power >='],
  ['powerPctAtLeast', 'Power % >='],
  ['spellReady', 'Spell ready'],
  ['charges', 'Charges'],
  ['stealable', 'Stealable on target'],
];
const OPS = ['>=', '<=', '==', '>', '<'];
// clauses that can drive show in 'collapse' mode (mirror of the generator's GATING_CLAUSES)
export const GATING = new Set(['buff', 'anyBuff', 'targetHpBelow', 'powerAtLeast', 'stealable']);

export const clauseType = (cl: Clause) => CLAUSE_TYPES.map(([k]) => k).find((k) => cl[k] !== undefined) ?? 'buff';

export function defaultClause(type: string, icon: IconCfg): Clause {
  const name = (icon.label as string) ?? '';
  switch (type) {
    case 'anyBuff': return { anyBuff: [name] };
    case 'buffStacks': return { buffStacks: { name, op: '>=', value: 1 } };
    case 'targetHpBelow': return { targetHpBelow: 35 };
    case 'powerAtLeast': return { powerAtLeast: 50 };
    case 'powerPctAtLeast': return { powerPctAtLeast: 60 };
    case 'spellReady': return { spellReady: true };
    case 'charges': return { charges: { op: '>=', value: 1 } };
    case 'stealable': return { stealable: true };
    default: return { [type]: name };   // buff / buffMissing
  }
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
        {(type === 'targetHpBelow' || type === 'powerAtLeast' || type === 'powerPctAtLeast') && (
          <Input className={tinyNum} type="number" min={1} max={type === 'powerAtLeast' ? 1000 : 100} value={Number(cl[type] ?? 0)}
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

export function ClauseList({ clauses, icon, onChange, addLabel, removableToZero }: {
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

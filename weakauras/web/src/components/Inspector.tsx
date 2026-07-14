import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useStore, elementLabel, type El, type Spec, type Ref, type IconCfg } from '../store';
import { powerIndexConfirmed, BAR_PRESETS } from '../lib/defaultSpec';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const SLIDERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'barWidth', label: 'Bar width', min: 150, max: 320 },
  { key: 'iconSize', label: 'Icon size', min: 18, max: 44 },
  { key: 'secIconSize', label: 'Secondary icon', min: 16, max: 40 },
  { key: 'gap', label: 'Gap', min: 0, max: 10 },
];

// The kinds the user can freely add (and therefore remove); the rest ships with the class SPEC.
const REMOVABLE = new Set(['powerBar', 'healthBar', 'uptimeBar', 'stacks']);

// The generator derives a region id from el.id (or a per-kind default like "<spec> Power") — two bars with
// the same effective id would collide (same region id -> same uid). Mirror those defaults when uniquifying.
const effectiveId = (spec: Spec, el: El): string | undefined =>
  (el.id as string | undefined) ??
  (el.kind === 'powerBar' ? `${spec.id} Power`
    : el.kind === 'healthBar' ? `${spec.id} Health`
    : el.kind === 'stacks' ? `${spec.id} Stack`
    : el.kind === 'uptimeBar' ? `${spec.id} ${typeof el.buff === 'string' ? el.buff : 'Uptime'}`
    : undefined);

// ---- per-icon glow editing (cdRow / side-rail icons -> the spec-builder `glow` object) ----
type Glow = { type?: string; buff?: string; power?: number; pct?: number; color?: number[]; glowType?: string };
const GLOW_RULES: [string, string][] = [
  ['', 'None'],
  ['buff', 'While buff active'],
  ['buffMissing', 'When buff missing'],
  ['ready', 'When ready'],
  ['readyPower', 'Ready + power >='],
  ['powerPct', 'Power % >='],
  ['targetHealthBelow', 'Target HP % <'],
];
const GLOW_STYLES = ['buttonOverlay', 'Pixel', 'ACShine'];
const NONE = '__none__'; // Radix Select forbids an empty-string item value; map the "None" glow rule to this

const toHex = (c?: number[]) =>
  '#' + (c ?? [1, 1, 1]).slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): number[] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);

// ---- small presentational helpers (shared across the inspector) ----
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mb-6">
    <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </div>
);
const Field = ({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) => (
  <div className={cn('mb-3.5 grid grid-cols-[1fr_auto] items-center gap-2.5', className)}>
    <label className="text-sm">{label}</label>
    {children}
  </div>
);
const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
);
const ToggleRow = ({ label, on, onToggle, extra }: { label: ReactNode; on: boolean; onToggle: () => void; extra?: ReactNode }) => (
  <div className="flex items-center justify-between border-t py-2.5 text-sm first:border-t-0">
    <span>{label}</span>
    <span className="flex items-center gap-2.5">
      {extra}
      <Switch checked={on} onCheckedChange={onToggle} />
    </span>
  </div>
);
const numCls = 'h-8 w-[74px] text-right font-mono';

function IconPanel({ sel, icon }: { sel: { ref: Ref; iconIndex: number }; icon: IconCfg }) {
  const setIconField = useStore((st) => st.setIconField);
  const select = useStore((st) => st.select);
  const setF = (key: string, value: unknown) => setIconField(sel.ref, sel.iconIndex, key, value);
  const glow = icon.glow as Glow | undefined;
  const setGlow = (patch: Partial<Glow> | undefined) =>
    setF('glow', patch === undefined ? undefined : { ...glow, ...patch });

  function pickRule(type: string) {
    if (!type) return setF('glow', undefined);
    const next: Glow = {
      type,
      color: glow?.color ?? [1, 1, 1, 1],
      // taxonomy default: passive buff-up state = Pixel; every "act now" cue = Action Button Glow
      glowType: glow?.glowType ?? (type === 'buff' ? 'Pixel' : 'buttonOverlay'),
    };
    if (type === 'buff' || type === 'buffMissing') next.buff = glow?.buff ?? (icon.label || '');
    if (type === 'readyPower') next.power = glow?.power ?? 50;
    if (type === 'powerPct') next.pct = glow?.pct ?? 60;
    if (type === 'targetHealthBelow') next.pct = glow?.pct ?? 35;
    setF('glow', next);
  }

  const rule = glow?.type ?? '';
  return (
    <Group title={`Icon: ${icon.label ?? String(icon.spell)}`}>
      <Field label="Glow rule">
        <Select value={rule || NONE} onValueChange={(v) => pickRule(v === NONE ? '' : v)}>
          <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GLOW_RULES.map(([v, label]) => <SelectItem key={v} value={v || NONE}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {(rule === 'buff' || rule === 'buffMissing') && (
        <Field label="Buff name">
          <Input className="h-8 w-[150px]" type="text" value={glow?.buff ?? ''}
            onChange={(e) => setGlow({ buff: e.target.value })} />
        </Field>
      )}
      {rule === 'readyPower' && (
        <Field label="Power >=">
          <Input className={numCls} type="number" value={glow?.power ?? 50}
            onChange={(e) => setGlow({ power: Number(e.target.value) })} />
        </Field>
      )}
      {(rule === 'powerPct' || rule === 'targetHealthBelow') && (
        <Field label={rule === 'powerPct' ? 'Power % >=' : 'Target HP % <'}>
          <Input className={numCls} type="number" min={1} max={100} value={glow?.pct ?? 35}
            onChange={(e) => setGlow({ pct: Number(e.target.value) })} />
        </Field>
      )}
      {rule && (
        <>
          <Field label="Glow style">
            <Select value={glow?.glowType ?? 'buttonOverlay'} onValueChange={(v) => setGlow({ glowType: v })}>
              <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GLOW_STYLES.map((v) => <SelectItem key={v} value={v}>{v === 'buttonOverlay' ? 'Action Button' : v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Glow color">
            <input type="color" value={toHex(glow?.color)} onChange={(e) => setGlow({ color: fromHex(e.target.value) })}
              className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5" />
          </Field>
        </>
      )}
      <ToggleRow label="Charge count" on={!!icon.charges} onToggle={() => setF('charges', icon.charges ? undefined : true)} />
      <Field label="Show at power >=">
        <Input className={numCls} type="number" min={0} placeholder="off"
          value={Number(icon.showPowerAbove ?? 0)}
          onChange={(e) => setF('showPowerAbove', Number(e.target.value) || undefined)} />
      </Field>
      <Note>0 = always shown. One glow rule per icon (glow style = urgency, color = meaning).</Note>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => select(null)}>Done</Button>
      </div>
    </Group>
  );
}

// Inline fields for the element kinds whose data is a buff name (the SPEC-shipped rows keep their curated data).
function ElementFields({ el, index }: { el: El; index: number }) {
  const setElementField = useStore((st) => st.setElementField);
  if (el.kind === 'uptimeBar' && typeof el.buff === 'string') {
    return (
      <Field label="Buff">
        <Input className="h-8 w-[150px]" type="text" value={el.buff}
          onChange={(e) => {
            setElementField(index, 'buff', e.target.value);
            setElementField(index, 'label', `${e.target.value}  %p`);
            setElementField(index, 'warnText', e.target.value.toUpperCase() + ' MISSING');
          }} />
      </Field>
    );
  }
  if (el.kind === 'stacks') {
    return (
      <Field label="Buff">
        <span className="flex items-center gap-2.5">
          <Input className="h-8 w-24" type="text" value={(el.auraNames as string[])?.[0] ?? ''}
            onChange={(e) => setElementField(index, 'auraNames', [e.target.value])} />
          <Input className="h-8 w-[52px] text-right font-mono" type="number" min={2} max={12} title="Boxes"
            value={Number(el.count ?? 5)}
            onChange={(e) => setElementField(index, 'count', Number(e.target.value))} />
        </span>
      </Field>
    );
  }
  return null;
}

export function Inspector({ slug }: { slug: string }) {
  const spec = useStore((st) => st.spec);
  const sel = useStore((st) => st.sel);
  const setGlobal = useStore((st) => st.setGlobal);
  const setCombatOnly = useStore((st) => st.setCombatOnly);
  const toggleElement = useStore((st) => st.toggleElement);
  const setElementField = useStore((st) => st.setElementField);
  const addElement = useStore((st) => st.addElement);
  const removeElement = useStore((st) => st.removeElement);

  const powerBars = spec.stack.map((el, i) => [el, i] as const).filter(([el]) => el.kind === 'powerBar');
  const confirmed = powerIndexConfirmed(slug);
  const selIcon = sel == null ? undefined
    : (sel.ref === 'left' ? spec.left : sel.ref === 'right' ? spec.right : spec.stack[sel.ref])?.icons?.[sel.iconIndex];

  function addBar(key: keyof typeof BAR_PRESETS) {
    const preset = BAR_PRESETS[key];
    const taken = new Set(spec.stack.map((el) => effectiveId(spec, el)).filter(Boolean));
    const base = `${spec.id} ${preset.title}`;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base} ${n}`;
    addElement({ ...preset.el, id });
  }

  return (
    <aside className="min-h-0 overflow-auto border-l bg-[image:var(--grad-pane)]">
      <div className="sticky top-0 z-[2] flex items-center justify-between border-b bg-[image:var(--grad-bar)] px-4 py-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Inspector</h2>
        <span className="text-[13px] text-muted-foreground">{sel && selIcon ? 'Icon' : 'Global'}</span>
      </div>
      <div className="p-4">
        {sel && selIcon && <IconPanel sel={sel} icon={selIcon} />}

        <Group title="Layout">
          {SLIDERS.map(({ key, label, min, max }) => (
            <div className="mb-3.5" key={key}>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm">{label}</label>
                <span className="font-mono text-[13px] text-muted-foreground">{spec.global[key]}</span>
              </div>
              <Slider min={min} max={max} value={[Number(spec.global[key])]}
                onValueChange={([v]) => setGlobal(key, v)} />
            </div>
          ))}
          <ToggleRow label="Combat only" on={!!spec.combatOnly} onToggle={() => setCombatOnly(!spec.combatOnly)} />
        </Group>

        {powerBars.length > 0 && (
          <Group title="Resource">
            {powerBars.map(([el, i]) => (
              <Field label={`${elementLabel(el)} index`} key={el._uid ?? i}>
                <Input className={numCls} type="number" min={0} max={20}
                  value={Number(el.powerType ?? 0)}
                  onChange={(e) => setElementField(i, 'powerType', Number(e.target.value))} />
              </Field>
            ))}
            {!confirmed && <Note>Unconfirmed for this class — verify in-game (UnitPower) and set the right index. Names don't map to standard indices on this realm.</Note>}
          </Group>
        )}

        <Group title="Elements">
          {spec.stack.map((el, i) => (
            <div key={el._uid ?? i}>
              <ToggleRow
                label={elementLabel(el)}
                on={el.enabled !== false}
                onToggle={() => toggleElement(i)}
                extra={REMOVABLE.has(el.kind) ? (
                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                    title="Remove" onClick={() => removeElement(i)}>
                    <X className="size-3.5" />
                  </Button>
                ) : undefined}
              />
              <ElementFields el={el} index={i} />
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(BAR_PRESETS) as (keyof typeof BAR_PRESETS)[]).map((k) => (
              <Button key={k} variant="outline" size="sm" className="border-dashed text-muted-foreground"
                onClick={() => addBar(k)}>+ {BAR_PRESETS[k].title}</Button>
            ))}
          </div>
          <Note>Drag an element's grip in the preview to reorder the stack (bars above or below any CD row). Side columns stay put. Click an icon to edit its glow.</Note>
        </Group>
      </div>
    </aside>
  );
}

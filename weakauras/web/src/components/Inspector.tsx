import { X } from 'lucide-react';
import { useStore, elementLabel, type El, type Spec } from '../store';
import { powerIndexConfirmed, BAR_PRESETS } from '../lib/defaultSpec';
import { Group, Field, Note, ToggleRow, InfoTip, numCls } from './inspector-bits';
import { ELEMENT_INFO, ELEMENT_FIELD_INFO, LAYOUT_INFO, POWER_INDEX_INFO } from './inspector-help';
import { IconPanel } from './IconPanel';
import { RowPanel } from './RowPanel';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';

const SLIDERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'barWidth', label: 'Bar width', min: 150, max: 320 },
  { key: 'iconSize', label: 'Icon size', min: 18, max: 44 },
  { key: 'secIconSize', label: 'Secondary icon', min: 16, max: 40 },
  { key: 'gap', label: 'Gap', min: 0, max: 10 },
];

// The kinds the user can freely add (and therefore remove); the rest ships with the class SPEC.
const REMOVABLE = new Set(['powerBar', 'healthBar', 'uptimeBar', 'stacks', 'chargeStacks', 'stackBar', 'buffWarnText', 'iconRow']);

// The generator derives a region id from el.id (or a per-kind default like "<spec> Power") — two bars with
// the same effective id would collide (same region id -> same uid). Mirror those defaults when uniquifying.
const effectiveId = (spec: Spec, el: El): string | undefined =>
  (el.id as string | undefined) ??
  (el.kind === 'powerBar' ? `${spec.id} Power`
    : el.kind === 'healthBar' ? `${spec.id} Health`
    : el.kind === 'stacks' ? `${spec.id} Stack`
    : el.kind === 'chargeStacks' ? `${spec.id} Charge`
    : el.kind === 'stackBar' ? `${spec.id} ${typeof el.aura === 'string' ? el.aura : 'Stack'}`
    : el.kind === 'buffWarnText' ? `${spec.id} Warn - ${el.buff}`
    : el.kind === 'uptimeBar' ? `${spec.id} ${typeof el.buff === 'string' ? el.buff : 'Uptime'}`
    : el.kind === 'iconRow' ? `${spec.id} Icons`
    : undefined);

// Inline fields for the element kinds whose data is a buff name (the SPEC-shipped rows keep their curated data).
function ElementFields({ el, index }: { el: El; index: number }) {
  const setElementField = useStore((st) => st.setElementField);
  if (el.kind === 'uptimeBar' && typeof el.buff === 'string') {
    return (
      <Field label="Buff" info={ELEMENT_FIELD_INFO.uptimeBar}>
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
      <Field label="Buff" info={ELEMENT_FIELD_INFO.stacks}>
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
  if (el.kind === 'chargeStacks') {
    // manual entry is a spell name → track it by name (matching the by-name charge trigger)
    return (
      <Field label="Spell" info={ELEMENT_FIELD_INFO.chargeStacks}>
        <span className="flex items-center gap-2.5">
          <Input className="h-8 w-24" type="text" value={(el.spell as string) ?? ''}
            onChange={(e) => { setElementField(index, 'spell', e.target.value); setElementField(index, 'byName', true); }} />
          <Input className="h-8 w-[52px] text-right font-mono" type="number" min={2} max={10} title="Boxes"
            value={Number(el.count ?? 3)}
            onChange={(e) => setElementField(index, 'count', Number(e.target.value))} />
        </span>
      </Field>
    );
  }
  if (el.kind === 'stackBar') {
    return (
      <Field label="Aura / max" info={ELEMENT_FIELD_INFO.stackBar}>
        <span className="flex items-center gap-2.5">
          <Input className="h-8 w-24" type="text" value={(el.aura as string) ?? ''}
            onChange={(e) => setElementField(index, 'aura', e.target.value)} />
          <Input className="h-8 w-[52px] text-right font-mono" type="number" min={1} title="Max"
            value={Number(el.max ?? 100)}
            onChange={(e) => setElementField(index, 'max', Number(e.target.value))} />
        </span>
      </Field>
    );
  }
  if (el.kind === 'buffWarnText') {
    return (
      <Field label="Buff / text" info={ELEMENT_FIELD_INFO.buffWarnText}>
        <span className="flex items-center gap-2.5">
          <Input className="h-8 w-24" type="text" placeholder="Buff" value={(el.buff as string) ?? ''}
            onChange={(e) => setElementField(index, 'buff', e.target.value)} />
          <Input className="h-8 w-24" type="text" placeholder="MISSING" value={(el.text as string) ?? ''}
            onChange={(e) => setElementField(index, 'text', e.target.value)} />
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
  const selContainer = sel == null ? undefined
    : (sel.ref === 'left' ? spec.left : sel.ref === 'right' ? spec.right : spec.stack[sel.ref]);
  const selIcon = sel && sel.iconIndex !== null ? selContainer?.icons?.[sel.iconIndex] : undefined;
  // a selected ROW (iconIndex null) — v1: central-stack iconRows only (rails are not row-selectable yet)
  const selRow = sel != null && sel.iconIndex === null && typeof sel.ref === 'number' && selContainer?.kind === 'iconRow';

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
        <span className="text-[13px] text-muted-foreground">{selRow ? 'Row' : sel && selIcon ? 'Icon' : 'Global'}</span>
      </div>
      <div className="p-4">
        {sel && selIcon && sel.iconIndex !== null && <IconPanel sel={{ ref: sel.ref, iconIndex: sel.iconIndex }} icon={selIcon} />}
        {selRow && <RowPanel el={selContainer!} index={sel!.ref as number} />}

        <Group title="Layout">
          {SLIDERS.map(({ key, label, min, max }) => (
            <div className="mb-3.5" key={key}>
              <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-sm">{label}<InfoTip text={LAYOUT_INFO[key]} /></label>
                <span className="font-mono text-[13px] text-muted-foreground">{spec.global[key]}</span>
              </div>
              <Slider min={min} max={max} value={[Number(spec.global[key])]}
                onValueChange={([v]) => setGlobal(key, v)} />
            </div>
          ))}
          <ToggleRow label="Combat only" on={!!spec.combatOnly} onToggle={() => setCombatOnly(!spec.combatOnly)} info={LAYOUT_INFO.combatOnly} />
        </Group>

        {powerBars.length > 0 && (
          <Group title="Resource" info={POWER_INDEX_INFO}>
            {powerBars.map(([el, i]) => (
              <Field label={`${elementLabel(el)} index`} info={POWER_INDEX_INFO} key={el._uid ?? i}>
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
                info={ELEMENT_INFO[el.kind]}
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
          <Note>Drag an element's grip in the preview to reorder the stack. Side columns stay put. Click an icon to edit it, or click a row's background to edit the row (size, spacing, …).</Note>
        </Group>
      </div>
    </aside>
  );
}

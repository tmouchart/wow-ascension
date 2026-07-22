import { useStore, elementLabel, POWER_NAMES, type El } from '../store';
import { powerIndexConfirmed, POWER_COLOR, DEFAULT_COLOR } from '../lib/defaultSpec';
import { REMOVABLE } from '../lib/elements';
import { Group, Field, Note, ToggleRow, OverrideSlider, toHex, fromHex } from './inspector-bits';
import { ELEMENT_INFO, ELEMENT_FIELD_INFO, ELEMENT_ENABLED_INFO, BAR_INFO, POWER_INDEX_INFO } from './inspector-help';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// Which kinds can override the global width (healthBar can't: the import decompiler uses its width as the
// ground truth for the global width), and which have a height (bars 14, segment boxes 12).
const WIDTH_KINDS = new Set(['powerBar', 'stackBar', 'uptimeBar']);
const HEIGHT_DEFAULT: Record<string, number> = { powerBar: 14, healthBar: 14, stackBar: 14, uptimeBar: 14, stacks: 12, chargeStacks: 12 };
// Kinds whose fill is a plain hi->lo gradient the user can recolor (uptimeBar's colors are condition-driven).
const COLOR_KINDS = new Set(['powerBar', 'healthBar', 'stackBar', 'stacks', 'chargeStacks']);
const swatchCls = 'h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5';

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

// Per-element inspector (a selected bar / stack boxes / warn text — every stack element except icon rows,
// which get RowPanel). Opened by clicking the element in the preview. Width/height apply to THIS element
// only; the global Layout group is hidden while it's open.
export function ElementPanel({ el, index, slug }: { el: El; index: number; slug: string }) {
  const setElementField = useStore((st) => st.setElementField);
  const toggleElement = useStore((st) => st.toggleElement);
  const removeElement = useStore((st) => st.removeElement);
  const barWidth = useStore((st) => Number(st.spec.global.barWidth));

  return (
    <Group title={elementLabel(el)} info={ELEMENT_INFO[el.kind]}>
      <ElementFields el={el} index={index} />
      {WIDTH_KINDS.has(el.kind) && (
        <OverrideSlider label="Width" info={BAR_INFO.width} min={100} max={320}
          value={el.width as number | undefined} fallback={barWidth} fallbackTag="global"
          onChange={(v) => setElementField(index, 'width', v)} />
      )}
      {el.kind in HEIGHT_DEFAULT && (
        <OverrideSlider label="Bar height" info={BAR_INFO.height} min={6} max={40}
          value={el.height as number | undefined} fallback={HEIGHT_DEFAULT[el.kind]} fallbackTag="default"
          onChange={(v) => setElementField(index, 'height', v)} />
      )}
      {COLOR_KINDS.has(el.kind) && (
        <Field label="Color" info={BAR_INFO.color}>
          <span className="flex items-center gap-2">
            <input type="color" title="Gradient top" value={toHex(el.hi as number[])}
              onChange={(e) => setElementField(index, 'hi', fromHex(e.target.value))} className={swatchCls} />
            <input type="color" title="Gradient bottom" value={toHex(el.lo as number[])}
              onChange={(e) => setElementField(index, 'lo', fromHex(e.target.value))} className={swatchCls} />
          </span>
        </Field>
      )}
      {el.kind === 'healthBar' && <Note>Width follows Global width.</Note>}
      {el.kind === 'powerBar' && (
        <>
          <Field label="Resource type" info={POWER_INDEX_INFO}>
            <Select value={String(Number(el.powerType ?? 0))}
              onValueChange={(v) => {
                const idx = Number(v);
                setElementField(index, 'powerType', idx);
                // adopt the picked resource's identity: its default colors + its name as the bar title
                const name = POWER_NAMES[idx];
                if (name) {
                  const [hi, lo] = POWER_COLOR[name] ?? DEFAULT_COLOR;
                  setElementField(index, 'hi', hi.slice());
                  setElementField(index, 'lo', lo.slice());
                  setElementField(index, 'title', name);
                }
              }}>
              <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* a powerType outside the known set (e.g. from an imported string) keeps its own entry */}
                {POWER_NAMES[Number(el.powerType ?? 0)] == null && (
                  <SelectItem value={String(Number(el.powerType ?? 0))}>Type {Number(el.powerType ?? 0)}</SelectItem>
                )}
                {Object.entries(POWER_NAMES).map(([idx, name]) => (
                  <SelectItem key={idx} value={idx}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!powerIndexConfirmed(slug) && <Note>Unconfirmed for this class — if the bar stays empty in-game, try another type (CoA custom resources can sit on an unexpected one, e.g. Barbarian Rage is actually Energy).</Note>}
        </>
      )}
      <ToggleRow label="Enabled" on={el.enabled !== false} onToggle={() => toggleElement(index)} info={ELEMENT_ENABLED_INFO} />
      {REMOVABLE.has(el.kind) && (
        <Button variant="outline" size="sm" className="mt-3 w-full text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => removeElement(index)}>Remove</Button>
      )}
    </Group>
  );
}

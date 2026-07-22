import { useStore, elementLabel, type El } from '../store';
import { Group, Field, InfoTip, ToggleRow, numCls } from './inspector-bits';
import { ROW_INFO, ELEMENT_ENABLED_INFO } from './inspector-help';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';

// Per-row inspector (a selected icon row). Every field overrides the global style for THIS row only; clearing
// a field falls back to the global value. Writes go through setElementField (undefined deletes the override).
export function RowPanel({ el, index }: { el: El; index: number }) {
  const setElementField = useStore((st) => st.setElementField);
  const g = useStore((st) => st.spec.global);
  const removeElement = useStore((st) => st.removeElement);
  const toggleElement = useStore((st) => st.toggleElement);
  const setF = (key: string, value: unknown) => setElementField(index, key, value);

  const defaultSize = el.secondary ? g.secIconSize : g.iconSize;
  const size = (el.size as number) ?? defaultSize;
  const perRow = el.perRow as number | undefined;
  const iconGap = el.iconGap as number | undefined;

  return (
    <Group title={`Row: ${elementLabel(el)}`} info={ROW_INFO.group}>
      <div className="mb-3.5">
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-sm">Icon size <InfoTip text={ROW_INFO.size} /></label>
          <span className="font-mono text-[13px] text-muted-foreground">
            {size}{el.size == null && <span className="ml-1 opacity-60">global</span>}
          </span>
        </div>
        <Slider min={14} max={48} value={[size]} onValueChange={([v]) => setF('size', v)} />
        {el.size != null && (
          <Button variant="ghost" size="sm" className="mt-1.5 h-6 px-2 text-xs text-muted-foreground"
            onClick={() => setF('size', undefined)}>Reset to global ({defaultSize})</Button>
        )}
      </div>

      <Field label="Icons per row" info={ROW_INFO.perRow}>
        <Input className={numCls} type="number" min={1} max={12} placeholder="auto"
          value={perRow ?? ''} onChange={(e) => setF('perRow', e.target.value ? Number(e.target.value) : undefined)} />
      </Field>
      <Field label="Icon spacing" info={ROW_INFO.iconGap}>
        <Input className={numCls} type="number" min={0} max={24} placeholder="4"
          value={iconGap ?? ''} onChange={(e) => setF('iconGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
      </Field>
      <ToggleRow label="Show only in combat" on={!!el.combatOnly}
        onToggle={() => setF('combatOnly', el.combatOnly ? undefined : true)} info={ROW_INFO.combatOnly} />
      <ToggleRow label="Enabled" on={el.enabled !== false} onToggle={() => toggleElement(index)} info={ELEMENT_ENABLED_INFO} />

      <Button variant="outline" size="sm" className="mt-3 w-full text-destructive hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => removeElement(index)}>Remove</Button>
    </Group>
  );
}

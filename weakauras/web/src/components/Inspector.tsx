import { useStore } from '../store';
import { Group, Note, ToggleRow, InfoTip } from './inspector-bits';
import { LAYOUT_INFO } from './inspector-help';
import { IconPanel } from './IconPanel';
import { RowPanel } from './RowPanel';
import { ElementPanel } from './ElementPanel';
import { ColumnPanel } from './ColumnPanel';
import { Slider } from './ui/slider';

const SLIDERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'barWidth', label: 'Global width', min: 150, max: 320 },
  { key: 'iconSize', label: 'Icon size', min: 18, max: 44 },
  { key: 'gap', label: 'Gap', min: 0, max: 10 },
];

export function Inspector({ slug }: { slug: string }) {
  const spec = useStore((st) => st.spec);
  const sel = useStore((st) => st.sel);
  const setGlobal = useStore((st) => st.setGlobal);
  const setCombatOnly = useStore((st) => st.setCombatOnly);

  const selContainer = sel == null ? undefined
    : (sel.ref === 'left' ? spec.left : sel.ref === 'right' ? spec.right : spec.stack[sel.ref]);
  const selIcon = sel && sel.iconIndex !== null ? selContainer?.icons?.[sel.iconIndex] : undefined;
  // a selected CONTAINER (iconIndex null): stack iconRows get the per-row panel, left/right rails the
  // per-column panel, every other stack element the per-element panel
  const selStackEl = sel != null && sel.iconIndex === null && typeof sel.ref === 'number' ? selContainer : undefined;
  const selRow = selStackEl?.kind === 'iconRow';
  // an empty rail has no El yet — the panel edits a stub; the store creates the rail on first write
  const selRail = sel != null && sel.iconIndex === null && (sel.ref === 'left' || sel.ref === 'right')
    ? selContainer ?? { kind: sel.ref, icons: [] } : undefined;

  return (
    <aside className="min-h-0 overflow-auto border-l bg-[image:var(--grad-pane)]">
      <div className="sticky top-0 z-[2] flex items-center justify-between border-b bg-[image:var(--grad-bar)] px-4 py-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Inspector</h2>
        <span className="text-[13px] text-muted-foreground">{selRow ? 'Row' : selStackEl ? 'Element' : selRail ? 'Column' : sel && selIcon ? 'Icon' : 'Global'}</span>
      </div>
      <div className="p-4">
        {sel && selIcon && sel.iconIndex !== null && <IconPanel sel={{ ref: sel.ref, iconIndex: sel.iconIndex }} icon={selIcon} />}
        {selRow && <RowPanel el={selStackEl!} index={sel!.ref as number} />}
        {selStackEl && !selRow && <ElementPanel el={selStackEl} index={sel!.ref as number} slug={slug} />}
        {selRail && <ColumnPanel el={selRail} side={sel!.ref as 'left' | 'right'} />}

        {/* the global Layout group shows ONLY when nothing is selected — its settings apply to the WHOLE
            WeakAura, and showing them under a selected icon/row/bar reads as if they were per-selection */}
        {sel == null && <Group title="Layout">
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
          <Note>Click any element in the preview to edit it here (hover it for the remove button). Add bars and rows with the + under the stack; drag an element's grip to reorder. Side columns stay put.</Note>
        </Group>}
      </div>
    </aside>
  );
}

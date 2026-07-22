import { useStore, type El } from '../store';
import { Group, ToggleRow, OverrideSlider } from './inspector-bits';
import { COLUMN_INFO, ELEMENT_ENABLED_INFO } from './inspector-help';

// Per-column inspector (a selected left/right side rail). Icon size / spacing / offsets apply to THIS
// column only. Opened by clicking the rail in the preview. No Remove: a column disappears from the export
// by itself once its icons are removed (deleting the whole rail with its icons in one click is a footgun).
export function ColumnPanel({ el, side }: { el: El; side: 'left' | 'right' }) {
  const setElementField = useStore((st) => st.setElementField);
  const toggleElement = useStore((st) => st.toggleElement);
  const g = useStore((st) => st.spec.global);

  return (
    <Group title={side === 'left' ? 'Left column' : 'Right column'} info={COLUMN_INFO.group}>
      <OverrideSlider label="Icon size" info={COLUMN_INFO.size} min={14} max={48}
        value={el.size as number | undefined} fallback={Number(g.iconSize)} fallbackTag="global"
        onChange={(v) => setElementField(side, 'size', v)} />
      <OverrideSlider label="Icon spacing" info={COLUMN_INFO.iconGap} min={0} max={24}
        value={el.iconGap as number | undefined} fallback={4} fallbackTag="default"
        onChange={(v) => setElementField(side, 'iconGap', v)} />
      <OverrideSlider label="X offset" info={COLUMN_INFO.xOffset}
        min={side === 'left' ? -320 : 60} max={side === 'left' ? -60 : 320}
        value={el.xOffset as number | undefined} fallback={side === 'left' ? -170 : 170} fallbackTag="default"
        onChange={(v) => setElementField(side, 'xOffset', v)} />
      <OverrideSlider label="Y offset" info={COLUMN_INFO.yOffset} min={-200} max={200}
        value={el.yOffset as number | undefined} fallback={Number(g.yOffset ?? 0)} fallbackTag="default"
        onChange={(v) => setElementField(side, 'yOffset', v)} />
      <ToggleRow label="Enabled" on={el.enabled !== false} onToggle={() => toggleElement(side)} info={ELEMENT_ENABLED_INFO} />
    </Group>
  );
}

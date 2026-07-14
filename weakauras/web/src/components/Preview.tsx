import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import s from '../editor.module.css';
import { useStore, type El, type IconCfg } from '../store';
import type { IconResolver } from '../registry';

const rgba = (c?: number[]) => (c ? `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] ?? 1})` : '#666');
const grad = (hi?: number[], lo?: number[]) => `linear-gradient(180deg, ${rgba(hi)}, ${rgba(lo ?? hi)})`;

// Preview-only visual scale: everything renders at (real WA size x Z) px. Applied as native geometry (real
// widths/heights) rather than a CSS zoom/transform, because dnd-kit's drag math breaks under a scaled
// ancestor. The SPEC (and thus the exported WA) keeps the true sizes.
const Z = 1.7;
const px = (n: number) => Math.round(n * Z);
const GAP = px(3);

// An existing preview icon: draggable + sortable (reorder within a row / move between rows) + removable.
function IconCell({ id, url, size, stackIndex, iconIndex }: { id: string; url: string; size: number; stackIndex: number; iconIndex: number }) {
  const removeIcon = useStore((st) => st.removeIcon);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, data: { type: 'icon', stackIndex, iconIndex },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={s.wicon}
      style={{
        width: px(size), height: px(size), backgroundImage: `url(${url})`, cursor: 'grab',
        transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
      }}>
      {/* stopPropagation so clicking the remove button never starts a drag */}
      <button className={s.rm} title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeIcon(stackIndex, iconIndex)}>&times;</button>
    </div>
  );
}

// A cdRow: drop target for palette abilities and a sortable list of its icons.
function IconRow({ el, index, size, W, resolve }: { el: El; index: number; size: number; W: number; resolve: IconResolver }) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${index}`, data: { type: 'row', stackIndex: index } });
  const icons = el.icons ?? [];
  const ids = icons.map((ic, i) => ic._uid ?? `${index}:${i}`);
  return (
    <div ref={setNodeRef} className={`${s.el} ${s.dropzone} ${isOver ? s.dropOver : ''}`}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className={s.iconrow} style={{ width: px(W), gap: GAP, minHeight: px(size) }}>
          {icons.length === 0 && <span className={s.empty}>drop abilities here</span>}
          {icons.map((ic: IconCfg, i) => (
            <IconCell key={ids[i]} id={ids[i]} url={resolve(ic)} size={size} stackIndex={index} iconIndex={i} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function ProcRow({ el, size, W, resolve }: { el: El; size: number; W: number; resolve: IconResolver }) {
  return (
    <div className={s.el}>
      <div className={s.iconrow} style={{ width: px(W), gap: GAP }}>
        {(el.icons ?? []).map((ic: IconCfg, i) => (
          <div key={i} className={s.wicon} style={{ width: px(size), height: px(size), backgroundImage: `url(${resolve(ic)})` }} />
        ))}
      </div>
    </div>
  );
}

function Bar({ W, fillW, bg, text }: { W: number; fillW: string; bg: string; text: string }) {
  return (
    <div className={s.el}>
      <div className={s.wbar} style={{ width: px(W), height: px(13) }}>
        <div className={s.fill} style={{ width: fillW, background: bg }} />
        <div className={s.txt} style={{ fontSize: px(10) }}>{text}</div>
      </div>
    </div>
  );
}

export function Preview({ resolve }: { resolve: IconResolver }) {
  const spec = useStore((st) => st.spec);
  const g = spec.global;
  const W = g.barWidth;

  return (
    <div className={s.preview} style={{ gap: GAP }}>
      {spec.stack.map((el, i) => {
        if (el.enabled === false) return null;
        switch (el.kind) {
          case 'procRow':
            return <ProcRow key={i} el={el} size={g.procSize} W={W} resolve={resolve} />;
          case 'cdRow':
            return <IconRow key={i} el={el} index={i} size={el.secondary ? g.secIconSize : g.iconSize} W={W} resolve={resolve} />;
          case 'uptimeBar':
            return <Bar key={i} W={W} fillW="52%" bg={grad([0.30, 0.75, 0.15, 1], [0.05, 0.2, 0, 1])} text={String(el.label ?? 'Buff').replace('%p', '6.4')} />;
          case 'powerBar':
            return <Bar key={i} W={W} fillW="78%" bg={grad(el.hi as number[], el.lo as number[])} text="78" />;
          case 'stacks': {
            const count = (el.count as number) ?? 5;
            const on = Math.round(count * 0.6);
            return (
              <div key={i} className={s.el}>
                <div className={s.stacks} style={{ width: px(W), gap: GAP }}>
                  {Array.from({ length: count }).map((_, k) => (
                    <div key={k} className={s.stbox} style={{ height: px(11), background: k < on ? grad(el.hi as number[], el.lo as number[]) : 'rgba(0,0,0,.55)' }} />
                  ))}
                </div>
              </div>
            );
          }
          case 'healthBar':
            return <Bar key={i} W={W} fillW="64%" bg={grad(el.hi as number[], el.lo as number[])} text="64%" />;
          default:
            return null;
        }
      })}
    </div>
  );
}

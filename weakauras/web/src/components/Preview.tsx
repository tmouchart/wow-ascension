import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import s from '../editor.module.css';
import { useStore, type El, type IconCfg, type Ref } from '../store';
import type { IconResolver } from '../registry';

const rgba = (c?: number[]) => (c ? `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] ?? 1})` : '#666');
const grad = (hi?: number[], lo?: number[]) => `linear-gradient(180deg, ${rgba(hi)}, ${rgba(lo ?? hi)})`;

// Preview-only visual scale: everything renders at (real WA size x Z) px. Applied as native geometry (real
// widths/heights) rather than a CSS zoom/transform, because dnd-kit's drag math breaks under a scaled
// ancestor. The SPEC (and thus the exported WA) keeps the true sizes.
const Z = 1.7;
const px = (n: number) => Math.round(n * Z);

// A central-stack element wrapper: vertically sortable (reorder bars / CD rows / proc rows in the stack)
// via its grip handle only — the element's own content keeps its icon drag & drop. Rails are NOT wrapped.
function StackItem({ id, index, children }: { id: string; index: number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, data: { type: 'el', index },
  });
  return (
    <div ref={setNodeRef} className={s.stackEl}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <span className={s.grip} {...attributes} {...listeners} title="Drag to reorder">⋮⋮</span>
      {children}
    </div>
  );
}

// An existing preview icon: draggable + sortable (reorder within a container / move between containers) +
// removable. `ref` is the container it lives in (a stack index, or 'left'/'right' for a side rail).
function IconCell({ id, url, size, containerRef, iconIndex }: { id: string; url: string; size: number; containerRef: Ref; iconIndex: number }) {
  const removeIcon = useStore((st) => st.removeIcon);
  const select = useStore((st) => st.select);
  const sel = useStore((st) => st.sel);
  const isSel = sel != null && sel.ref === containerRef && sel.iconIndex === iconIndex;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, data: { type: 'icon', ref: containerRef, iconIndex },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={s.wicon}
      onClick={() => select(isSel ? null : { ref: containerRef, iconIndex })}
      style={{
        width: px(size), height: px(size), backgroundImage: `url(${url})`, cursor: 'grab',
        transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
        boxShadow: isSel ? '0 0 0 2px var(--ring)' : undefined,
      }}>
      {/* stopPropagation so clicking the remove button never starts a drag */}
      <button className={s.rm} title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeIcon(containerRef, iconIndex); }}>&times;</button>
    </div>
  );
}

// A cdRow: drop target for palette abilities and a horizontal sortable list of its icons.
function IconRow({ el, index, size, W, gap, resolve, dragging }: { el: El; index: number; size: number; W: number; gap: number; resolve: IconResolver; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${index}`, data: { type: 'row', ref: index } });
  const icons = el.icons ?? [];
  const ids = icons.map((ic, i) => ic._uid ?? `${index}:${i}`);
  return (
    <div ref={setNodeRef} className={`${s.el} ${s.dropzone} ${dragging ? s.dropActive : ''} ${isOver ? s.dropOver : ''}`}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className={s.iconrow} style={{ width: px(W), gap, minHeight: px(size) }}>
          {icons.length === 0 && <span className={s.empty}>drop abilities here</span>}
          {icons.map((ic: IconCfg, i) => (
            <IconCell key={ids[i]} id={ids[i]} url={resolve(ic)} size={size} containerRef={index} iconIndex={i} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// A vertical side rail (left/right column). Always rendered as a drop target — even when empty — so it shows
// up during a drag; the store lazily creates the rail El on first drop.
function Rail({ side, el, size, gap, resolve, dragging }: { side: 'left' | 'right'; el?: El; size: number; gap: number; resolve: IconResolver; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${side}`, data: { type: 'row', ref: side } });
  const icons = el?.icons ?? [];
  const ids = icons.map((ic, i) => ic._uid ?? `${side}:${i}`);
  return (
    <div ref={setNodeRef} className={`${s.rail} ${s.dropzone} ${dragging ? s.dropActive : ''} ${isOver ? s.dropOver : ''}`}
      style={{ minWidth: px(size) + 12, gap }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {icons.length === 0 && <span className={s.railempty}>{side}</span>}
        {icons.map((ic: IconCfg, i) => (
          <IconCell key={ids[i]} id={ids[i]} url={resolve(ic)} size={size} containerRef={side} iconIndex={i} />
        ))}
      </SortableContext>
    </div>
  );
}

function ProcRow({ el, size, W, gap, resolve }: { el: El; size: number; W: number; gap: number; resolve: IconResolver }) {
  return (
    <div className={s.el}>
      <div className={s.iconrow} style={{ width: px(W), gap }}>
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

export function Preview({ resolve, dragging }: { resolve: IconResolver; dragging: boolean }) {
  const spec = useStore((st) => st.spec);
  const g = spec.global;
  const W = g.barWidth;
  const GAP = px(g.gap);

  // Visible stack elements, keeping their REAL stack index (the store addresses elements by it).
  const visible = spec.stack.map((el, i) => [el, i] as const).filter(([el]) => el.enabled !== false);

  function renderEl(el: El, i: number) {
    switch (el.kind) {
      case 'procRow':
      case 'buffRow':
        return <ProcRow el={el} size={(el.size as number) ?? (el.kind === 'buffRow' ? g.iconSize : g.procSize)} W={W} gap={GAP} resolve={resolve} />;
      case 'cdRow':
        return <IconRow el={el} index={i} size={(el.size as number) ?? (el.secondary ? g.secIconSize : g.iconSize)} W={W} gap={GAP} resolve={resolve} dragging={dragging} />;
      case 'uptimeBar':
        return <Bar W={W} fillW="52%" bg={grad([0.30, 0.75, 0.15, 1], [0.05, 0.2, 0, 1])} text={String(el.label ?? 'Buff').replace('%p', '6.4')} />;
      case 'powerBar':
        return <Bar W={(el.width as number) ?? W} fillW="78%" bg={grad(el.hi as number[], el.lo as number[])} text="78" />;
      case 'stackBar':
        return <Bar W={W} fillW="62%" bg={grad(el.hi as number[], el.lo as number[])} text="62" />;
      case 'buffWarnText':
        return (
          <div className={s.el} style={{ height: px((el.height as number) ?? 22), alignItems: 'center' }}>
            <span style={{ color: 'rgb(255,51,38)', fontWeight: 700, fontSize: px((el.fontSize as number) ?? 20) * 0.7, textShadow: '0 1px 2px #000', letterSpacing: '.03em' }}>
              {String(el.text ?? 'MISSING')}
            </span>
          </div>
        );
      case 'stacks':
      case 'chargeStacks': {
        const count = (el.count as number) ?? 5;
        const on = Math.round(count * 0.6);
        return (
          <div className={s.el}>
            <div className={s.stacks} style={{ width: px(W), gap: GAP }}>
              {Array.from({ length: count }).map((_, k) => (
                <div key={k} className={s.stbox} style={{ height: px(11), background: k < on ? grad(el.hi as number[], el.lo as number[]) : 'rgba(0,0,0,.55)' }} />
              ))}
            </div>
          </div>
        );
      }
      case 'healthBar':
        return <Bar W={W} fillW="64%" bg={grad(el.hi as number[], el.lo as number[])} text="64%" />;
      default:
        return null;
    }
  }

  return (
    <div className={s.preview}>
      <Rail side="left" el={spec.left} size={g.iconSize} gap={GAP} resolve={resolve} dragging={dragging} />
      <SortableContext items={visible.map(([el, i]) => el._uid ?? `el:${i}`)} strategy={verticalListSortingStrategy}>
        <div className={s.stackCol} style={{ gap: GAP }}>
          {visible.map(([el, i]) => (
            <StackItem key={el._uid ?? `el:${i}`} id={el._uid ?? `el:${i}`} index={i}>
              {renderEl(el, i)}
            </StackItem>
          ))}
        </div>
      </SortableContext>
      <Rail side="right" el={spec.right} size={g.iconSize} gap={GAP} resolve={resolve} dragging={dragging} />
    </div>
  );
}

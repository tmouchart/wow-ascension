import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import s from '../editor.module.css';
import { useStore, type El, type IconCfg, type Ref } from '../store';
import type { IconResolver } from '../registry';
import { BAR_PRESETS } from '../lib/defaultSpec';
import { REMOVABLE, presetElement } from '../lib/elements';
import { track } from '../lib/analytics';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';

const rgba = (c?: number[]) => (c ? `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] ?? 1})` : '#666');
const grad = (hi?: number[], lo?: number[]) => `linear-gradient(180deg, ${rgba(hi)}, ${rgba(lo ?? hi)})`;
// A configured glow → the preview glow: its colour (undefined when unset, so the CSS default white applies)
// + style (default buttonOverlay). Every icon is iconRow-shaped (the store normalizes on load), so the glow
// is exactly `ic.glow` — present (even empty `{}` = glow whenever shown) means it carries a glow.
const glowOf = (ic: IconCfg): { color?: string; type: string } | undefined => {
  const g = ic.glow as { color?: number[]; glowType?: string } | undefined;
  return g ? { color: g.color ? rgba(g.color) : undefined, type: g.glowType ?? 'buttonOverlay' } : undefined;
};

// Preview-only visual scale: everything renders at (real WA size x Z) px. Applied as native geometry (real
// widths/heights) rather than a CSS zoom/transform, because dnd-kit's drag math breaks under a scaled
// ancestor. The SPEC (and thus the exported WA) keeps the true sizes.
const Z = 1.7;
const px = (n: number) => Math.round(n * Z);

// Hover affordance on every clickable container (bars, icon rows, side rails): a faded version of the
// selection ring, so it reads as "you can select this". The inline selected boxShadow overrides it.
const hoverRing = 'transition-shadow hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_40%,transparent)]';

// A central-stack element wrapper: vertically sortable (reorder bars / CD rows / proc rows in the stack)
// via its grip handle only — the element's own content keeps its icon drag & drop. Rails are NOT wrapped.
function StackItem({ id, index, dimmed, children }: { id: string; index: number; dimmed?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, data: { type: 'el', index },
  });
  return (
    <div ref={setNodeRef} className={s.stackEl}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : dimmed ? 0.35 : 1 }}>
      <span className={s.grip} {...attributes} {...listeners} title="Drag to reorder">⋮⋮</span>
      {children}
    </div>
  );
}

// Wraps every non-iconRow stack element (bars / stack boxes / warn text): click selects it (per-element
// inspector, ring like icons/rows), hover reveals a remove ✕ for user-addable kinds. iconRows keep their own
// selection handling inside IconRow.
function SelectableEl({ el, index, children }: { el: El; index: number; children: ReactNode }) {
  const select = useStore((st) => st.select);
  const sel = useStore((st) => st.sel);
  const removeElement = useStore((st) => st.removeElement);
  const isSel = sel != null && sel.ref === index && sel.iconIndex === null;
  return (
    <div className={`group/el relative cursor-pointer rounded-[3px] ${hoverRing}`}
      onClick={(e) => { e.stopPropagation(); select(isSel ? null : { ref: index, iconIndex: null }); }}
      style={{ boxShadow: isSel ? '0 0 0 2px var(--ring)' : undefined }}>
      {children}
      {el.enabled === false && (
        <span className="pointer-events-none absolute -left-1 top-1/2 -translate-y-1/2 rounded bg-muted px-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">off</span>
      )}
      {REMOVABLE.has(el.kind) && (
        // stopPropagation so the remove click never selects the element (and never starts a drag)
        <button className="absolute -right-1.5 -top-1.5 z-[3] size-[15px] rounded-full border border-black bg-destructive text-center text-[11px] leading-[13px] text-destructive-foreground opacity-0 transition-opacity group-hover/el:opacity-100"
          title="Remove" onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); removeElement(index); }}>&times;</button>
      )}
    </div>
  );
}

// The "+" under the central stack: pick an element kind to append (then its panel opens, ready to edit).
function AddElementMenu() {
  const spec = useStore((st) => st.spec);
  const addElement = useStore((st) => st.addElement);
  const select = useStore((st) => st.select);
  const add = (k: keyof typeof BAR_PRESETS) => {
    addElement(presetElement(spec, k));
    select({ ref: spec.stack.length, iconIndex: null });   // stack.length pre-add = the new element's index
    track('element_added', { kind: k });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Add element"
          className="mt-2 size-7 rounded-full border-dashed text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}>
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" onClick={(e) => e.stopPropagation()}>
        {(Object.keys(BAR_PRESETS) as (keyof typeof BAR_PRESETS)[]).map((k) => (
          <DropdownMenuItem key={k} onSelect={() => add(k)}>{BAR_PRESETS[k].title}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// An existing preview icon: draggable + sortable (reorder within a container / move between containers) +
// removable. `ref` is the container it lives in (a stack index, or 'left'/'right' for a side rail).
function IconCell({ id, url, size, containerRef, iconIndex, glow }: { id: string; url: string; size: number; containerRef: Ref; iconIndex: number; glow?: { color?: string; type: string } }) {
  const removeIcon = useStore((st) => st.removeIcon);
  const select = useStore((st) => st.select);
  const sel = useStore((st) => st.sel);
  const isSel = sel != null && sel.ref === containerRef && sel.iconIndex === iconIndex;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, data: { type: 'icon', ref: containerRef, iconIndex },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={s.wicon} data-glow={glow?.type} data-sel={isSel ? '' : undefined}
      onClick={(e) => { e.stopPropagation(); select(isSel ? null : { ref: containerRef, iconIndex }); }}
      style={{
        width: px(size), height: px(size), backgroundImage: `url("${url}")`, cursor: 'grab',
        transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
        boxShadow: isSel ? '0 0 0 2px var(--ring)' : undefined,
        ['--gc' as string]: glow?.color,
      }}>
      {/* the glow this icon carries, shown while hovered (rotating bloom + pulsing halo) */}
      {glow && <i className={s.glow} aria-hidden />}
      {/* stopPropagation so clicking the remove button never starts a drag */}
      <button className={s.rm} title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeIcon(containerRef, iconIndex); }}>&times;</button>
    </div>
  );
}

// An iconRow: drop target for palette abilities and a horizontal sortable list of its icons. Clicking the row
// background (not an icon) selects the ROW (per-row inspector); a selection ring marks it. `perRow` constrains
// the wrap width so the preview reflects the override; `gap` reflects the row's icon spacing.
function IconRow({ el, index, size, W, gap, resolve, dragging }: { el: El; index: number; size: number; W: number; gap: number; resolve: IconResolver; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${index}`, data: { type: 'row', ref: index } });
  const select = useStore((st) => st.select);
  const sel = useStore((st) => st.sel);
  const rowSel = sel != null && sel.ref === index && sel.iconIndex === null;
  const icons = el.icons ?? [];
  const ids = icons.map((ic, i) => ic._uid ?? `${index}:${i}`);
  const perRow = el.perRow as number | undefined;
  const rowW = perRow ? perRow * px(size) + (perRow - 1) * gap : px(W);
  return (
    <div ref={setNodeRef}
      className={`${s.el} ${s.dropzone} ${dragging ? s.dropActive : ''} ${isOver ? s.dropOver : ''} ${hoverRing}`}
      onClick={(e) => { e.stopPropagation(); select(rowSel ? null : { ref: index, iconIndex: null }); }}
      style={{ cursor: 'pointer', boxShadow: rowSel ? '0 0 0 2px var(--ring)' : undefined }}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className={s.iconrow} style={{ width: rowW, gap, minHeight: px(size) }}>
          {icons.length === 0 && <span className={s.empty}>drop abilities here</span>}
          {icons.map((ic: IconCfg, i) => (
            <IconCell key={ids[i]} id={ids[i]} url={resolve(ic)} size={size} containerRef={index} iconIndex={i} glow={glowOf(ic)} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// A vertical side rail (left/right column). Always rendered as a drop target — even when empty — so it shows
// up during a drag; the store lazily creates the rail El on first drop. Clicking its background selects
// the COLUMN (per-column inspector). No remove ✕: it would delete every icon in the rail at once.
function Rail({ side, el, size, resolve, dragging }: { side: 'left' | 'right'; el?: El; size: number; resolve: IconResolver; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${side}`, data: { type: 'row', ref: side } });
  const select = useStore((st) => st.select);
  const sel = useStore((st) => st.sel);
  const gy = useStore((st) => Number(st.spec.global.yOffset ?? 0));
  const isSel = sel != null && sel.ref === side && sel.iconIndex === null;
  const icons = el?.icons ?? [];
  const ids = icons.map((ic, i) => ic._uid ?? `${side}:${i}`);
  // offsets render as a shift from the rail's default flex position (WA y is up-positive, CSS is down);
  // translate (not layout) so the flex row keeps its footprint. Icon gap = the column's real vSpace (4).
  const defX = side === 'left' ? -170 : 170;
  const dx = (((el?.xOffset as number) ?? defX) - defX) * Z;
  const dy = -((((el?.yOffset as number) ?? gy) - gy) * Z);
  return (
    <div ref={setNodeRef} className={`${s.rail} ${s.dropzone} ${dragging ? s.dropActive : ''} ${isOver ? s.dropOver : ''} group/el relative ${hoverRing}`}
      // selectable even while empty — the panel edits a stub and the store creates the rail on first write
      onClick={(e) => { e.stopPropagation(); select(isSel ? null : { ref: side, iconIndex: null }); }}
      style={{ minWidth: px(size) + 12, gap: px((el?.iconGap as number) ?? 4), cursor: 'pointer',
        transform: dx || dy ? `translate(${dx}px, ${dy}px)` : undefined,
        boxShadow: isSel ? '0 0 0 2px var(--ring)' : undefined, opacity: el?.enabled === false ? 0.35 : 1 }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {icons.length === 0 && <span className={s.railempty}>{side}</span>}
        {icons.map((ic: IconCfg, i) => (
          <IconCell key={ids[i]} id={ids[i]} url={resolve(ic)} size={size} containerRef={side} iconIndex={i} glow={glowOf(ic)} />
        ))}
      </SortableContext>
    </div>
  );
}

function Bar({ W, H = 14, fillW, bg, text }: { W: number; H?: number; fillW: string; bg: string; text: string }) {
  return (
    <div className={s.el}>
      <div className={s.wbar} style={{ width: px(W), height: px(H) }}>
        <div className={s.fill} style={{ width: fillW, background: bg }} />
        <div className={s.txt} style={{ fontSize: px(10) }}>{text}</div>
      </div>
    </div>
  );
}

export function Preview({ resolve, dragging }: { resolve: IconResolver; dragging: boolean }) {
  const spec = useStore((st) => st.spec);
  const select = useStore((st) => st.select);
  const g = spec.global;
  const W = g.barWidth;
  const GAP = px(g.gap);

  // Every stack element, keeping its REAL stack index (the store addresses elements by it). Disabled
  // elements render dimmed (not hidden) so they stay clickable — re-enabling lives in their panel.
  const items = spec.stack.map((el, i) => [el, i] as const);

  function renderEl(el: El, i: number) {
    switch (el.kind) {
      case 'iconRow':
        // a full IconRow: icons are selectable (per-icon inspector), sortable, and a palette drop target
        return <IconRow el={el} index={i} size={(el.size as number) ?? (el.secondary ? g.secIconSize : g.iconSize)}
          W={W} gap={el.iconGap != null ? px(el.iconGap as number) : GAP} resolve={resolve} dragging={dragging} />;
      case 'uptimeBar':
        return <Bar W={(el.width as number) ?? W} H={(el.height as number) ?? 14} fillW="52%" bg={grad([0.30, 0.75, 0.15, 1], [0.05, 0.2, 0, 1])} text={String(el.label ?? 'Buff').replace('%p', '6.4')} />;
      case 'powerBar':
        return <Bar W={(el.width as number) ?? W} H={(el.height as number) ?? 14} fillW="78%" bg={grad(el.hi as number[], el.lo as number[])} text="78" />;
      case 'stackBar':
        return <Bar W={(el.width as number) ?? W} H={(el.height as number) ?? 14} fillW="62%" bg={grad(el.hi as number[], el.lo as number[])} text="62" />;
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
                <div key={k} className={s.stbox} style={{ height: px((el.height as number) ?? 12), background: k < on ? grad(el.hi as number[], el.lo as number[]) : 'rgba(0,0,0,.55)' }} />
              ))}
            </div>
          </div>
        );
      }
      case 'healthBar':
        return <Bar W={W} H={(el.height as number) ?? 14} fillW="64%" bg={grad(el.hi as number[], el.lo as number[])} text="64%" />;
      default:
        return null;
    }
  }

  return (
    // clicking the canvas background (not a row or icon — those stopPropagation) clears the selection
    <div className={s.preview} onClick={() => select(null)}>
      <Rail side="left" el={spec.left} size={(spec.left?.size as number) ?? g.iconSize} resolve={resolve} dragging={dragging} />
      <SortableContext items={items.map(([el, i]) => el._uid ?? `el:${i}`)} strategy={verticalListSortingStrategy}>
        <div className={s.stackCol} style={{ gap: GAP }}>
          {items.map(([el, i]) => (
            <StackItem key={el._uid ?? `el:${i}`} id={el._uid ?? `el:${i}`} index={i} dimmed={el.enabled === false}>
              {el.kind === 'iconRow'
                ? renderEl(el, i)
                : <SelectableEl el={el} index={i}>{renderEl(el, i)}</SelectableEl>}
            </StackItem>
          ))}
          <AddElementMenu />
        </div>
      </SortableContext>
      <Rail side="right" el={spec.right} size={(spec.right?.size as number) ?? g.iconSize} resolve={resolve} dragging={dragging} />
    </div>
  );
}

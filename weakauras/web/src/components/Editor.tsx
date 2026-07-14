import { useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, pointerWithin, closestCenter, type CollisionDetection, type DragStartEvent, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';

// Center the (44px) drag overlay on the cursor, wherever in the (wide) palette row the drag started. Stock
// snapCenterToCursor centers using the SOURCE node's width — the palette row is ~280px wide, so grabbing on
// the text throws the icon off to the left. We anchor on the source's top-left (draggingNodeRect) but
// subtract HALF THE OVERLAY's size (overlayNodeRect), which puts the overlay center exactly under the pointer.
const centerOverlayOnCursor: Modifier = ({ activatorEvent, draggingNodeRect, overlayNodeRect, transform }) => {
  const overlay = overlayNodeRect ?? draggingNodeRect;
  if (!draggingNodeRect || !overlay || !activatorEvent) return transform;
  const p = getEventCoordinates(activatorEvent);
  if (!p) return transform;
  return {
    ...transform,
    x: transform.x + p.x - draggingNodeRect.left - overlay.width / 2,
    y: transform.y + p.y - draggingNodeRect.top - overlay.height / 2,
  };
};
import { Palette } from './Palette';
import { Preview } from './Preview';
import { Inspector } from './Inspector';
import { useRegistry, type Ability } from '../registry';
import { useStore, elementLabel, type Ref } from '../store';
import { buildDefaultSpec } from '../lib/defaultSpec';
import { PRESETS } from '../specs';

// Two independent drag worlds share one DndContext: icons/abilities target rows & rails ('row'/'icon'
// droppables), stack elements target each other ('el' sortables). Filtering the containers by the active
// drag's world keeps an icon drop from landing on an element wrapper and vice versa. Element drags use
// closestCenter (always resolves a vertical neighbor); icon drags keep pointerWithin.
const collisionByType: CollisionDetection = (args) => {
  const isEl = args.active.data.current?.type === 'el';
  const droppableContainers = args.droppableContainers.filter(
    (c) => (c.data.current?.type === 'el') === isEl,
  );
  return (isEl ? closestCenter : pointerWithin)({ ...args, droppableContainers });
};

export function Editor({ slug }: { slug: string }) {
  const { abilities, className, resolveIcon, loading } = useRegistry(slug);
  const spec = useStore((st) => st.spec);
  const setClass = useStore((st) => st.setClass);
  const addIcon = useStore((st) => st.addIcon);

  // On class switch, load that class's SPEC: a curated preset (classes/<name>/spec.json) when one exists;
  // every other class gets an auto-default from its registry (cooldowns + power + health). Runs once per
  // slug (once the registry has loaded), so it never clobbers the user's edits.
  const inited = useRef('');
  useEffect(() => {
    if (loading || inited.current === slug) return;
    inited.current = slug;
    setClass(PRESETS[slug] ?? buildDefaultSpec(slug, className, abilities));
  }, [slug, loading, abilities, className, setClass]);
  const insertIcon = useStore((st) => st.insertIcon);
  const moveIcon = useStore((st) => st.moveIcon);
  const moveElement = useStore((st) => st.moveElement);
  // What flies under the cursor: an icon image, or a label chip for a stack-element drag.
  const [overlay, setOverlay] = useState<{ icon?: string; label?: string } | null>(null);
  // True while an icon/ability drag is in flight — drives the "reveal every drop container" borders in the
  // preview. Element drags don't set it (icon dropzones are not valid targets for them).
  const [dragging, setDragging] = useState(false);
  // MouseSensor (+ TouchSensor) rather than PointerSensor: covers desktop mouse + touch, and lets real
  // browser mouse input drive drags. distance:4 so a click (remove button, palette scroll) isn't a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  // Read an existing icon's config by its container ref (stack index, or 'left'/'right' rail).
  const iconAt = (ref: Ref, i: number) =>
    (ref === 'left' ? spec.left : ref === 'right' ? spec.right : spec.stack[ref])?.icons?.[i];

  function onDragStart(e: DragStartEvent) {
    const a = e.active.data.current;
    setDragging(a?.type !== 'el');
    if (a?.type === 'ability') setOverlay({ icon: (a.ability as Ability).iconUrl });
    else if (a?.type === 'icon') {
      const ic = iconAt(a.ref as Ref, a.iconIndex as number);
      setOverlay(ic ? { icon: resolveIcon(ic) } : null);
    } else if (a?.type === 'el') {
      const el = spec.stack[a.index as number];
      setOverlay(el ? { label: elementLabel(el) } : null);
    }
  }

  // All icon moves (reorder within a container AND transfer between containers) resolve at drop, not live.
  // Doing cross-container moves in onDragOver ping-pongs when containers have very different geometry (a
  // narrow rail vs a wide row): the live move shifts layout so the cursor leaves the target, dnd-kit
  // re-measures, and the two containers thrash setState until React throws "Maximum update depth exceeded".
  function onDragEnd(e: DragEndEvent) {
    setDragging(false);
    setOverlay(null);
    const a = e.active.data.current;
    const o = e.over?.data.current;
    if (!o) return;
    // Vertical stack reorder: an element dropped onto another element's slot (collisionByType guarantees
    // an el drag only ever resolves over another el).
    if (a?.type === 'el') {
      if (o.type === 'el') moveElement(a.index as number, o.index as number);
      return;
    }
    const to = o.ref as Ref;
    const toIndex = o.type === 'icon' ? (o.iconIndex as number) : undefined;   // undefined => append
    if (a?.type === 'ability') {
      const icon = { label: (a.ability as Ability).name, spell: (a.ability as Ability).spellId };
      if (toIndex == null) addIcon(to, icon);
      else insertIcon(to, toIndex, icon);
    } else if (a?.type === 'icon') {
      moveIcon(a.ref as Ref, a.iconIndex as number, to, toIndex);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collisionByType} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(false); setOverlay(null); }}>
      <div className="grid h-full min-h-0 grid-cols-[312px_1fr_336px]">
        <Palette abilities={abilities} loading={loading} />
        <main className="flex min-h-0 flex-col overflow-auto">
          <div className="flex items-center gap-2.5 border-b bg-[image:var(--grad-bar)] px-4 py-3 text-[13px] text-muted-foreground">
            <span>Central stack</span>
            <span className="ml-auto font-mono">250 × auto</span>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
            <Preview resolve={resolveIcon} dragging={dragging} />
          </div>
        </main>
        <Inspector slug={slug} />
      </div>
      <DragOverlay modifiers={[centerOverlayOnCursor]} dropAnimation={null}>
        {overlay ? (
          <div className="pointer-events-none">
            {overlay.icon
              ? <img src={overlay.icon} alt="" draggable={false} className="block size-11 rounded-md border border-black shadow-lg [-webkit-user-drag:none]" />
              : <span className="inline-block whitespace-nowrap rounded-md border bg-card px-3 py-1.5 text-sm text-foreground shadow-lg">{overlay.label}</span>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

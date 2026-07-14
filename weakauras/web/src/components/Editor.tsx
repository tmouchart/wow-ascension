import { useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter, type DragStartEvent, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import s from '../editor.module.css';
import { Palette } from './Palette';
import { Preview } from './Preview';
import { Inspector } from './Inspector';
import { useRegistry, type Ability } from '../registry';
import { useStore } from '../store';
import { buildDefaultSpec } from '../lib/defaultSpec';
import { felswornSpec } from '../specs/felsworn';

export function Editor({ slug }: { slug: string }) {
  const { abilities, className, resolveIcon, loading } = useRegistry(slug);
  const spec = useStore((st) => st.spec);
  const setClass = useStore((st) => st.setClass);
  const addIcon = useStore((st) => st.addIcon);

  // On class switch, load that class's SPEC: felsworn uses its curated hand-built reference; every other
  // class gets an auto-default from its registry (cooldowns + power + health). Runs once per slug (once the
  // registry has loaded), so it never clobbers the user's edits.
  const inited = useRef('');
  useEffect(() => {
    if (loading || inited.current === slug) return;
    inited.current = slug;
    setClass(slug === 'felsworn' ? (felswornSpec as never) : buildDefaultSpec(slug, className, abilities));
  }, [slug, loading, abilities, className, setClass]);
  const insertIcon = useStore((st) => st.insertIcon);
  const moveIcon = useStore((st) => st.moveIcon);
  const [overlay, setOverlay] = useState<string | null>(null);
  // MouseSensor (+ TouchSensor) rather than PointerSensor: covers desktop mouse + touch, and lets real
  // browser mouse input drive drags. distance:4 so a click (remove button, palette scroll) isn't a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  function onDragStart(e: DragStartEvent) {
    const a = e.active.data.current;
    if (a?.type === 'ability') setOverlay((a.ability as Ability).iconUrl);
    else if (a?.type === 'icon') {
      const ic = spec.stack[a.stackIndex as number]?.icons?.[a.iconIndex as number];
      setOverlay(ic ? resolveIcon(ic) : null);
    }
  }

  // Cross-row transfer of an existing icon happens live here (the dnd-kit "multiple containers" pattern):
  // when the drag crosses into a different cdRow, move it now so it joins that row's SortableContext. Stable
  // _uid ids let dnd-kit keep tracking the item across contexts. Same-row reorder is left to onDragEnd.
  function onDragOver(e: DragOverEvent) {
    const a = e.active.data.current;
    const o = e.over?.data.current;
    if (a?.type !== 'icon' || !o) return;
    const from = a.stackIndex as number;
    const to = o.stackIndex as number;
    if (from === to) return;
    const toIndex = o.type === 'icon' ? (o.iconIndex as number) : undefined;
    moveIcon(from, a.iconIndex as number, to, toIndex);
  }

  function onDragEnd(e: DragEndEvent) {
    setOverlay(null);
    const a = e.active.data.current;
    const o = e.over?.data.current;
    if (!o) return;
    const toStack = o.stackIndex as number;
    const toIndex = o.type === 'icon' ? (o.iconIndex as number) : undefined;   // undefined => append
    if (a?.type === 'ability') {
      const icon = { label: (a.ability as Ability).name, spell: (a.ability as Ability).spellId };
      if (toIndex == null) addIcon(toStack, icon);
      else insertIcon(toStack, toIndex, icon);
    } else if (a?.type === 'icon' && a.stackIndex === toStack) {
      // same-row reorder (cross-row already handled live in onDragOver)
      moveIcon(a.stackIndex as number, a.iconIndex as number, toStack, toIndex);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      <div className={s.body}>
        <Palette abilities={abilities} loading={loading} />
        <main className={`${s.pane} ${s.center}`}>
          <div className={s.canvasTools}>
            <span>Central stack</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{'250 × auto'}</span>
          </div>
          <div className={s.canvasScroll}><Preview resolve={resolveIcon} /></div>
        </main>
        <Inspector slug={slug} />
      </div>
      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
        {overlay ? <div className={s.dragfly}><img src={overlay} alt="" /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}

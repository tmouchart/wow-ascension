import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import s from '../editor.module.css';
import type { Ability } from '../registry';

// Wowhead-style hover card for a palette ability. Dark + gold regardless of app theme (like the in-game
// tooltip). We only surface what the CoA scrape actually gives us: name, type/source, required level,
// essence cost (the talent-builder cost — NOT a mana/energy cast cost, which we don't scrape) + description.
function TypeLine({ a }: { a: Ability }) {
  const bits: string[] = [];
  if (a.entryType) bits.push(a.entryType);
  if (a.source && a.source !== 'baseline') bits.push(a.source[0].toUpperCase() + a.source.slice(1));
  return <div className={s.ttType}>{bits.join(' · ')}</div>;
}

export function AbilityTooltip({ ability, x, y }: { ability: Ability; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 16, top: y + 16 });

  // Clamp inside the viewport, and flip above/left of the cursor when it would overflow.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = x + 16;
    let top = y + 16;
    if (left + width > window.innerWidth - 8) left = x - width - 16;
    if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    setPos({ left, top });
  }, [x, y, ability.spellId]);

  return createPortal(
    <div ref={ref} className={s.tooltip} style={{ left: pos.left, top: pos.top }}>
      <div className={s.ttHead}>
        <img src={ability.iconUrl} alt="" />
        <div className={s.ttName}>{ability.name}</div>
      </div>
      <TypeLine a={ability} />
      <div className={s.ttMeta}>
        {ability.level ? <span>Requires Level {ability.level}</span> : null}
        {ability.essence ? <span>{ability.essence} Essence</span> : null}
      </div>
      {ability.desc ? <div className={s.ttDesc}>{ability.desc}</div> : <div className={s.ttNodesc}>No description.</div>}
      <div className={s.ttId}>Spell ID {ability.spellId}</div>
    </div>,
    document.body,
  );
}

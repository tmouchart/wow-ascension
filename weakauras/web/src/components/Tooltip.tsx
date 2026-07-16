import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import s from '../editor.module.css';
import type { Ability } from '../registry';

// Wowhead-style hover card for a palette ability. Dark + gold regardless of app theme (like the in-game
// tooltip). Surfaces: name, type/source, classification (category + tags), the scraped cast stats
// (cast time / cooldown / cost / range / school, from db.ascension.gg), required level + essence, and desc.
function TypeLine({ a }: { a: Ability }) {
  const bits: string[] = [];
  if (a.entryType) bits.push(a.entryType);
  if (a.source && a.source !== 'baseline') bits.push(a.source[0].toUpperCase() + a.source.slice(1));
  return <div className={s.ttType}>{bits.join(' · ')}</div>;
}

// Pull a clean scraped stat (skip the "n/a" / "None" placeholders the DB emits).
const STAT_KEYS = ['Cast time', 'Cooldown', 'Cost', 'Range', 'School'];
function stat(a: Ability, k: string): string | null {
  const v = a.details?.[k];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return !t || /^(n\/a|none)$/i.test(t) ? null : t;
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
      {ability.primary ? (
        <div className={s.ttType}>
          {ability.primary}{ability.tags?.length ? ' · ' + ability.tags.join(', ') : ''}
        </div>
      ) : null}
      {(() => {
        const stats = STAT_KEYS.map((k) => [k, stat(ability, k)] as const).filter(([, v]) => v);
        return stats.length ? (
          <div className={s.ttMeta}>
            {stats.map(([k, v]) => (
              <span key={k}>{k === 'Cast time' || k === 'School' ? v : `${k}: ${v}`}</span>
            ))}
          </div>
        ) : null;
      })()}
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

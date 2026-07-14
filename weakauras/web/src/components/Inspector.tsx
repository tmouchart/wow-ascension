import s from '../editor.module.css';
import { useStore } from '../store';
import { powerIndexConfirmed } from '../lib/defaultSpec';

const SLIDERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'barWidth', label: 'Bar width', min: 150, max: 320 },
  { key: 'iconSize', label: 'Icon size', min: 18, max: 44 },
  { key: 'secIconSize', label: 'Secondary icon', min: 16, max: 40 },
  { key: 'gap', label: 'Gap', min: 0, max: 10 },
];

const TOGGLEABLE: Record<string, string> = {
  uptimeBar: 'Uptime bar', powerBar: 'Resource bar', stacks: 'Stack boxes', healthBar: 'Health bar',
};

export function Inspector({ slug }: { slug: string }) {
  const spec = useStore((st) => st.spec);
  const setGlobal = useStore((st) => st.setGlobal);
  const toggleElement = useStore((st) => st.toggleElement);
  const setElementField = useStore((st) => st.setElementField);

  const powerIdx = spec.stack.findIndex((el) => el.kind === 'powerBar');
  const confirmed = powerIndexConfirmed(slug);

  return (
    <aside className={`${s.pane} ${s.right}`}>
      <div className={s.paneHead}><h2>Inspector</h2><span className={s.hint}>Global</span></div>
      <div className={s.insp}>
        <div className={s.group}>
          <h3>Layout</h3>
          {SLIDERS.map(({ key, label, min, max }) => (
            <div className={s.field} key={key}>
              <label>{label}</label>
              <span className={s.val}>{spec.global[key]}</span>
              <input type="range" min={min} max={max} value={spec.global[key]}
                onChange={(e) => setGlobal(key, Number(e.target.value))} />
            </div>
          ))}
        </div>

        {powerIdx >= 0 && (
          <div className={s.group}>
            <h3>Resource</h3>
            <div className={s.field}>
              <label>Power index</label>
              <input className={s.num} type="number" min={0} max={20}
                value={Number(spec.stack[powerIdx].powerType ?? 0)}
                onChange={(e) => setElementField(powerIdx, 'powerType', Number(e.target.value))} />
            </div>
            {!confirmed && <p className={s.note}>Unconfirmed for this class — verify in-game (UnitPower) and set the right index. Names don't map to standard indices on this realm.</p>}
          </div>
        )}

        <div className={s.group}>
          <h3>Elements</h3>
          {spec.stack.map((el, i) => (TOGGLEABLE[el.kind] ? (
            <div className={s.toggle} key={i}>
              <span>{TOGGLEABLE[el.kind]}</span>
              <button className={s.tk} aria-pressed={el.enabled !== false} onClick={() => toggleElement(i)} />
            </div>
          ) : null))}
        </div>
      </div>
    </aside>
  );
}

import s from '../editor.module.css';
import { useStore, elementLabel, type El, type Spec, type Ref, type IconCfg } from '../store';
import { powerIndexConfirmed, BAR_PRESETS } from '../lib/defaultSpec';

const SLIDERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'barWidth', label: 'Bar width', min: 150, max: 320 },
  { key: 'iconSize', label: 'Icon size', min: 18, max: 44 },
  { key: 'secIconSize', label: 'Secondary icon', min: 16, max: 40 },
  { key: 'gap', label: 'Gap', min: 0, max: 10 },
];

// The kinds the user can freely add (and therefore remove); the rest ships with the class SPEC.
const REMOVABLE = new Set(['powerBar', 'healthBar', 'uptimeBar', 'stacks']);

// The generator derives a region id from el.id (or a per-kind default like "<spec> Power") — two bars with
// the same effective id would collide (same region id -> same uid). Mirror those defaults when uniquifying.
const effectiveId = (spec: Spec, el: El): string | undefined =>
  (el.id as string | undefined) ??
  (el.kind === 'powerBar' ? `${spec.id} Power`
    : el.kind === 'healthBar' ? `${spec.id} Health`
    : el.kind === 'stacks' ? `${spec.id} Stack`
    : el.kind === 'uptimeBar' ? `${spec.id} ${typeof el.buff === 'string' ? el.buff : 'Uptime'}`
    : undefined);

// ---- per-icon glow editing (cdRow / side-rail icons -> the spec-builder `glow` object) ----
type Glow = { type?: string; buff?: string; power?: number; pct?: number; color?: number[]; glowType?: string };
const GLOW_RULES: [string, string][] = [
  ['', 'None'],
  ['buff', 'While buff active'],
  ['buffMissing', 'When buff missing'],
  ['ready', 'When ready'],
  ['readyPower', 'Ready + power >='],
  ['powerPct', 'Power % >='],
  ['targetHealthBelow', 'Target HP % <'],
];
const GLOW_STYLES = ['buttonOverlay', 'Pixel', 'ACShine'];

const toHex = (c?: number[]) =>
  '#' + (c ?? [1, 1, 1]).slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): number[] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);

function IconPanel({ sel, icon }: { sel: { ref: Ref; iconIndex: number }; icon: IconCfg }) {
  const setIconField = useStore((st) => st.setIconField);
  const select = useStore((st) => st.select);
  const setF = (key: string, value: unknown) => setIconField(sel.ref, sel.iconIndex, key, value);
  const glow = icon.glow as Glow | undefined;
  const setGlow = (patch: Partial<Glow> | undefined) =>
    setF('glow', patch === undefined ? undefined : { ...glow, ...patch });

  function pickRule(type: string) {
    if (!type) return setF('glow', undefined);
    const next: Glow = {
      type,
      color: glow?.color ?? [1, 1, 1, 1],
      // taxonomy default: passive buff-up state = Pixel; every "act now" cue = Action Button Glow
      glowType: glow?.glowType ?? (type === 'buff' ? 'Pixel' : 'buttonOverlay'),
    };
    if (type === 'buff' || type === 'buffMissing') next.buff = glow?.buff ?? (icon.label || '');
    if (type === 'readyPower') next.power = glow?.power ?? 50;
    if (type === 'powerPct') next.pct = glow?.pct ?? 60;
    if (type === 'targetHealthBelow') next.pct = glow?.pct ?? 35;
    setF('glow', next);
  }

  const rule = glow?.type ?? '';
  return (
    <div className={s.group}>
      <h3>Icon: {icon.label ?? String(icon.spell)}</h3>
      <div className={s.field}>
        <label>Glow rule</label>
        <select className={s.tin} value={rule} onChange={(e) => pickRule(e.target.value)}>
          {GLOW_RULES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      {(rule === 'buff' || rule === 'buffMissing') && (
        <div className={s.field}>
          <label>Buff name</label>
          <input className={s.tin} type="text" value={glow?.buff ?? ''}
            onChange={(e) => setGlow({ buff: e.target.value })} />
        </div>
      )}
      {rule === 'readyPower' && (
        <div className={s.field}>
          <label>Power &gt;=</label>
          <input className={s.num} type="number" value={glow?.power ?? 50}
            onChange={(e) => setGlow({ power: Number(e.target.value) })} />
        </div>
      )}
      {(rule === 'powerPct' || rule === 'targetHealthBelow') && (
        <div className={s.field}>
          <label>{rule === 'powerPct' ? 'Power % >=' : 'Target HP % <'}</label>
          <input className={s.num} type="number" min={1} max={100} value={glow?.pct ?? 35}
            onChange={(e) => setGlow({ pct: Number(e.target.value) })} />
        </div>
      )}
      {rule && (
        <>
          <div className={s.field}>
            <label>Glow style</label>
            <select className={s.tin} value={glow?.glowType ?? 'buttonOverlay'} onChange={(e) => setGlow({ glowType: e.target.value })}>
              {GLOW_STYLES.map((v) => <option key={v} value={v}>{v === 'buttonOverlay' ? 'Action Button' : v}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label>Glow color</label>
            <input type="color" value={toHex(glow?.color)} onChange={(e) => setGlow({ color: fromHex(e.target.value) })} />
          </div>
        </>
      )}
      <div className={s.toggle}>
        <span>Charge count</span>
        <button className={s.tk} aria-pressed={!!icon.charges} onClick={() => setF('charges', icon.charges ? undefined : true)} />
      </div>
      <div className={s.field}>
        <label>Show at power &gt;=</label>
        <input className={s.num} type="number" min={0} placeholder="off"
          value={Number(icon.showPowerAbove ?? 0)}
          onChange={(e) => setF('showPowerAbove', Number(e.target.value) || undefined)} />
      </div>
      <p className={s.note}>0 = always shown. One glow rule per icon (glow style = urgency, color = meaning).</p>
      <div className={s.addrow}>
        <button className={s.add} onClick={() => select(null)}>Done</button>
      </div>
    </div>
  );
}

// Inline fields for the element kinds whose data is a buff name (the SPEC-shipped rows keep their curated data).
function ElementFields({ el, index }: { el: El; index: number }) {
  const setElementField = useStore((st) => st.setElementField);
  if (el.kind === 'uptimeBar' && typeof el.buff === 'string') {
    return (
      <div className={s.field}>
        <label>Buff</label>
        <input className={s.tin} type="text" value={el.buff}
          onChange={(e) => {
            setElementField(index, 'buff', e.target.value);
            setElementField(index, 'label', `${e.target.value}  %p`);
            setElementField(index, 'warnText', e.target.value.toUpperCase() + ' MISSING');
          }} />
      </div>
    );
  }
  if (el.kind === 'stacks') {
    return (
      <div className={s.field}>
        <label>Buff</label>
        <span className={s.rowActs}>
          <input className={s.tin} style={{ width: 96 }} type="text" value={(el.auraNames as string[])?.[0] ?? ''}
            onChange={(e) => setElementField(index, 'auraNames', [e.target.value])} />
          <input className={s.num} style={{ width: 52 }} type="number" min={2} max={12} title="Boxes"
            value={Number(el.count ?? 5)}
            onChange={(e) => setElementField(index, 'count', Number(e.target.value))} />
        </span>
      </div>
    );
  }
  return null;
}

export function Inspector({ slug }: { slug: string }) {
  const spec = useStore((st) => st.spec);
  const sel = useStore((st) => st.sel);
  const setGlobal = useStore((st) => st.setGlobal);
  const setCombatOnly = useStore((st) => st.setCombatOnly);
  const toggleElement = useStore((st) => st.toggleElement);
  const setElementField = useStore((st) => st.setElementField);
  const addElement = useStore((st) => st.addElement);
  const removeElement = useStore((st) => st.removeElement);

  const powerBars = spec.stack.map((el, i) => [el, i] as const).filter(([el]) => el.kind === 'powerBar');
  const confirmed = powerIndexConfirmed(slug);
  const selIcon = sel == null ? undefined
    : (sel.ref === 'left' ? spec.left : sel.ref === 'right' ? spec.right : spec.stack[sel.ref])?.icons?.[sel.iconIndex];

  function addBar(key: keyof typeof BAR_PRESETS) {
    const preset = BAR_PRESETS[key];
    const taken = new Set(spec.stack.map((el) => effectiveId(spec, el)).filter(Boolean));
    const base = `${spec.id} ${preset.title}`;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base} ${n}`;
    addElement({ ...preset.el, id });
  }

  return (
    <aside className={`${s.pane} ${s.right}`}>
      <div className={s.paneHead}><h2>Inspector</h2><span className={s.hint}>{sel && selIcon ? 'Icon' : 'Global'}</span></div>
      <div className={s.insp}>
        {sel && selIcon && <IconPanel sel={sel} icon={selIcon} />}

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
          <div className={s.toggle}>
            <span>Combat only</span>
            <button className={s.tk} aria-pressed={!!spec.combatOnly} onClick={() => setCombatOnly(!spec.combatOnly)} />
          </div>
        </div>

        {powerBars.length > 0 && (
          <div className={s.group}>
            <h3>Resource</h3>
            {powerBars.map(([el, i]) => (
              <div className={s.field} key={el._uid ?? i}>
                <label>{elementLabel(el)} index</label>
                <input className={s.num} type="number" min={0} max={20}
                  value={Number(el.powerType ?? 0)}
                  onChange={(e) => setElementField(i, 'powerType', Number(e.target.value))} />
              </div>
            ))}
            {!confirmed && <p className={s.note}>Unconfirmed for this class — verify in-game (UnitPower) and set the right index. Names don't map to standard indices on this realm.</p>}
          </div>
        )}

        <div className={s.group}>
          <h3>Elements</h3>
          {spec.stack.map((el, i) => (
            <div key={el._uid ?? i}>
              <div className={s.toggle}>
                <span>{elementLabel(el)}</span>
                <span className={s.rowActs}>
                  {REMOVABLE.has(el.kind) && (
                    <button className={s.del} title="Remove" onClick={() => removeElement(i)}>&times;</button>
                  )}
                  <button className={s.tk} aria-pressed={el.enabled !== false} onClick={() => toggleElement(i)} />
                </span>
              </div>
              <ElementFields el={el} index={i} />
            </div>
          ))}
          <div className={s.addrow} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(BAR_PRESETS) as (keyof typeof BAR_PRESETS)[]).map((k) => (
              <button key={k} className={s.add} onClick={() => addBar(k)}>+ {BAR_PRESETS[k].title}</button>
            ))}
          </div>
          <p className={s.note}>Drag an element's grip in the preview to reorder the stack (bars above or below any CD row). Side columns stay put. Click an icon to edit its glow.</p>
        </div>
      </div>
    </aside>
  );
}

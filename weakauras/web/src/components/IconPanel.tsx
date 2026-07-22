import { useStore, type Ref, type IconCfg } from '../store';
import { Group, Field, Note, ToggleRow, SubHead, toHex, fromHex, GLOW_STYLES } from './inspector-bits';
import { ICON_INFO, PROC_INFO, GLOW_STYLE_INFO, GLOW_COLOR_INFO } from './inspector-help';
import { ClauseList, GATING, clauseType, defaultClause, type Clause } from './clauses';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

// The ONE unified per-icon panel (replaces the old cdRow IconPanel + ProcPanel). Every icon is `iconRow`:
//   SHOW  Always | Show when <showWhen[]>   ·   GLOW  While shown | Only when <glow.when[]>
// A segmented toggle makes the always-vs-conditional state explicit (the empty condition list was ambiguous):
// picking "Show when…" / "Only when…" seeds a first clause; clearing the list returns to Always / While shown.

type Glow = { color?: number[]; glowType?: string; when?: Clause[] };
type Display = { timer?: string; stacks?: boolean; cooldownNumbers?: boolean; desaturateOnCd?: boolean };

// A two-option segmented control (shadcn ToggleGroup, single-select, always one active).
function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <ToggleGroup type="single" size="sm" value={value} onValueChange={(v) => v && onChange(v)} className="mb-2.5">
      {options.map(([v, label]) => <ToggleGroupItem key={v} value={v} className="px-3">{label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

export function IconPanel({ sel, icon }: { sel: { ref: Ref; iconIndex: number }; icon: IconCfg }) {
  const setIconField = useStore((st) => st.setIconField);
  const setF = (key: string, value: unknown) => setIconField(sel.ref, sel.iconIndex, key, value);

  const showWhen = (icon.showWhen as Clause[] | undefined) ?? [];
  const gated = showWhen.length > 0;
  const glow = icon.glow as Glow | undefined;
  const glowWhen = glow?.when ?? [];
  const glowGated = glowWhen.length > 0;
  const display = (icon.display as Display) ?? {};
  const collapse = (icon.hide as string) === 'collapse';
  const badCollapse = collapse && showWhen.some((cl) => !GATING.has(clauseType(cl)));
  const hasAura = [...showWhen, ...glowWhen].some((cl) => ['buff', 'anyBuff', 'buffStacks'].includes(clauseType(cl)));

  // desaturate-on-cooldown: iconElement defaults it ON for an always-visible icon with a spell (cd-like),
  // OFF for a gated one. Reflect the EFFECTIVE state, and only store the field when it overrides that default.
  const desatDefault = !gated && icon.spell != null;
  const desatOn = display.desaturateOnCd !== undefined ? !!display.desaturateOnCd : desatDefault;

  const setDisplay = (patch: Display) => {
    const d: Display = { ...display, ...patch };
    if (!d.stacks) delete d.stacks;
    if (d.cooldownNumbers !== false) delete d.cooldownNumbers;
    if (d.desaturateOnCd === desatDefault) delete d.desaturateOnCd;   // omit when it matches the generator default
    if (!d.timer || d.timer === 'cooldown') delete d.timer;
    setF('display', Object.keys(d).length ? d : undefined);
  };

  // switch SHOW mode: "always" clears the gate; "when" seeds a first clause so the mode sticks.
  const setShowMode = (m: string) => {
    if (m === 'always') { setF('showWhen', undefined); setF('hide', undefined); }
    else if (!gated) setF('showWhen', [defaultClause('buff', icon)]);
  };
  // switch GLOW mode: "always" drops the extra conditions (glow whenever shown); "when" seeds a first clause.
  const setGlowMode = (m: string) => {
    if (!glow) return;
    if (m === 'always') { const { when: _o, ...rest } = glow; void _o; setF('glow', rest); }
    else if (!glowGated) setF('glow', { ...glow, when: [defaultClause('buff', icon)] });
  };

  return (
    <Group title={`Icon: ${icon.label ?? String(icon.spell ?? '')}`} info={ICON_INFO.group}>
      <SubHead info={ICON_INFO.showWhen}>Show</SubHead>
      <Segmented value={gated ? 'when' : 'always'} onChange={setShowMode}
        options={[['always', 'Always'], ['when', 'Show when…']]} />
      {!gated ? (
        <Note>This icon is always visible.</Note>
      ) : (
        <>
          <Note>All of these conditions must pass:</Note>
          <ClauseList clauses={showWhen} icon={icon} addLabel="condition" removableToZero
            onChange={(w) => { setF('showWhen', w.length ? w : undefined); if (!w.length) setF('hide', undefined); }} />
          <Field label="While hidden" info={PROC_INFO.hide}>
            <Select value={collapse ? 'collapse' : 'slot'} onValueChange={(v) => setF('hide', v === 'collapse' ? 'collapse' : undefined)}>
              <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="slot">Keeps its slot</SelectItem>
                <SelectItem value="collapse">Row recenters</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {badCollapse && <Note>"Row recenters" only supports buff / any-of / target HP / power / stealable conditions — switch to "Keeps its slot" or remove the others.</Note>}
        </>
      )}

      <ToggleRow label="Glow" on={!!glow} onToggle={() => setF('glow', glow ? undefined : {})} info={PROC_INFO.glowToggle} />
      {glow && (
        <>
          <Field label="Glow style" info={GLOW_STYLE_INFO}>
            <Select value={glow.glowType ?? 'buttonOverlay'} onValueChange={(v) => setF('glow', { ...glow, glowType: v })}>
              <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GLOW_STYLES.map((v) => <SelectItem key={v} value={v}>{v === 'buttonOverlay' ? 'Action Button' : v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Glow color" info={GLOW_COLOR_INFO}>
            <input type="color" value={toHex(glow.color)} onChange={(e) => setF('glow', { ...glow, color: fromHex(e.target.value) })}
              className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5" />
          </Field>
          <SubHead info={PROC_INFO.glowExtra}>Glow when</SubHead>
          <Segmented value={glowGated ? 'when' : 'always'} onChange={setGlowMode}
            options={[['always', 'While shown'], ['when', 'Only when…']]} />
          {!glowGated ? (
            <Note>Glows whenever the icon is shown.</Note>
          ) : (
            <>
              <Note>All of these conditions must pass:</Note>
              <ClauseList clauses={glowWhen} icon={icon} addLabel="glow condition" removableToZero
                onChange={(w) => { const { when: _o, ...rest } = glow; void _o; setF('glow', w.length ? { ...rest, when: w } : rest); }} />
            </>
          )}
        </>
      )}

      <SubHead>Display</SubHead>
      <Field label="Timer / swipe" info={PROC_INFO.timer}>
        <Select value={display.timer ?? 'cooldown'} onValueChange={(v) => setDisplay({ timer: v })}>
          <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cooldown">Spell cooldown</SelectItem>
            <SelectItem value="buff" disabled={!hasAura}>Buff duration</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <ToggleRow label="Charge count" on={!!icon.charges} onToggle={() => setF('charges', icon.charges ? undefined : true)} info={ICON_INFO.charges} />
      <ToggleRow label="Stack count" on={!!display.stacks} onToggle={() => setDisplay({ stacks: !display.stacks })} info={PROC_INFO.stacks} />
      <ToggleRow label="Cooldown numbers" on={display.cooldownNumbers !== false} onToggle={() => setDisplay({ cooldownNumbers: display.cooldownNumbers === false })} info={PROC_INFO.cooldownNumbers} />
      <ToggleRow label="Grey while on CD" on={desatOn} onToggle={() => setDisplay({ desaturateOnCd: !desatOn })} info={PROC_INFO.desaturate} />
    </Group>
  );
}

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from './ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

// Small presentational helpers shared by the inspector panels (Inspector.tsx, ProcPanel.tsx).

export const GLOW_STYLES = ['buttonOverlay', 'Pixel', 'ACShine'];
export const NONE = '__none__'; // Radix Select forbids an empty-string item value

export const toHex = (c?: number[]) =>
  '#' + (c ?? [1, 1, 1]).slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string): number[] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);

// Hover "i" that explains a control's behaviour. Portaled (via TooltipContent) so it isn't clipped by the
// inspector's overflow-auto pane. Self-contained: <Tooltip> carries its own provider.
export const InfoTip = ({ text }: { text: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        tabIndex={-1}
        aria-label="What does this do?"
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Info className="size-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>{text}</TooltipContent>
  </Tooltip>
);

export const Group = ({ title, children, info }: { title: string; children: ReactNode; info?: ReactNode }) => (
  <div className="mb-6">
    <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
      {info && <InfoTip text={info} />}
    </h3>
    {children}
  </div>
);
export const Field = ({ label, children, className, info }: { label: ReactNode; children: ReactNode; className?: string; info?: ReactNode }) => (
  <div className={cn('mb-3.5 grid grid-cols-[1fr_auto] items-center gap-2.5', className)}>
    <label className="flex items-center gap-1.5 text-sm">
      {label}
      {info && <InfoTip text={info} />}
    </label>
    {children}
  </div>
);
export const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
);
export const ToggleRow = ({ label, on, onToggle, extra, info }: { label: ReactNode; on: boolean; onToggle: () => void; extra?: ReactNode; info?: ReactNode }) => (
  <div className="flex items-center justify-between border-t py-2.5 text-sm first:border-t-0">
    <span className="flex items-center gap-1.5">
      {label}
      {info && <InfoTip text={info} />}
    </span>
    <span className="flex items-center gap-2.5">
      {extra}
      <Switch checked={on} onCheckedChange={onToggle} />
    </span>
  </div>
);
export const numCls = 'h-8 w-[74px] text-right font-mono';

// A small subheading (e.g. "Show when (all must pass)") with an optional info "i".
export const SubHead = ({ children, info }: { children: ReactNode; info?: ReactNode }) => (
  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    {children}
    {info && <InfoTip text={info} />}
  </div>
);

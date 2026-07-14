import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Switch } from './ui/switch';

// Small presentational helpers shared by the inspector panels (Inspector.tsx, ProcPanel.tsx).

export const GLOW_STYLES = ['buttonOverlay', 'Pixel', 'ACShine'];
export const NONE = '__none__'; // Radix Select forbids an empty-string item value

export const toHex = (c?: number[]) =>
  '#' + (c ?? [1, 1, 1]).slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string): number[] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);

export const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mb-6">
    <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </div>
);
export const Field = ({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) => (
  <div className={cn('mb-3.5 grid grid-cols-[1fr_auto] items-center gap-2.5', className)}>
    <label className="text-sm">{label}</label>
    {children}
  </div>
);
export const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
);
export const ToggleRow = ({ label, on, onToggle, extra }: { label: ReactNode; on: boolean; onToggle: () => void; extra?: ReactNode }) => (
  <div className="flex items-center justify-between border-t py-2.5 text-sm first:border-t-0">
    <span>{label}</span>
    <span className="flex items-center gap-2.5">
      {extra}
      <Switch checked={on} onCheckedChange={onToggle} />
    </span>
  </div>
);
export const numCls = 'h-8 w-[74px] text-right font-mono';

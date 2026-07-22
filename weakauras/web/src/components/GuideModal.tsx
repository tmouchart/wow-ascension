import { BookOpen, Eye, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

// "Guide" walkthrough: what the app does and how the 4 zones fit together. Hand-rolled overlay to match
// WelcomeModal / ExportModal (no radix Dialog dep).
export function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold leading-tight tracking-tight">How Forge works</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a ready-to-use WeakAuras HUD for your Conquest of Azeroth class — no WeakAuras knowledge
          needed.
        </p>

        <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Pick your class &amp; spec</span> (top left) — a
            complete preset loads instantly.
          </li>
          <li>
            <span className="font-medium text-foreground">Customize it</span> — optional, the preset works
            as-is.
          </li>
          <li>
            <span className="font-medium text-foreground">Export to WoW</span> — copy the string, type{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">/wa</code>{' '}
            in-game and paste it. Done.
          </li>
        </ol>

        <div className="mt-5 space-y-2.5 text-sm text-muted-foreground">
          <div className="flex items-start gap-2.5">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Left — Spellbook.</span> Drag an ability onto an
              icon row to add it.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Center — Live preview.</span> Your WA as it will
              look in-game. Click an element to select it, drag to reorder.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Right — Inspector.</span> Settings for the
              selected element: colors, glows, sizes…
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">Bottom — AI assistant.</span> Describe a change
              in plain words ("make the health bar bigger") and it edits for you.
            </span>
          </div>
        </div>

        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          Your work is autosaved per class &amp; spec. Use <span className="font-medium text-foreground">Save
          as</span> for named snapshots, the ↺ button to revert to the preset, and{' '}
          <span className="font-medium text-foreground">Import string</span> to keep editing a string Forge
          generated earlier.
        </p>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

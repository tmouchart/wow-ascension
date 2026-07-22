import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
import { generateString } from '../lib/generate';
import { useStore, activeSpec } from '../store';

// "Export to WoW" walkthrough: copy the string (never displayed — it can be 10k+ chars) + the in-game
// steps. Hand-rolled overlay to match WelcomeModal (no radix Dialog dep).
export function ExportModal({ onClose }: { onClose: () => void }) {
  const storeSpec = useStore((st) => st.spec);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function copyString() {
    setBusy(true); setError(''); setCopied(false);
    try {
      const str = await generateString(activeSpec(storeSpec));
      await navigator.clipboard.writeText(str);
      setCopied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold leading-tight tracking-tight">Export to WoW</h2>

        <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-muted-foreground">
          <li>Copy the import string below.</li>
          <li>
            In-game, open <span className="font-medium text-foreground">WeakAuras</span> (type{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">/wa</code> in
            the chat) and click <span className="font-medium text-foreground">Import</span>.
          </li>
          <li>Paste the string and confirm.</li>
        </ol>

        <Button onClick={copyString} disabled={busy} className="mt-5 w-full">
          {busy ? (
            'Generating…'
          ) : copied ? (
            <>
              <Check /> Copied successfully
            </>
          ) : (
            <>
              <Copy /> Copy import string
            </>
          )}
        </Button>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

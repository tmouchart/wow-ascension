import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { CLASS_COLORS, classVars } from '@/lib/class-theme';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Dev-only preview (#kitchen-sink): every class color applied as the app primary, on real components. */
export function KitchenSink() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-lg font-bold">Class colors — kitchen sink</h1>
        <span className="text-xs text-muted-foreground">
          21 classes, each applied as <code>--primary</code> on real components
        </span>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setDark((d) => !d)}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {CLASS_COLORS.map((c) => (
          <div key={c.classId} style={classVars(c)} className="rounded-lg border border-primary/30 bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="size-3 rounded-full bg-primary" />
              <span className="font-bold text-primary">{c.name}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {c.ui ? `${c.ui} (wa ${c.hex})` : c.hex}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Generate</Button>
              <Button size="sm" variant="outline">
                Preview
              </Button>
              <Button size="sm" variant="ghost" className="text-primary">
                Copy
              </Button>
              <Badge>{c.slug}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

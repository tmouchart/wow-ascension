import { useState } from 'react';
import { Bug, Check, Lightbulb } from 'lucide-react';
import { Button } from './ui/button';
import { track } from '../lib/analytics';

export type FeedbackType = 'suggestion' | 'bug';

const COPY: Record<FeedbackType, { icon: typeof Lightbulb; title: string; hint: string; placeholder: string }> = {
  suggestion: {
    icon: Lightbulb,
    title: 'Suggest an improvement',
    hint: 'An idea, a missing feature, anything that would make Auraforge better.',
    placeholder: 'It would be great if…',
  },
  bug: {
    icon: Bug,
    title: 'Report a bug',
    hint: 'What happened, and what did you expect instead? The more detail the better.',
    placeholder: 'When I click on…',
  },
};

// Free-text feedback captured as a PostHog event. Hand-rolled overlay to match GuideModal /
// WelcomeModal / ExportModal (no radix Dialog dep).
export function FeedbackModal({ type, slug, onClose }: { type: FeedbackType; slug: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const { icon: Icon, title, hint, placeholder } = COPY[type];

  function send() {
    if (!message.trim()) return;
    track('feedback_submitted', { type, message: message.trim(), slug });
    setSent(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="flex items-center gap-2.5 py-4 text-sm font-medium">
            <Check className="size-5 text-primary" /> Thanks for the feedback!
          </div>
        ) : (
          <>
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight tracking-tight">
              <Icon className="size-5 text-primary" /> {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder}
              className="mt-4 h-32 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={send} disabled={!message.trim()}>Send</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

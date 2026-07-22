import posthog from 'posthog-js';

// Product analytics + session replay. Prod-only so dev sessions don't pollute the stats;
// set localStorage['waforge.ph'] = '1' (then reload) to force-enable in dev for testing.
const enabled = import.meta.env.PROD || !!localStorage.getItem('waforge.ph');

if (enabled) {
  // Project token — public by design (it ships in every browser bundle).
  posthog.init('phc_os6sM9izXD2hXoiK6cfu59PFsobJy3nSs3PrXdQWrb56', {
    api_host: 'https://eu.i.posthog.com',
    defaults: '2026-06-25',
    // No login: every visitor is an anonymous distinct_id persisted in this browser. 'always'
    // gives each one a Person profile so the People tab shows per-user history + replays.
    person_profiles: 'always',
    // Auto-inject X-POSTHOG-DISTINCT-ID / X-POSTHOG-SESSION-ID on our /api calls so backend
    // events and LLM traces land on the same person + session (server.mjs analyticsContext).
    tracing_headers: ['wa-forge.fly.dev', 'localhost'],
    // No login/PII anywhere in the app — unmasked inputs make replays actually useful
    // (agent prompts, pasted WA strings).
    session_recording: { maskAllInputs: false },
    enable_recording_console_log: true,
    capture_exceptions: true,
  });
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (enabled) posthog.capture(event, properties);
}

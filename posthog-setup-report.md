# PostHog post-wizard report

The wizard integrated the `posthog-node` SDK into the server-side Hono application, configured environment-based initialization with exception autocapture, and added awaited delivery for meaningful import, validation, and AI-agent workflow events. Anonymous request correlation uses incoming PostHog distinct/session headers when available without creating person profiles.

| Event | Description | File |
|---|---|---|
| `weakaura_imported` | A WeakAuras import string was successfully decoded, reconstructed, and validated. | `weakauras/server/server.mjs` |
| `spec_validated` | A submitted WeakAuras specification passed server-side validation. | `weakauras/server/server.mjs` |
| `agent_run_started` | A user started an AI-assisted WeakAuras specification editing run. | `weakauras/server/server.mjs` |
| `agent_run_completed` | An AI-assisted WeakAuras specification editing run completed successfully. | `weakauras/server/server.mjs` |

## Next steps

We've built insights and a dashboard to monitor the instrumented behavior:

- [Analytics basics dashboard](https://eu.posthog.com/project/230346/dashboard/841648)
- [Agent completion funnel](https://eu.posthog.com/project/230346/insights/pGiaSSoW)
- [Successful imports](https://eu.posthog.com/project/230346/insights/foDl3E5I)
- [Successful validations](https://eu.posthog.com/project/230346/insights/4ZX62Brq)
- [Agent completions by model](https://eu.posthog.com/project/230346/insights/WMWavG8e)

## Verify before merging

- [ ] Run a full production build and resolve the existing `Preview.tsx` implicit-`any` error and missing `radix-ui` module/type error.
- [ ] Run the test suite — call sites that were instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Connect the discovered OpenRouter data source to PostHog's data warehouse with `npx @posthog/wizard warehouse`.

### Agent skill

We've left an agent skill folder in the project. This context can support further agent development with current PostHog integration practices.

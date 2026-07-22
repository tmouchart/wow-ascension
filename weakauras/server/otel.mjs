// OpenTelemetry -> PostHog LLM analytics. Two pieces, both required:
//  1. NodeSDK + PostHogSpanProcessor: forwards ONLY AI spans (gen_ai./ai./llm. prefixes) to PostHog's
//     OTLP endpoint, where they become $ai_generation/$ai_span events. Everything else is dropped.
//  2. registerTelemetry(new OpenTelemetry(...)): AI SDK v7 emits NO spans unless a telemetry
//     integration is registered (the old experimental_telemetry-only path is dead). enrichSpan maps
//     the per-call `runtimeContext.posthog` object (set in agent.mjs) onto every span — that's how
//     `posthog.distinct_id` (event identity, verified empirically) and `$session_id` (links the
//     trace to the session replay) reach the ingested events.
// Imported for its side effect at the top of server.mjs; no-op without the env vars.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PostHogSpanProcessor } from '@posthog/ai/otel';
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';

if (process.env.POSTHOG_PROJECT_TOKEN && process.env.POSTHOG_HOST) {
  new NodeSDK({
    resource: resourceFromAttributes({ 'service.name': 'wa-forge' }),
    spanProcessors: [
      new PostHogSpanProcessor({
        projectToken: process.env.POSTHOG_PROJECT_TOKEN,
        host: process.env.POSTHOG_HOST,
      }),
    ],
  }).start();
  registerTelemetry(new OpenTelemetry({
    enrichSpan: ({ runtimeContext }) => runtimeContext?.posthog,
  }));
}

# Full-stack build for Auraforge: the Hono server (server/server.mjs) serves the API (/api/import,
# /api/agent) AND the built SPA in one Node process, so the frontend calls /api/* same-origin.
# Build context = the weakauras/ repo root (NOT web/) because the Vite build reads ../../registry/INDEX.json
# and ../../../classes/*/spec.json, gen.mjs bundles ../lib/browser-entry.mjs, and the server requires
# ../lib + ../registry at runtime — all live outside web/.

# --- web build stage: produce web/dist ---
FROM node:24-alpine AS webbuild
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
COPY lib ./lib
COPY classes ./classes
COPY registry ./registry
RUN cd web && npm run build

# --- server deps stage: production node_modules for the Hono server ---
FROM node:24-alpine AS serverdeps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# --- run stage ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# server code + its runtime data deps (lib is zero-dep; spec-ops reads registry/<slug>.json)
COPY server ./server
COPY lib ./lib
COPY registry ./registry
COPY --from=serverdeps /app/server/node_modules ./server/node_modules
COPY --from=webbuild /app/web/dist ./web/dist
EXPOSE 8080
# STATIC_DIR (set in fly.toml) makes the server serve ./web/dist; PORT is provided by fly.
CMD ["node", "server/server.mjs"]

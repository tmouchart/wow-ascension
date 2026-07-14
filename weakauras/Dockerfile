# Static SPA build for the WA-Forge web editor, served by nginx. Multi-stage so `fly deploy` is one
# self-contained command (no local `npm run build` needed first). Build context = the weakauras/ repo root
# (NOT web/) because the Vite build reads ../../registry/INDEX.json and ../../../classes/*/spec.json, and
# gen.mjs bundles ../lib/browser-entry.mjs — all live outside web/.

# --- build stage ---
FROM node:24-alpine AS build
WORKDIR /app
# deps first so the layer caches across source-only changes
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
# the sources the build touches (web app + the parent dirs it imports at build time)
COPY web ./web
COPY lib ./lib
COPY classes ./classes
COPY registry ./registry
RUN cd web && npm run build

# --- serve stage ---
FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 8080

# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@8.6.7 --activate && chmod -R a+rX /opt/corepack
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY apps/router/package.json apps/router/
COPY apps/functions/package.json apps/functions/
COPY packages/auth/package.json packages/auth/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store pnpm install --frozen-lockfile --store-dir=/pnpm-store
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
# Build-only dummy values never become runtime image configuration.
RUN NODE_ENV=production DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_SECRET=build-only-placeholder-not-a-runtime-secret NEXT_TELEMETRY_DISABLED=1 \
    pnpm --filter @mcphosting/web build
RUN rm -rf apps/web/.next/cache

FROM base AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="MCP Static Hosting" \
      org.opencontainers.image.description="Self-hosted websites for AI agents over MCP" \
      org.opencontainers.image.source="https://github.com/reg2005/mcpStaticHosting" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/repos /data/snapshots /data/json-db && chown -R node:node /data
USER node
EXPOSE 3000 3001 3002
ENTRYPOINT ["node", "/app/scripts/entrypoint.mjs"]
CMD ["pnpm", "--filter", "@mcphosting/web", "start"]

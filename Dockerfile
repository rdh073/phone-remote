# syntax=docker/dockerfile:1.7

# ---- builder ----------------------------------------------------------------
FROM node:22-slim AS builder

# CI=true keeps pnpm non-interactive — without it the prod-prune step
# (`pnpm install --prod`) aborts on "no TTY" because it wants to confirm
# the modules-directory purge.
ENV CI=true

RUN corepack enable

WORKDIR /app

# Copy manifests first so the dependency-install layer caches across rebuilds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/hub/package.json ./apps/hub/
COPY apps/web/package.json ./apps/web/
COPY packages/protocol/package.json ./packages/protocol/

RUN pnpm install --frozen-lockfile

# Now copy sources and build the web bundle. The hub serves
# `apps/web/dist` via @fastify/static (path resolved from
# apps/hub/src/app.ts → ../../web/dist).
COPY tsconfig*.json ./
COPY packages ./packages
COPY apps/hub ./apps/hub
COPY apps/web ./apps/web

RUN pnpm -F @phone-remote/web build

# Strip dev dependencies — the runtime stage only needs prod deps. tsx is a
# runtime dep of the hub package so it survives this prune.
RUN pnpm install --prod --frozen-lockfile

# ---- runtime ----------------------------------------------------------------
FROM node:22-slim AS runtime

# Android platform-tools provides `adb`. Used by provisioning.ts for `adb pair`,
# `adb tcpip`, `adb connect` over the tailnet. Pinned to whatever Google
# publishes as `latest` at image-build time; the hub's runtime adb wire
# protocol is via Tango, not this binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip tini \
 && curl -fsSL -o /tmp/platform-tools.zip \
      https://dl.google.com/android/repository/platform-tools-latest-linux.zip \
 && unzip -q /tmp/platform-tools.zip -d /opt \
 && ln -s /opt/platform-tools/adb /usr/local/bin/adb \
 && rm /tmp/platform-tools.zip \
 && apt-get purge -y curl unzip \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/hub/src ./apps/hub/src
COPY --from=builder /app/apps/hub/package.json ./apps/hub/
COPY --from=builder /app/apps/hub/node_modules ./apps/hub/node_modules
COPY --from=builder /app/apps/web/dist ./apps/web/dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    ADB_PATH=/usr/local/bin/adb

EXPOSE 4000

# Run from the hub package so Node resolves `tsx` (a hub-package dep) via
# the standard walk-up node_modules lookup. The hub's own source still
# resolves apps/web/dist relative to its own __dirname, so this WORKDIR
# change doesn't affect static-file serving or env-file paths.
WORKDIR /app/apps/hub

# tini handles signal forwarding so SIGTERM from `docker stop` cleanly stops
# the Fastify server + the adb-server child (if ADB_AUTO_START=1).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "src/server.ts"]

FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium chromium-sandbox xvfb xauth fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/ndt
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force \
    && mkdir -p /data/profiles /data/output /opt/ndt/scripts \
    && chown -R node:node /data /opt/ndt
COPY --from=build --chown=node:node /build/dist ./dist
COPY --chown=node:node examples ./examples
COPY --chown=node:node README.md README.vi.md LICENSE CHANGELOG.md ./
ENV NDT_BROWSER_PATH=/usr/bin/chromium
USER node
CMD ["node", "dist/cli.js", "--help"]

FROM runtime AS test
COPY --chown=node:node test ./test
CMD ["node", "--test", "--test-concurrency=1", "test/*.test.mjs"]

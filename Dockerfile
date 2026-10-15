# syntax=docker/dockerfile:1

# ---------- deps: install node_modules (needs git for the GitHub dependency) ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git config --global url."https://github.com/".insteadOf ssh://git@github.com/ \
 && git config --global url."https://github.com/".insteadOf git@github.com:

# Use the system Chromium installed in the runtime image instead of Puppeteer's download
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime ----------
FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# WhatsApp session (LocalAuth) and web version cache live here; mount a volume to persist them
RUN mkdir -p .wwebjs_auth .wwebjs_cache && chown node:node /app .wwebjs_auth .wwebjs_cache
USER node

CMD ["node", "index.js"]

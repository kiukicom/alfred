# syntax=docker/dockerfile:1.7

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install all deps (including dev) against the lockfile
COPY package.json package-lock.json* ./
RUN npm ci

# Compile TypeScript
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# ---- production stage ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output
COPY --from=build /app/dist/ ./dist/

# Persist TOFU key pins, idempotency cache, message history
VOLUME ["/app/data"]

EXPOSE 3141

ENTRYPOINT ["node", "dist/cli.js", "--config", "/config/alfred.yaml"]

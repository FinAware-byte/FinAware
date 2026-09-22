# syntax=docker/dockerfile:1.7
# One image serves the web app (next start) and all nine Express microservices (tsx), so the runtime
# needs the production dependencies plus tsx and the Prisma CLI — but not the rest of the dev toolchain
# (typescript, eslint, prettier, tailwind, @types/*) and not the Next build cache.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --fund=false

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Why: the webpack cache is build-only and adds hundreds of MB to the image if it is copied along.
RUN npx prisma generate && npm run build && rm -rf .next/cache

# ---- Runtime dependencies only ----
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --fund=false \
 # tsx runs the services, prisma runs "db push" on start; both are devDependencies of the repo.
 && npm install --omit=dev --no-save --no-audit --fund=false tsx prisma
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/services ./services
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/package.json /app/next.config.mjs /app/tsconfig.json ./
EXPOSE 3000
CMD ["npm", "run", "start"]

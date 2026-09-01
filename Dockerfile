# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Build-time env is only needed to satisfy module init; real values come at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_STANDALONE_BUILD=1
RUN npm run build

# ---- runtime ----
FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

# Next.js standalone server + static assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Prisma: schema + migrations + generated client + engine + CLI for `migrate deploy`
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
# Worker deps (tsx + job source) for the separate worker container
COPY --from=build /app/node_modules/tsx ./node_modules/tsx
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
# Apply migrations then start the web server. Override CMD for the worker:
#   docker run ... node --import tsx src/jobs/worker.ts
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]

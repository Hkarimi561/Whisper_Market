# syntax=docker/dockerfile:1
# Multi-stage production build for Whisper Market (Next.js + Socket.IO custom server + Prisma).

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- 1. dependencies -------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# package-lock.json is intentionally not copied (see .dockerignore): the lockfile in a developer
# checkout may point to a private registry that is not reachable from the build.
COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ---- 2. build ---------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# ---- 3. runtime ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# node_modules is kept whole on purpose: the custom server runs through tsx and migrations need the prisma CLI.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json /app/server.ts /app/next.config.ts /app/tsconfig.json /app/docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "docker-entrypoint.sh"]

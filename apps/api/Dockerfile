# Build context: repository root  →  docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build -w @wayline/api && npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production MIGRATIONS_DIR=/app/sql
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
COPY infra/sql ./sql
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "dist/main.js"]

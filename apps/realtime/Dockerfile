# 실시간 서버(socket.io) — 빌드 컨텍스트는 저장소 루트다(shared/ 계약을 함께 컴파일한다).
# 컨텍스트에 넣을 파일은 옆의 Dockerfile.dockerignore가 정한다(루트 .dockerignore는 apps를 뺀다)

# ── 빌드 ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo/apps/realtime
COPY apps/realtime/package*.json ./
RUN npm ci
COPY shared /repo/shared
COPY apps/realtime ./
RUN npm run build && npm prune --omit=dev

# ── 실행 ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/realtime/node_modules ./node_modules
COPY --from=builder /repo/apps/realtime/dist ./dist

USER node
EXPOSE 9002
CMD ["node", "dist/apps/realtime/src/main"]

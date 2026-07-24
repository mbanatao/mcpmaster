FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/meta-business-mcp/ ./apps/meta-business-mcp/

RUN npm run build:shared-security && npm run build:meta

FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init \
  && addgroup -g 1001 -S nodejs \
  && adduser -S meta-mcp -u 1001 -G nodejs

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=meta-mcp:nodejs /app/packages/shared-security/dist ./packages/shared-security/dist
COPY --from=builder --chown=meta-mcp:nodejs /app/apps/meta-business-mcp/dist ./apps/meta-business-mcp/dist

USER meta-mcp
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3200/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/meta-business-mcp/dist/remote-server.js"]

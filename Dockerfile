FROM node:18-alpine

WORKDIR /app

# curl is needed for the HEALTHCHECK instruction below
RUN apk add --no-cache openssl libc6-compat curl

# Create non-root user before any COPY so --chown works without a large chown -R
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --chown=appuser:appgroup package*.json ./

RUN npm install

COPY --chown=appuser:appgroup . .

# Generate Prisma Client
RUN npx prisma generate

# Create logs directory with correct ownership before switching to non-root user
RUN mkdir -p /app/logs && chown appuser:appgroup /app/logs

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["npm", "start"]

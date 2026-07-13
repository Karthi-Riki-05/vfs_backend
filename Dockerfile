FROM node:18-alpine

WORKDIR /app

# curl is needed for the HEALTHCHECK instruction below
RUN apk add --no-cache openssl libc6-compat curl

# Create non-root user before any COPY so --chown works without a large chown -R.
# Also own /app itself, and switch to this user BEFORE npm install/prisma
# generate run — otherwise those steps write root-owned files (node_modules,
# the generated .prisma/client) that the runtime appuser can later neither
# regenerate nor overwrite (EACCES on `prisma db push`/`generate` at runtime).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown appuser:appgroup /app

COPY --chown=appuser:appgroup package*.json ./

USER appuser

RUN npm install

COPY --chown=appuser:appgroup . .

# Generate Prisma Client (as appuser — see ownership note above)
RUN npx prisma generate

# winston's File transport requires this directory to exist up front
RUN mkdir -p /app/logs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["npm", "start"]

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# curl is needed for the HEALTHCHECK instruction below
RUN apk add --no-cache openssl libc6-compat curl

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Non-root user — reduces blast radius if the container is compromised
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["npm", "start"]

# ── Stage 1: Install dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set backend URL for Docker networking
ENV BACKEND_URL=http://backend:3000

RUN npm run build

# ── Stage 3: Production image ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV BACKEND_URL=http://backend:3000

# Ensure public dir exists in builder (may not exist in all projects)
RUN mkdir -p /tmp/empty

# Copy only what's needed for production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./

EXPOSE 3001

CMD ["npm", "run", "start"]

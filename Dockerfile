FROM node:22-slim

# Install git and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set default git identity for server operations
RUN git config --global user.name "Canopy Bot" && \
    git config --global user.email "bot@canopy.local" && \
    git config --global init.defaultBranch main

# Copy dependency manifests
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies without optional native compilation (Node 22 built-in node:sqlite is used)
RUN npm install --omit=optional

# Copy source code and build TypeScript
COPY . .
RUN npm run build

# Prune devDependencies to keep production container slim and fast
RUN npm prune --omit=dev

# Pre-seed the synthetic monorepo during build so container boot is instant (<50ms)
RUN mkdir -p /app/data && node --experimental-sqlite -e "import('./dist/seed.js').then(m => m.seedRepository('/app/data')).catch(e => { console.error(e); process.exit(1); })"

# Default environment configuration
ENV PORT=10000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PUBLIC_READONLY=true
ENV RATE_LIMIT_PER_MIN=60
ENV DAILY_TOKEN_CAP=200000
ENV NODE_OPTIONS="--experimental-sqlite"

EXPOSE 10000

# Docker healthcheck querying /healthz on $PORT using built-in Node fetch
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '10000') + '/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
